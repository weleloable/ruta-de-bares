-- Ruta de Bares - 0016: denunciar y bloquear exigen estar dentro y no sancionado.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0015.
-- Idempotente: se puede re-ejecutar.
--
-- Por que existe: `match_report` y `match_block` eran las dos unicas funciones
-- de la cana que no comprobaban NADA sobre quien llama. Todo lo demas
-- (match_grid, match_set_like, los chats) pasa por `match_require_member` o
-- `match_require_target`; estas dos no.
--
-- Efecto real, comprobado contra la API: una cuenta a la que se acaba de
-- SUSPENDER -- que por diseno solo deberia poder leer su aviso y llevarse sus
-- datos -- podia seguir metiendo denuncias contra la gente de la ruta de la que
-- se la echo, y bloquearla. Los uuid que hacen falta los tiene de cuando estaba
-- dentro (salen en las respuestas de la app y hasta en la URL de una ficha), asi
-- que no hay que adivinar nada: basta con repetir la peticion.
--
-- Que NO se comprueba, a proposito:
--   * Que la persona DENUNCIADA siga en la ruta. Se la puede haber expulsado ya,
--     o puede haberse ido, y denunciar lo que hizo antes tiene que seguir siendo
--     posible: el DSA pide que avisar de contenido ilicito sea facil, no que
--     llegue a tiempo.
--   * Nada sobre desbloquear: quitarse un bloqueo de encima no hace dano a nadie
--     y tiene que funcionar aunque estes sancionada.

-- ---------------------------------------------------------------------------
-- Denunciar: hay que estar en esa ruta y no estar suspendida
-- ---------------------------------------------------------------------------
create or replace function public.match_report(
  p_route_id uuid,
  p_target_id uuid,
  p_reason text,
  p_detail text default '',
  p_connection_id uuid default null,
  p_block boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_report uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  -- Antes que nada: una cuenta suspendida no tiene nada que hacer aqui.
  if public.esta_suspendida(v_uid) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;
  -- Y solo se denuncia lo que pasa en una ruta en la que estas.
  if not public.is_route_participant(p_route_id, v_uid) then
    raise exception 'NOT_PARTICIPANT' using errcode = 'P0001';
  end if;
  if p_target_id is null or p_target_id = v_uid then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('foto', 'acoso', 'suplantacion', 'menor', 'otro') then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;
  if char_length(coalesce(p_detail, '')) > 500 then
    raise exception 'DETAIL_TOO_LONG' using errcode = 'P0001';
  end if;
  -- Una denuncia viva por pareja: repetirla no ayuda a quien la revisa.
  if exists (
    select 1 from public.match_reports r
     where r.reporter_id = v_uid and r.reported_id = p_target_id and r.status <> 'resuelta'
  ) then
    raise exception 'REPORT_ALREADY_PENDING' using errcode = 'P0001';
  end if;

  insert into public.match_reports (reporter_id, reported_id, route_id, reason, detail)
  values (v_uid, p_target_id, p_route_id, p_reason, btrim(coalesce(p_detail, '')))
  returning id into v_report;

  -- La copia va ANTES del bloqueo: bloquear borra el chat, y sin copia la
  -- prueba desaparece justo cuando hace falta.
  if p_connection_id is not null then
    insert into public.match_report_messages (report_id, message_id, sender_id, kind, body, answer, created_at)
    select v_report, m.id, m.sender_id, m.kind, m.body, m.answer, m.created_at
      from public.match_messages m
      join public.match_connections c on c.id = m.connection_id
     where m.connection_id = p_connection_id
       and m.sender_id = p_target_id
       and v_uid in (c.user_a, c.user_b)
       and p_target_id in (c.user_a, c.user_b);
  end if;

  if coalesce(p_block, true) then
    perform public.match_block(p_target_id);
  end if;

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bloquear: tampoco desde una cuenta suspendida
-- ---------------------------------------------------------------------------
-- Aqui NO se exige participar en una ruta: el bloqueo es entre personas y no
-- por ruta (0009), y bloquear a alguien de una ruta que ya termino sigue
-- teniendo sentido.
create or replace function public.match_block(p_target_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if public.esta_suspendida(v_uid) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;
  if p_target_id is null or p_target_id = v_uid then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  insert into public.match_blocks (blocker_id, blocked_id)
  values (v_uid, p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Identico a la 0009 salvo la comprobacion de arriba: el orden canonico del
  -- par (least/greatest) y el lock son los que evitan que dos bloqueos a la vez
  -- dejen la conexion a medio cerrar.
  for v_conn in
    select * from public.match_connections c
     where c.is_open
       and c.user_a = least(v_uid, p_target_id)
       and c.user_b = greatest(v_uid, p_target_id)
  loop
    perform public.match_lock_pair(v_conn.route_id, v_conn.user_a, v_conn.user_b);
    perform public.match_close_connection(v_conn.id);
  end loop;

  update public.match_votes mv
     set value = 'seen', updated_at = now()
   where mv.voter_id = v_uid and mv.target_id = p_target_id and mv.value = 'like';
end;
$$;
