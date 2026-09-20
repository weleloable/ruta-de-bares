-- Ruta de Bares - 0008: la cana se queda solo con la pregunta de la cerveza.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0007.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Cambio de producto: desaparecen los GIFs y los zumbidos. Lo unico que se
-- puede hacer en una conexion es ofrecer la cana ("Te tomas una cerveza
-- conmigo?") y responder Si, No o "Preguntamelo dentro de un rato". Tras el Si
-- cada persona puede mandar UN mensaje de hasta 120 caracteres (antes dos).
--
-- Por que: un catalogo de GIFs y un zumbido cada 30 s dan de sobra para
-- molestar a alguien toda una noche, y ninguno de los dos hace falta para lo
-- que la feature intenta: que dos personas queden a tomar algo. Con un solo
-- mensaje por persona, ademas, si alguien denuncia un texto hay exactamente un
-- mensaje que mirar por cada lado, sin conversacion que reconstruir.
--
-- Decisiones afectadas en docs/TIRATE-UNA-CANA.md: D7 (dos textos -> uno) y
-- D13 (catalogo propio de GIFs -> se retira).

-- ---------------------------------------------------------------------------
-- Mensajes: fuera GIFs y zumbidos
-- ---------------------------------------------------------------------------
-- Primero los datos y luego la regla: con el check nuevo puesto antes, el
-- delete no haria falta pero el ALTER fallaria por las filas que ya existen.
delete from public.match_messages where kind in ('gif', 'buzz');

alter table public.match_messages drop constraint if exists match_messages_shape;
alter table public.match_messages drop constraint if exists match_messages_kind_check;
alter table public.match_messages drop column if exists gif_id;

alter table public.match_messages
  add constraint match_messages_kind_check check (kind in ('question', 'answer', 'text'));

alter table public.match_messages
  add constraint match_messages_shape check (
    (kind = 'text' and body is not null and answer is null)
    or (kind = 'answer' and answer is not null and body is null)
    or (kind = 'question' and answer is null and body is null)
  );

-- El catalogo de GIFs deja de existir; los ficheros salen de la app.
drop table if exists public.match_gifs;

-- ---------------------------------------------------------------------------
-- Un solo texto por persona (D7)
-- ---------------------------------------------------------------------------
-- Quien ya habia gastado dos se queda en uno: el limite se respeta igual (no
-- puede mandar mas) y la fila cumple el check nuevo.
alter table public.match_connection_members drop constraint if exists match_connection_members_texts_sent_check;
update public.match_connection_members set texts_sent = least(texts_sent, 1);
alter table public.match_connection_members
  add constraint match_connection_members_texts_sent_check check (texts_sent between 0 and 1);

-- El zumbido era lo unico que usaba esta columna.
alter table public.match_connection_members drop column if exists last_buzz_at;

drop function if exists public.match_send_gif(uuid, text);
drop function if exists public.match_send_buzz(uuid);

create or replace function public.match_send_text(p_connection_id uuid, p_body text)
returns setof public.match_messages
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype := public.match_require_connection(p_connection_id, true);
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_conn.question_state <> 'accepted' then
    raise exception 'TEXT_LOCKED' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception 'TEXT_EMPTY' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 120 then
    raise exception 'TEXT_TOO_LONG' using errcode = 'P0001';
  end if;

  -- Se comprueba y se gasta en el mismo UPDATE: dos envios a la vez no cuelan
  -- dos mensajes.
  update public.match_connection_members cm
     set texts_sent = cm.texts_sent + 1
   where cm.connection_id = v_conn.id
     and cm.user_id = v_uid
     and cm.texts_sent < 1;
  if not found then
    raise exception 'TEXT_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  return query
  insert into public.match_messages (connection_id, sender_id, kind, body)
  values (v_conn.id, v_uid, 'text', v_body)
  returning *;
end;
$$;

-- Devolvia gif_id, que ya no existe: sin rehacerla, cualquier lectura del chat
-- falla con "column m.gif_id does not exist".
drop function if exists public.match_fetch_messages(uuid, timestamptz);

create or replace function public.match_fetch_messages(p_connection_id uuid, p_after timestamptz default null)
returns table (
  id            uuid,
  connection_id uuid,
  sender_id     uuid,
  kind          text,
  answer        text,
  body          text,
  created_at    timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_conn public.match_connections%rowtype := public.match_require_connection(p_connection_id, false);
begin
  update public.match_connection_members cm
     set last_read_at = clock_timestamp()
   where cm.connection_id = v_conn.id and cm.user_id = v_uid;

  return query
  select m.id, m.connection_id, m.sender_id, m.kind, m.answer, m.body, m.created_at
    from public.match_messages m
   where m.connection_id = v_conn.id
     and m.created_at > coalesce(p_after, '-infinity'::timestamptz)
   order by m.created_at, m.id
   limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- La pantalla de chat ya no necesita saber del zumbido
-- ---------------------------------------------------------------------------
drop function if exists public.match_get_connection(uuid);

create or replace function public.match_get_connection(p_connection_id uuid)
returns table (
  connection_id        uuid,
  route_id             uuid,
  other_user_id        uuid,
  display_name         text,
  avatar_url           text,
  question_state       text,
  question_asked_by    uuid,
  question_asked_at    timestamptz,
  question_answered_at timestamptz,
  postpone_count       integer,
  my_texts_sent        integer,
  other_texts_sent     integer,
  server_now           timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_conn  public.match_connections%rowtype := public.match_require_connection(p_connection_id, false);
  v_other uuid;
begin
  v_other := case when v_conn.user_a = v_uid then v_conn.user_b else v_conn.user_a end;
  return query
  select v_conn.id,
         v_conn.route_id,
         o.id,
         o.display_name,
         coalesce(o.avatar_thumb_url, o.avatar_url),
         v_conn.question_state,
         v_conn.question_asked_by,
         v_conn.question_asked_at,
         v_conn.question_answered_at,
         v_conn.postpone_count,
         yo.texts_sent,
         otro.texts_sent,
         now()
    from public.profiles o
    join public.match_connection_members yo
      on yo.connection_id = v_conn.id and yo.user_id = v_uid
    join public.match_connection_members otro
      on otro.connection_id = v_conn.id and otro.user_id = v_other
   where o.id = v_other;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que (drop function se lleva por delante los permisos)
-- ---------------------------------------------------------------------------
revoke all on function
  public.match_get_connection(uuid),
  public.match_fetch_messages(uuid, timestamptz)
from public, anon;

grant execute on function
  public.match_get_connection(uuid),
  public.match_fetch_messages(uuid, timestamptz)
to authenticated;
