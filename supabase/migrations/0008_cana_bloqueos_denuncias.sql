-- Ruta de Bares - 0008: bloquear y denunciar en "Tirate una cana".
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0007.
-- Idempotente: se puede re-ejecutar.
--
-- Por que existe:
--   * Bloquear. Quitar el Me gusta ya cierra la conexion y borra el chat, pero
--     la otra persona te sigue viendo en la grilla y puede abrir tu ficha, y en
--     la siguiente ruta volveis a cruzaros. En un evento donde esa persona esta
--     a diez metros, eso no basta.
--   * Denunciar. El Reglamento de Servicios Digitales exige un mecanismo para
--     avisar de contenido ilicito y actuar deprisa; hoy no hay ninguno, asi que
--     el aviso llegaria por WhatsApp y sin herramienta para retirar nada.
--
-- Como encaja con el panel de administracion, que construye otra persona: aqui
-- solo estan los datos y las funciones. Las de admin (listar, marcar
-- notificada, resolver, retirar foto, desactivar la cana) quedan listas y
-- documentadas en docs/TIRATE-UNA-CANA.md; el panel solo tiene que llamarlas.
-- Ninguna da acceso a los chats: la denuncia se lleva COPIADOS los mensajes
-- denunciados (D10 sigue en pie).

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
-- El bloqueo es entre personas y NO por ruta: si bloqueas a alguien, sigue
-- bloqueado en la ruta siguiente. Los votos si son por ruta (D1).
create table if not exists public.match_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint match_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists match_blocks_blocked_idx on public.match_blocks (blocked_id);

create table if not exists public.match_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reported_id  uuid not null references public.profiles (id) on delete cascade,
  route_id     uuid not null references public.routes (id) on delete cascade,
  reason       text not null check (reason in ('foto', 'acoso', 'suplantacion', 'menor', 'otro')),
  detail       text not null default '' check (char_length(detail) <= 500),
  status       text not null default 'pendiente' check (status in ('pendiente', 'en_revision', 'resuelta')),
  created_at   timestamptz not null default now(),
  -- Para el sistema de avisos a admins: se rellena cuando ya se ha avisado.
  notified_at  timestamptz,
  handled_by   uuid references public.profiles (id) on delete set null,
  handled_at   timestamptz,
  resolution   text check (resolution in ('sin_accion', 'foto_retirada', 'cana_desactivada', 'otra')),
  handler_note text not null default '' check (char_length(handler_note) <= 500),
  constraint match_reports_not_self check (reporter_id <> reported_id)
);

create index if not exists match_reports_pendientes_idx on public.match_reports (status, created_at);
create index if not exists match_reports_sin_avisar_idx on public.match_reports (notified_at) where notified_at is null;

-- Copia de los mensajes denunciados. Se copian AL DENUNCIAR y no se enlazan:
-- bloquear borra el chat, y sin copia la prueba desaparecia justo cuando hace
-- falta. Ademas asi el panel lee esto y nunca la conversacion.
create table if not exists public.match_report_messages (
  report_id  uuid not null references public.match_reports (id) on delete cascade,
  message_id uuid not null,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  body       text,
  answer     text,
  created_at timestamptz not null,
  primary key (report_id, message_id)
);

