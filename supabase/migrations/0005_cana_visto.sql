-- Ruta de Bares - 0005: "Tirate una cana" sin "No me gusta": solo Me gusta y Visto.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0005.
-- Idempotente: se puede re-ejecutar.
--
-- Cambio de producto: la unica accion sobre una persona es Me gusta. Abrir su
-- ficha sin darle Me gusta la deja como "Visto" (value = 'seen'), y quitar un
-- Me gusta tambien. Los "No me gusta" que ya hubiera pasan a Visto: quien los
-- dio habia abierto la ficha. Reglas y decisiones: docs/TIRATE-UNA-CANA.md.
--
-- Nuevos codigos de error: ninguno. match_vote desaparece y la sustituyen
-- match_set_like y match_mark_seen.

-- ---------------------------------------------------------------------------
-- Valores del voto: 'like' o 'seen'
-- ---------------------------------------------------------------------------
-- En este orden: sin el check viejo se puede convertir 'dislike', y el nuevo
-- se anade cuando ya no queda ninguno.
alter table public.match_votes drop constraint if exists match_votes_value_check;
update public.match_votes set value = 'seen', updated_at = now() where value = 'dislike';
alter table public.match_votes
  add constraint match_votes_value_check check (value in ('like', 'seen'));

drop function if exists public.match_vote(uuid, uuid, text);

-- ---------------------------------------------------------------------------
-- Funcion interna
-- ---------------------------------------------------------------------------
create or replace function public.match_require_target(p_route_id uuid, p_user_id uuid, p_target_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_target_id is null or p_target_id = p_user_id then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if not public.match_is_active(p_target_id) or not public.is_route_participant(p_route_id, p_target_id) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visto y Me gusta
-- ---------------------------------------------------------------------------
-- La app la llama al abrir una ficha. Solo apunta la primera vez: nunca rebaja
-- un Me gusta a Visto. La otra persona no lo sabe (match_grid no lo ensena).
create or replace function public.match_mark_seen(p_route_id uuid, p_target_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.match_require_member(p_route_id);
begin
  perform public.match_require_target(p_route_id, v_uid, p_target_id);
  insert into public.match_votes (route_id, voter_id, target_id, value)
  values (p_route_id, v_uid, p_target_id, 'seen')
  on conflict (route_id, voter_id, target_id) do nothing;
end;
$$;

-- Dar (p_liked = true) o quitar (false) un Me gusta. Quitarlo deja a la
-- persona en Visto. Abre o cierra la conexion en la misma transaccion, con el
-- mismo cerrojo por pareja que responder a la pregunta de la cerveza.
create or replace function public.match_set_like(p_route_id uuid, p_target_id uuid, p_liked boolean)
returns table (my_vote text, connection_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := public.match_require_member(p_route_id);
  v_valor text;
  v_a     uuid;
  v_b     uuid;
  v_otro  text;
  v_conn  public.match_connections%rowtype;
begin
  if p_liked is null then
    raise exception 'INVALID_VOTE' using errcode = '22023';
  end if;
  perform public.match_require_target(p_route_id, v_uid, p_target_id);

  v_valor := case when p_liked then 'like' else 'seen' end;
  v_a := least(v_uid, p_target_id);
  v_b := greatest(v_uid, p_target_id);
  perform public.match_lock_pair(p_route_id, v_a, v_b);

  insert into public.match_votes (route_id, voter_id, target_id, value)
  values (p_route_id, v_uid, p_target_id, v_valor)
  on conflict (route_id, voter_id, target_id)
  do update set value = excluded.value, updated_at = now();

  select mv.value into v_otro
    from public.match_votes mv
   where mv.route_id = p_route_id and mv.voter_id = p_target_id and mv.target_id = v_uid;

  select * into v_conn
    from public.match_connections c
   where c.route_id = p_route_id and c.user_a = v_a and c.user_b = v_b
     for update;

  if p_liked and v_otro = 'like' then
    if v_conn.id is null then
      insert into public.match_connections (route_id, user_a, user_b)
      values (p_route_id, v_a, v_b)
      returning * into v_conn;
      insert into public.match_connection_members (connection_id, user_id)
      values (v_conn.id, v_a), (v_conn.id, v_b);
    elsif not v_conn.is_open then
      update public.match_connections c
         set is_open = true, opened_at = now(), closed_at = null
       where c.id = v_conn.id;
    end if;
    return query select v_valor, v_conn.id;
  else
    if v_conn.id is not null and v_conn.is_open then
      perform public.match_close_connection(v_conn.id);
    end if;
    return query select v_valor, null::uuid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- La pregunta de la cerveza: tras un No, quien rechaza queda en Visto
-- ---------------------------------------------------------------------------
-- Igual que en la 0003 salvo una linea: el voto de quien dice No pasa a
-- 'seen' (antes 'dislike'). Quien pregunto conserva su Me gusta (D2).
create or replace function public.match_answer_beer(p_connection_id uuid, p_answer text)
returns table (question_state text, is_open boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_conn  public.match_connections%rowtype := public.match_require_connection(p_connection_id, true);
  v_other uuid;
begin
  if p_answer is null or p_answer not in ('yes', 'no', 'later') then
    raise exception 'INVALID_ANSWER' using errcode = '22023';
  end if;
  if v_conn.question_state <> 'pending' then
    raise exception 'NO_PENDING_QUESTION' using errcode = 'P0001';
  end if;
  if v_conn.question_asked_by = v_uid then
    raise exception 'CANNOT_ANSWER_OWN_QUESTION' using errcode = 'P0001';
  end if;

  v_other := case when v_conn.user_a = v_uid then v_conn.user_b else v_conn.user_a end;

  if p_answer = 'no' then
    update public.match_connections c
       set question_state = 'rejected', question_answered_at = now()
     where c.id = v_conn.id;
    update public.match_votes mv
       set value = 'seen', updated_at = now()
     where mv.route_id = v_conn.route_id and mv.voter_id = v_uid and mv.target_id = v_other;
    perform public.match_close_connection(v_conn.id);
    return query select 'rejected'::text, false;
    return;
  end if;

  update public.match_connections c
     set question_state = case when p_answer = 'yes' then 'accepted' else 'postponed' end,
         question_answered_at = now(),
         postpone_count = c.postpone_count + case when p_answer = 'later' then 1 else 0 end
   where c.id = v_conn.id;

  insert into public.match_messages (connection_id, sender_id, kind, answer)
  values (v_conn.id, v_uid, 'answer', p_answer);

  return query
  select case when p_answer = 'yes' then 'accepted' else 'postponed' end, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
revoke all on function public.match_require_target(uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function
  public.match_mark_seen(uuid, uuid),
  public.match_set_like(uuid, uuid, boolean),
  public.match_answer_beer(uuid, text)
from public, anon;

grant execute on function
  public.match_mark_seen(uuid, uuid),
  public.match_set_like(uuid, uuid, boolean),
  public.match_answer_beer(uuid, text)
to authenticated;