-- Lo que hace un admin queda apuntado: es la prueba de haber actuado deprisa.
create table if not exists public.match_moderation_log (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid references public.match_reports (id) on delete set null,
  admin_id   uuid not null references public.profiles (id) on delete cascade,
  target_id  uuid not null references public.profiles (id) on delete cascade,
  action     text not null check (action in ('foto_retirada', 'cana_desactivada', 'sin_accion', 'denuncia_resuelta')),
  note       text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

alter table public.match_blocks           enable row level security;
alter table public.match_reports          enable row level security;
alter table public.match_report_messages  enable row level security;
alter table public.match_moderation_log   enable row level security;

-- Mismo criterio que el resto de la cana: sin privilegios ni policies, todo
-- pasa por funciones SECURITY DEFINER.
revoke all on table
  public.match_blocks,
  public.match_reports,
  public.match_report_messages,
  public.match_moderation_log
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones internas
-- ---------------------------------------------------------------------------
-- En cualquiera de los dos sentidos: quien bloquea deja de ver y de ser visto.
create or replace function public.match_hay_bloqueo(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.match_blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function public.match_hay_bloqueo(uuid, uuid) from public, anon, authenticated;

-- Votar o marcar Visto a alguien bloqueado deja de tener sentido.
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
  if public.match_hay_bloqueo(p_user_id, p_target_id) then
    raise exception 'BLOCKED' using errcode = 'P0001';
  end if;
  if not public.match_is_active(p_target_id) or not public.is_route_participant(p_route_id, p_target_id) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
end;
$$;

-- Un chat con alguien bloqueado no se abre, igual que uno cerrado.
create or replace function public.match_require_connection(p_connection_id uuid, p_lock boolean)
returns public.match_connections
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_conn  public.match_connections%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_conn from public.match_connections c where c.id = p_connection_id;
  if not found or v_uid not in (v_conn.user_a, v_conn.user_b) then
    raise exception 'CONNECTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_lock then
    perform public.match_lock_pair(v_conn.route_id, v_conn.user_a, v_conn.user_b);
    select * into v_conn from public.match_connections c where c.id = p_connection_id for update;
  end if;

  if not v_conn.is_open then
    raise exception 'CONNECTION_CLOSED' using errcode = 'P0001';
  end if;
  if not public.is_route_participant(v_conn.route_id, v_uid) then
    raise exception 'NOT_PARTICIPANT' using errcode = 'P0001';
  end if;
  if not public.match_is_active(v_uid) then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_other := case when v_conn.user_a = v_uid then v_conn.user_b else v_conn.user_a end;
  if public.match_hay_bloqueo(v_uid, v_other) then
    raise exception 'BLOCKED' using errcode = 'P0001';
  end if;
  -- La otra persona ha pausado la feature o ya no esta en la ruta: la
  -- conexion sigue guardada (desactivar es una pausa) pero no se usa.
  if not public.match_is_active(v_other) or not public.is_route_participant(v_conn.route_id, v_other) then
    raise exception 'CONNECTION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return v_conn;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bloquear y desbloquear
-- ---------------------------------------------------------------------------
-- Bloquear hace tres cosas a la vez: os escondeis mutuamente, se cierra la
-- conexion (con lo que el chat se borra, como al quitar el Me gusta) y tu voto
-- baja a Visto para que no se reabra sola si la otra persona sigue dandote
-- Me gusta.
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
  if p_target_id is null or p_target_id = v_uid then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  insert into public.match_blocks (blocker_id, blocked_id)
  values (v_uid, p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;

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

-- Desbloquear NO devuelve la conexion ni el Me gusta: si quieres volver,
-- tienes que darlo otra vez desde su ficha.
create or replace function public.match_unblock(p_target_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  delete from public.match_blocks b where b.blocker_id = v_uid and b.blocked_id = p_target_id;
end;
$$;

-- Para la pantalla de "Personas bloqueadas": solo las que has bloqueado tu.
create or replace function public.match_blocked_list()
returns table (user_id uuid, display_name text, avatar_url text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return query
  select p.id, p.display_name, coalesce(p.avatar_thumb_url, p.avatar_url), b.created_at
    from public.match_blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = v_uid
   order by b.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Denunciar
-- ---------------------------------------------------------------------------
-- p_connection_id opcional: si viene, se copian los mensajes que esa persona
-- mando en ese chat, que es la prueba. p_block deja bloqueada a la persona en
-- la misma transaccion, y en este orden a proposito: bloquear borra el chat,
-- asi que copiar despues llegaria tarde.
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
-- Contrato con el panel de administracion (lo construye otra persona)
-- ---------------------------------------------------------------------------
-- Todo lo de aqui exige is_admin(). Ninguna funcion da acceso a los chats:
-- solo a lo que la persona denunciante copio en su denuncia.
create or replace function public.match_admin_require()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

revoke all on function public.match_admin_require() from public, anon, authenticated;

-- Bandeja del panel. p_solo_pendientes = false para ver tambien el historico.
create or replace function public.match_admin_reports(p_solo_pendientes boolean default true)
returns table (
  id            uuid,
  created_at    timestamptz,
  status        text,
  reason        text,
  detail        text,
  route_id      uuid,
  reporter_id   uuid,
  reporter_name text,
  reported_id   uuid,
  reported_name text,
  mensajes      integer,
  notified_at   timestamptz,
  handled_by    uuid,
  handled_at    timestamptz,
  resolution    text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.match_admin_require();
  return query
  select r.id, r.created_at, r.status, r.reason, r.detail, r.route_id,
         r.reporter_id, quien.display_name,
         r.reported_id, acusada.display_name,
         (select count(*)::integer from public.match_report_messages m where m.report_id = r.id),
         r.notified_at, r.handled_by, r.handled_at, r.resolution
    from public.match_reports r
    join public.profiles quien on quien.id = r.reporter_id
    join public.profiles acusada on acusada.id = r.reported_id
   where not coalesce(p_solo_pendientes, true) or r.status <> 'resuelta'
   order by r.created_at;
end;
$$;

-- Los mensajes que venian con una denuncia concreta.
create or replace function public.match_admin_report_messages(p_report_id uuid)
returns table (message_id uuid, sender_id uuid, kind text, body text, answer text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.match_admin_require();
  return query
  select m.message_id, m.sender_id, m.kind, m.body, m.answer, m.created_at
    from public.match_report_messages m
   where m.report_id = p_report_id
   order by m.created_at;
end;
$$;

-- Para el sistema de avisos: lo que todavia no se ha comunicado a nadie.
create or replace function public.match_admin_reports_sin_avisar()
returns table (id uuid, created_at timestamptz, reason text, reported_id uuid, reported_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.match_admin_require();
  return query
  select r.id, r.created_at, r.reason, r.reported_id, acusada.display_name
    from public.match_reports r
    join public.profiles acusada on acusada.id = r.reported_id
   where r.notified_at is null and r.status <> 'resuelta'
   order by r.created_at;
end;
$$;

create or replace function public.match_admin_mark_notified(p_report_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  update public.match_reports r set notified_at = now() where r.id = p_report_id and r.notified_at is null;
end;
$$;

-- Retirar la foto de alguien. No borra el fichero del Storage: eso lo hace
-- quien tenga la clave de servicio (ver docs/TIRATE-UNA-CANA.md).
create or replace function public.match_admin_remove_photo(p_user_id uuid, p_report_id uuid default null, p_note text default '')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
begin
  update public.profiles p set avatar_url = null, avatar_thumb_url = null, updated_at = now() where p.id = p_user_id;
  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'foto_retirada', btrim(coalesce(p_note, '')));
end;
$$;

-- Desactivar la cana de alguien: desaparece de grillas y chats, como si la
-- hubiera pausado (D8). No borra su perfil ni sus votos.
create or replace function public.match_admin_deactivate(p_user_id uuid, p_report_id uuid default null, p_note text default '')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
begin
  update public.match_profiles mp set is_active = false, updated_at = now() where mp.user_id = p_user_id;
  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'cana_desactivada', btrim(coalesce(p_note, '')));
end;
$$;

create or replace function public.match_admin_resolve(p_report_id uuid, p_resolution text, p_note text default '')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_target uuid;
begin
  if p_resolution is null or p_resolution not in ('sin_accion', 'foto_retirada', 'cana_desactivada', 'otra') then
    raise exception 'INVALID_RESOLUTION' using errcode = '22023';
  end if;
  update public.match_reports r
     set status = 'resuelta',
         resolution = p_resolution,
         handled_by = v_admin,
         handled_at = now(),
         handler_note = btrim(coalesce(p_note, ''))
   where r.id = p_report_id
  returning r.reported_id into v_target;
  if v_target is null then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, v_target, 'denuncia_resuelta', btrim(coalesce(p_note, '')));
end;
$$;

-- ---------------------------------------------------------------------------
-- La grilla y la bandeja esconden a quien esta bloqueado
-- ---------------------------------------------------------------------------
drop function if exists public.match_grid(uuid);

create or replace function public.match_grid(p_route_id uuid)
returns table (
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  avatar_thumb_url text,
  bio              text,
  tag_ids          text[],
  my_vote          text,
  connection_id    uuid,
  unread_count     integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.match_require_member(p_route_id);
begin
  return query
  select p.id,
         p.display_name,
         p.avatar_url,
         coalesce(p.avatar_thumb_url, p.avatar_url),
         mp.bio,
         coalesce(
           (select array_agg(pt.tag_id order by pt.tag_id)
              from public.match_profile_tags pt where pt.user_id = p.id),
           '{}'::text[]
         ),
         v.value,
         c.id,
         coalesce((
           select count(*)::integer
             from public.match_messages m
             join public.match_connection_members yo
               on yo.connection_id = m.connection_id and yo.user_id = v_uid
            where m.connection_id = c.id
              and m.sender_id <> v_uid
              and m.created_at > yo.last_read_at
         ), 0)
    from public.match_profiles mp
    join public.profiles p on p.id = mp.user_id
    left join public.match_votes v
      on v.route_id = p_route_id and v.voter_id = v_uid and v.target_id = p.id
    left join public.match_connections c
      on c.route_id = p_route_id and c.is_open
     and c.user_a = least(v_uid, p.id) and c.user_b = greatest(v_uid, p.id)
   where mp.is_active
     and p.id <> v_uid
     and public.is_route_participant(p_route_id, p.id)
     and not public.match_hay_bloqueo(v_uid, p.id)
   order by (v.value is null) desc, md5(v_uid::text || p.id::text || p_route_id::text);
end;
$$;

drop function if exists public.match_inbox(uuid);

create or replace function public.match_inbox(p_route_id uuid)
returns table (
  connection_id     uuid,
  other_user_id     uuid,
  display_name      text,
  avatar_url        text,
  question_state    text,
  question_asked_by uuid,
  last_kind         text,
  last_sender_id    uuid,
  last_at           timestamptz,
  unread_count      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := public.match_require_member(p_route_id);
begin
  return query
  select c.id,
         o.id,
         o.display_name,
         coalesce(o.avatar_thumb_url, o.avatar_url),
         c.question_state,
         c.question_asked_by,
         ultimo.kind,
         ultimo.sender_id,
         coalesce(ultimo.created_at, c.opened_at),
         coalesce((
           select count(*)::integer
             from public.match_messages m
             join public.match_connection_members yo
               on yo.connection_id = m.connection_id and yo.user_id = v_uid
            where m.connection_id = c.id
              and m.sender_id <> v_uid
              and m.created_at > yo.last_read_at
         ), 0)
    from public.match_connections c
    join public.profiles o
      on o.id = case when c.user_a = v_uid then c.user_b else c.user_a end
    join public.match_profiles omp
      on omp.user_id = o.id and omp.is_active
    left join lateral (
      select m.kind, m.sender_id, m.created_at
        from public.match_messages m
       where m.connection_id = c.id
       order by m.created_at desc, m.id desc
       limit 1
    ) ultimo on true
   where c.route_id = p_route_id
     and c.is_open
     and v_uid in (c.user_a, c.user_b)
     and public.is_route_participant(p_route_id, o.id)
     and not public.match_hay_bloqueo(v_uid, o.id)
   order by (c.question_state = 'pending' and c.question_asked_by is distinct from v_uid) desc,
            (c.question_state = 'pending') desc,
            coalesce(ultimo.created_at, c.opened_at) desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
revoke all on function
  public.match_require_target(uuid, uuid, uuid),
  public.match_require_connection(uuid, boolean)
from public, anon, authenticated;

revoke all on function
  public.match_block(uuid),
  public.match_unblock(uuid),
  public.match_blocked_list(),
  public.match_report(uuid, uuid, text, text, uuid, boolean),
  public.match_grid(uuid),
  public.match_inbox(uuid),
  public.match_admin_reports(boolean),
  public.match_admin_report_messages(uuid),
  public.match_admin_reports_sin_avisar(),
  public.match_admin_mark_notified(uuid),
  public.match_admin_remove_photo(uuid, uuid, text),
  public.match_admin_deactivate(uuid, uuid, text),
  public.match_admin_resolve(uuid, text, text)
from public, anon;

grant execute on function
  public.match_block(uuid),
  public.match_unblock(uuid),
  public.match_blocked_list(),
  public.match_report(uuid, uuid, text, text, uuid, boolean),
  public.match_grid(uuid),
  public.match_inbox(uuid),
  public.match_admin_reports(boolean),
  public.match_admin_report_messages(uuid),
  public.match_admin_reports_sin_avisar(),
  public.match_admin_mark_notified(uuid),
  public.match_admin_remove_photo(uuid, uuid, text),
  public.match_admin_deactivate(uuid, uuid, text),
  public.match_admin_resolve(uuid, text, text)
to authenticated;
