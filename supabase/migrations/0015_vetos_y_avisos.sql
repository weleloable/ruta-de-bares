-- Ruta de Bares - 0015: los vetos aguantan, y a la persona se le dice por que.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0014.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Sus sentencias no dan error al repetirse, pero definen funciones que una
-- migracion POSTERIOR rehizo: volver a pegarla las devuelve a esta version,
-- en silencio y sin avisar. Ya paso una vez (re-ejecutar la 0006 dejo a
-- match_require_target sin la comprobacion de bloqueos, o sea que la gente
-- bloqueada volvia a poder interactuar). Aqui quedan obsoletas:
--   * esta_suspendida() la rehace la 0017
--   * match_activate() la rehace la 0019
--   * match_admin_deactivate() la rehace la 0024
--   * match_admin_lift_cana() la rehace la 0024
--   * match_admin_lift_route_ban() la rehace la 0017
--   * match_admin_report() la rehace la 0017
--   * match_admin_suspend() la rehace la 0017
--   * match_admin_unsuspend() la rehace la 0017
--   * my_restrictions() la rehace la 0024
--
-- Por que existe, dos agujeros de la 0014 y una obligacion legal:
--
--   1. Expulsar de una ruta no servia de nada: bastaba con volver a canjear el
--      enlace, que es multiuso y circula por el grupo. Ahora la expulsion deja
--      un VETO en `route_bans` y nadie vetado vuelve a entrar en esa ruta.
--   2. Desactivar la cana tampoco: la persona volvia a darle a "Activar" y
--      reaparecia. Ahora queda vetada hasta que un admin lo levante.
--   3. El DSA (art. 17) obliga a decirle a la persona QUE se ha decidido y POR
--      QUE, en cuanto se le restringe el servicio; y el art. 20, a que pueda
--      reclamar durante 6 meses. Por eso cada accion escribe un aviso en
--      `user_notices` con un motivo que es OBLIGATORIO, y por eso todos los
--      vetos se pueden levantar: una sancion que nadie puede deshacer deja sin
--      sentido el derecho a reclamar.
--
-- La sancion mas dura es SUSPENDER la cuenta, no borrarla: quien esta suspendido
-- entra, lee el aviso y puede llevarse o borrar sus datos, y nada mas. Borrar la
-- cuenta haria imposible comunicarle nada (`profiles` cae en cascada desde
-- `auth.users`) y le dejaria sin a quien reclamar.
--
-- Sobre el hash del correo (ver docs/TIRATE-UNA-CANA.md): un veto de ruta guarda
-- ademas un HMAC del correo, para que borrarse la cuenta y registrarse de nuevo
-- con el mismo correo no salte el veto esa misma noche. Es HMAC y no sha256 a
-- secas porque el espacio de correos es pequeno y un hash pelado se revierte por
-- fuerza bruta. Muere al purgar la ruta (match_admin_purge_route): dura lo que
-- dura el motivo por el que existe, que es lo que exige la minimizacion.

-- ---------------------------------------------------------------------------
-- La clave del HMAC, generada aqui y sin salir nunca de la base
-- ---------------------------------------------------------------------------
create table if not exists public.app_secrets (
  name  text primary key,
  value bytea not null
);

alter table public.app_secrets enable row level security;
revoke all on table public.app_secrets from anon, authenticated;

-- Una sola vez: si ya existe no se toca, o los vetos anteriores dejarian de
-- reconocerse. Va en una funcion y no suelto porque gen_random_bytes vive en un
-- esquema distinto segun donde corra (ver mas abajo).
create or replace function public.sembrar_secreto_vetos()
returns void
language plpgsql
volatile
-- extensions ademas de public: pgcrypto vive alli en Supabase y en public en
-- PGlite (ver el comentario de create_route_invite en la 0004). Sin cualificar
-- y con los dos en el search_path, funciona en ambos.
set search_path = public, extensions
as $$
begin
  insert into public.app_secrets (name, value)
  select 'ban_pepper', gen_random_bytes(32)
   where not exists (select 1 from public.app_secrets s where s.name = 'ban_pepper');
end;
$$;

select public.sembrar_secreto_vetos();

create or replace function public.hmac_correo(p_correo text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_clave bytea;
begin
  if p_correo is null or btrim(p_correo) = '' then
    return null;
  end if;
  select value into v_clave from public.app_secrets where name = 'ban_pepper';
  if v_clave is null then
    return null;
  end if;
  -- convert_to y no un cast: hmac resuelve por (bytea, bytea, text), y
  -- text + bytea mezclados no encajan con ninguna de sus firmas.
  return encode(hmac(convert_to(lower(btrim(p_correo)), 'UTF8'), v_clave, 'sha256'), 'hex');
end;
$$;

-- El correo de una cuenta. Aparte para que nada fuera de aqui toque auth.users.
create or replace function public.correo_de(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email from auth.users u where u.id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
-- Veto de ruta. Sobrevive a que la persona se borre la cuenta (por eso el
-- user_id NO tiene on delete cascade y se guarda tambien el HMAC del correo),
-- pero no sobrevive a la ruta.
create table if not exists public.route_bans (
  route_id    uuid not null references public.routes (id) on delete cascade,
  user_id     uuid not null,
  email_hmac  text,
  reason      text not null check (length(btrim(reason)) between 1 and 500),
  banned_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (route_id, user_id)
);

create index if not exists route_bans_hmac_idx on public.route_bans (route_id, email_hmac);

-- Suspension de cuenta. Se levanta poniendo lifted_at: no se borra, porque es
-- la prueba de que hubo una sancion y de cuando dejo de estar vigente.
create table if not exists public.account_suspensions (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  reason      text not null check (length(btrim(reason)) between 1 and 500),
  suspended_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  lifted_by   uuid references public.profiles (id) on delete set null,
  lifted_at   timestamptz
);

-- Lo que se le dice a la persona. `reason` es lo que ve ella; la nota interna
-- de quien modera sigue en match_moderation_log y NO se ensena aqui.
create table if not exists public.user_notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  action     text not null check (action in (
               'foto_retirada', 'cana_desactivada', 'expulsada_de_ruta', 'cuenta_suspendida',
               'cana_reactivada', 'veto_de_ruta_retirado', 'cuenta_reactivada')),
  route_id   uuid references public.routes (id) on delete set null,
  route_name text not null default '',
  reason     text not null default '',
  -- clock_timestamp y no now(): now() es el inicio de la transaccion, asi que
  -- dos avisos de la misma accion (retirar la foto y desactivar la cana de una
  -- vez) empatarian y el orden de la lista saldria al azar. Misma razon que en
  -- los mensajes del chat.
  created_at timestamptz not null default clock_timestamp(),
  read_at    timestamptz
);

-- Por si la tabla ya existia de una version anterior de esta migracion.
alter table public.user_notices alter column created_at set default clock_timestamp();

-- Y aun asi el orden no se decide por la hora: dos avisos de la misma accion
-- pueden caer en el mismo microsegundo. `seq` siempre crece, y es lo que ordena.
alter table public.user_notices add column if not exists seq bigint generated always as identity;

create index if not exists user_notices_persona_idx on public.user_notices (user_id, seq desc);
create index if not exists user_notices_sin_leer_idx on public.user_notices (user_id) where read_at is null;

-- El veto de la cana vive en el perfil de la cana: es de la persona, no de una
-- ruta (D8 ya decia que desactivar es global).
alter table public.match_profiles add column if not exists blocked_at     timestamptz;
alter table public.match_profiles add column if not exists blocked_by     uuid references public.profiles (id) on delete set null;
alter table public.match_profiles add column if not exists blocked_reason text not null default '';

alter table public.route_bans          enable row level security;
alter table public.account_suspensions enable row level security;
alter table public.user_notices        enable row level security;

-- Mismo criterio que el resto: sin privilegios ni policies, todo por funciones.
revoke all on table
  public.route_bans,
  public.account_suspensions,
  public.user_notices
from anon, authenticated;

-- Suspender tambien es una forma de cerrar una denuncia.
alter table public.match_reports drop constraint if exists match_reports_resolution_check;
alter table public.match_reports add constraint match_reports_resolution_check
  check (resolution in ('sin_accion', 'foto_retirada', 'cana_desactivada', 'expulsada_de_ruta',
                        'cuenta_suspendida', 'otra'));

-- El registro de moderacion tiene que admitir las dos acciones nuevas.
alter table public.match_moderation_log drop constraint if exists match_moderation_log_action_check;
alter table public.match_moderation_log add constraint match_moderation_log_action_check
  check (action in ('foto_retirada', 'cana_desactivada', 'sin_accion', 'denuncia_resuelta',
                    'denuncia_en_revision', 'expulsada_de_ruta', 'cuenta_suspendida', 'veto_retirado'));

-- ---------------------------------------------------------------------------
-- Preguntas que se hacen desde varios sitios
-- ---------------------------------------------------------------------------
create or replace function public.esta_suspendida(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.account_suspensions s
     where s.user_id = p_user_id and s.lifted_at is null
  );
$$;

-- Por user_id o por HMAC del correo: lo segundo es lo que pilla a quien se
-- borro la cuenta y volvio a registrarse con el mismo correo.
create or replace function public.esta_vetada_de_ruta(p_route_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hmac text;
begin
  if exists (select 1 from public.route_bans b
              where b.route_id = p_route_id and b.user_id = p_user_id) then
    return true;
  end if;
  v_hmac := public.hmac_correo(public.correo_de(p_user_id));
  if v_hmac is null then
    return false;
  end if;
  return exists (select 1 from public.route_bans b
                  where b.route_id = p_route_id and b.email_hmac = v_hmac);
end;
$$;

-- ---------------------------------------------------------------------------
-- La puerta: nadie vetado entra en una ruta
-- ---------------------------------------------------------------------------
-- Va en un trigger y no dentro de redeem_route_invite a proposito: asi vale
-- para CUALQUIER via que meta a alguien en una ruta (el canje del remoto, un
-- backfill, una migracion futura) sin tocar codigo que no es nuestro.
create or replace function public.route_members_veto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.esta_suspendida(new.user_id) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;
  if public.esta_vetada_de_ruta(new.route_id, new.user_id) then
    raise exception 'ROUTE_BANNED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists route_members_veto on public.route_members;
create trigger route_members_veto
  before insert on public.route_members
  for each row execute function public.route_members_veto();

-- ---------------------------------------------------------------------------
-- El aviso a la persona
-- ---------------------------------------------------------------------------
-- Interna: la llaman las acciones de admin. El motivo es obligatorio en las
-- restrictivas y la propia accion lo exige antes de llegar aqui.
create or replace function public.crear_aviso(
  p_user_id uuid,
  p_action text,
  p_route_id uuid,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_nombre text := '';
begin
  if p_route_id is not null then
    select r.name into v_nombre from public.routes r where r.id = p_route_id;
  end if;
  insert into public.user_notices (user_id, action, route_id, route_name, reason)
  values (p_user_id, p_action, p_route_id, coalesce(v_nombre, ''), btrim(coalesce(p_reason, '')))
  returning id into v_id;
  return v_id;
end;
$$;

-- Lo que exige el art. 17 del DSA: sin motivo no hay sancion.
create or replace function public.exigir_motivo(p_reason text)
returns text
language plpgsql
immutable
as $$
declare
  v_motivo text := btrim(coalesce(p_reason, ''));
begin
  if v_motivo = '' then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'REASON_TOO_LONG' using errcode = '22023';
  end if;
  return v_motivo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Las acciones de admin, ahora con motivo y aviso
-- ---------------------------------------------------------------------------
-- Cambian de firma (entra p_reason), y eso no lo permite create or replace.
drop function if exists public.match_admin_remove_photo(uuid, uuid, text);
drop function if exists public.match_admin_deactivate(uuid, uuid, text);
drop function if exists public.match_admin_remove_from_route(uuid, uuid, uuid, text);

create or replace function public.match_admin_remove_photo(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null,
  p_note text default ''
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_motivo text := public.exigir_motivo(p_reason);
begin
  update public.profiles p
     set avatar_url = null, avatar_thumb_url = null, updated_at = now()
   where p.id = p_user_id;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'foto_retirada', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'foto_retirada', null, v_motivo);
end;
$$;

-- Desactivar ES un veto: no basta con apagarla, porque la persona le daria a
-- "Activar" y reapareceria.
create or replace function public.match_admin_deactivate(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null,
  p_note text default ''
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_motivo text := public.exigir_motivo(p_reason);
begin
  insert into public.match_profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.match_profiles mp
     set is_active = false,
         blocked_at = now(),
         blocked_by = v_admin,
         blocked_reason = v_motivo,
         updated_at = now()
   where mp.user_id = p_user_id;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'cana_desactivada', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'cana_desactivada', null, v_motivo);
end;
$$;

create or replace function public.match_admin_remove_from_route(
  p_user_id uuid,
  p_route_id uuid,
  p_reason text,
  p_report_id uuid default null,
  p_note text default ''
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_motivo text := public.exigir_motivo(p_reason);
begin
  if p_user_id is null or p_route_id is null then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if public.is_admin_de(p_user_id) then
    raise exception 'TARGET_IS_ADMIN' using errcode = 'P0001';
  end if;

  -- El veto primero: si algo falla despues, la persona se queda fuera igual.
  insert into public.route_bans (route_id, user_id, email_hmac, reason, banned_by)
  values (p_route_id, p_user_id, public.hmac_correo(public.correo_de(p_user_id)), v_motivo, v_admin)
  on conflict (route_id, user_id) do update
    set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();

  delete from public.route_members m
   where m.route_id = p_route_id and m.user_id = p_user_id;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'expulsada_de_ruta', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'expulsada_de_ruta', p_route_id, v_motivo);
  return true;
end;
$$;

-- La sancion mas dura. No borra nada: le saca de TODAS las rutas y le deja
-- entrar solo para leer el aviso, reclamar y llevarse o borrar sus datos.
create or replace function public.match_admin_suspend(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null,
  p_note text default ''
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_motivo text := public.exigir_motivo(p_reason);
begin
  if p_user_id is null then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if public.is_admin_de(p_user_id) then
    raise exception 'TARGET_IS_ADMIN' using errcode = 'P0001';
  end if;

  insert into public.account_suspensions (user_id, reason, suspended_by)
  values (p_user_id, v_motivo, v_admin)
  on conflict (user_id) do update
    set reason = excluded.reason, suspended_by = excluded.suspended_by,
        created_at = now(), lifted_at = null, lifted_by = null;

  -- Fuera de todas las rutas: es lo que le quita la ruta, los sellos y la cana
  -- de golpe, sin tocar ni una policy del remoto.
  delete from public.route_members m where m.user_id = p_user_id;
  update public.match_profiles mp set is_active = false, updated_at = now() where mp.user_id = p_user_id;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'cuenta_suspendida', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'cuenta_suspendida', null, v_motivo);
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
  if p_resolution is null
     or p_resolution not in ('sin_accion', 'foto_retirada', 'cana_desactivada', 'expulsada_de_ruta',
                             'cuenta_suspendida', 'otra') then
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
-- Retirar los vetos
-- ---------------------------------------------------------------------------
-- Existen porque tienen que existir: el DSA da 6 meses para reclamar, y una
-- sancion que nadie puede deshacer deja ese derecho en nada.
create or replace function public.match_admin_lift_cana(p_user_id uuid, p_note text default '')
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_filas integer;
begin
  update public.match_profiles mp
     set blocked_at = null, blocked_by = null, blocked_reason = '', updated_at = now()
   where mp.user_id = p_user_id and mp.blocked_at is not null;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return false;
  end if;

  insert into public.match_moderation_log (admin_id, target_id, action, note)
  values (v_admin, p_user_id, 'veto_retirado', btrim(coalesce(p_note, '')));
  -- La cana NO se reactiva sola: volver a la cana es decision suya.
  perform public.crear_aviso(p_user_id, 'cana_reactivada', null, btrim(coalesce(p_note, '')));
  return true;
end;
$$;

create or replace function public.match_admin_lift_route_ban(p_user_id uuid, p_route_id uuid, p_note text default '')
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_filas integer;
begin
  delete from public.route_bans b where b.route_id = p_route_id and b.user_id = p_user_id;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return false;
  end if;

  insert into public.match_moderation_log (admin_id, target_id, action, note)
  values (v_admin, p_user_id, 'veto_retirado', btrim(coalesce(p_note, '')));
  -- Retirar el veto NO le devuelve a la ruta: para volver hace falta una
  -- invitacion, igual que cualquiera.
  perform public.crear_aviso(p_user_id, 'veto_de_ruta_retirado', p_route_id, btrim(coalesce(p_note, '')));
  return true;
end;
$$;

create or replace function public.match_admin_unsuspend(p_user_id uuid, p_note text default '')
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_filas integer;
begin
  update public.account_suspensions s
     set lifted_at = now(), lifted_by = v_admin
   where s.user_id = p_user_id and s.lifted_at is null;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return false;
  end if;

  insert into public.match_moderation_log (admin_id, target_id, action, note)
  values (v_admin, p_user_id, 'veto_retirado', btrim(coalesce(p_note, '')));
  perform public.crear_aviso(p_user_id, 'cuenta_reactivada', null, btrim(coalesce(p_note, '')));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activar la cana respeta el veto
-- ---------------------------------------------------------------------------
create or replace function public.match_activate(
  p_adult_confirmed boolean default false,
  p_bio text default null,
  p_tag_ids text[] default null,
  p_consent_version text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_perfil  public.match_profiles%rowtype;
  v_version text := btrim(coalesce(p_consent_version, ''));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if public.esta_suspendida(v_uid) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;

  insert into public.match_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_perfil from public.match_profiles mp where mp.user_id = v_uid for update;

  -- El veto va antes que todo lo demas: si no, la persona rellena la frase y
  -- las etiquetas para que le digan que no al final.
  if v_perfil.blocked_at is not null then
    raise exception 'CANA_BLOCKED' using errcode = 'P0001';
  end if;

  if v_perfil.adult_confirmed_at is null and not coalesce(p_adult_confirmed, false) then
    raise exception 'ADULT_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;
  if v_perfil.consent_at is null then
    if v_version = '' then
      raise exception 'CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
    update public.match_profiles mp
       set consent_version = v_version, consent_at = clock_timestamp()
     where mp.user_id = v_uid;
  end if;
  if v_perfil.adult_confirmed_at is null then
    update public.match_profiles mp set adult_confirmed_at = clock_timestamp() where mp.user_id = v_uid;
  end if;

  if p_bio is not null then
    if length(btrim(p_bio)) = 0 or length(p_bio) > 120 then
      raise exception 'INVALID_BIO' using errcode = '22023';
    end if;
    update public.match_profiles mp set bio = btrim(p_bio) where mp.user_id = v_uid;
  end if;

  if p_tag_ids is not null then
    perform public.match_set_tags(v_uid, p_tag_ids);
  end if;

  update public.match_profiles mp
     set is_active = true,
         first_activated_at = coalesce(mp.first_activated_at, clock_timestamp()),
         updated_at = clock_timestamp()
   where mp.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo que lee la persona
-- ---------------------------------------------------------------------------
create or replace function public.my_notices()
returns table (
  id         uuid,
  action     text,
  route_id   uuid,
  route_name text,
  reason     text,
  created_at timestamptz,
  read_at    timestamptz
)
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
  select n.id, n.action, n.route_id, n.route_name, n.reason, n.created_at, n.read_at
    from public.user_notices n
   where n.user_id = v_uid
   order by n.seq desc;
end;
$$;

-- Para la burbujita: solo el numero.
create or replace function public.my_notice_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_total integer;
begin
  if v_uid is null then
    return 0;
  end if;
  select count(*)::integer into v_total
    from public.user_notices n
   where n.user_id = v_uid and n.read_at is null;
  return v_total;
end;
$$;

-- Marcar leido es la prueba de que se le comunico: no se puede "desleer".
create or replace function public.mark_notices_read()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_filas integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  update public.user_notices n set read_at = now()
   where n.user_id = v_uid and n.read_at is null;
  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

-- Si la cuenta esta suspendida, la app tiene que poder decirlo sin ensenar el
-- resto. Devuelve tambien el veto de la cana, que es lo que explica por que
-- "Activar" no funciona.
create or replace function public.my_restrictions()
returns table (
  suspended         boolean,
  suspended_reason  text,
  suspended_at      timestamptz,
  cana_blocked      boolean,
  cana_reason       text
)
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
  select
    public.esta_suspendida(v_uid),
    coalesce((select s.reason from public.account_suspensions s
               where s.user_id = v_uid and s.lifted_at is null), ''),
    (select s.created_at from public.account_suspensions s
      where s.user_id = v_uid and s.lifted_at is null),
    coalesce((select mp.blocked_at is not null from public.match_profiles mp where mp.user_id = v_uid), false),
    coalesce((select mp.blocked_reason from public.match_profiles mp where mp.user_id = v_uid), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo que lee el panel
-- ---------------------------------------------------------------------------
-- El ticket tiene que saber que vetos hay puestos, o la pantalla ofreceria
-- expulsar a quien ya esta vetado y no ofreceria retirarlo.
drop function if exists public.match_admin_report(uuid);

create or replace function public.match_admin_report(p_report_id uuid)
returns table (
  id                  uuid,
  created_at          timestamptz,
  status              text,
  reason              text,
  detail              text,
  route_id            uuid,
  route_name          text,
  reporter_id         uuid,
  reporter_name       text,
  reported_id         uuid,
  reported_name       text,
  reported_avatar_url text,
  reported_bio        text,
  reported_active     boolean,
  reported_in_route   boolean,
  reported_is_admin   boolean,
  reported_cana_blocked boolean,
  reported_route_banned boolean,
  reported_suspended    boolean,
  mensajes            integer,
  notified_at         timestamptz,
  handled_by          uuid,
  handled_by_name     text,
  handled_at          timestamptz,
  resolution          text,
  handler_note        text
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
  select r.id, r.created_at, r.status, r.reason, r.detail,
         r.route_id, ruta.name,
         r.reporter_id, quien.display_name,
         r.reported_id, acusada.display_name,
         coalesce(acusada.avatar_url, acusada.avatar_thumb_url),
         coalesce(cana.bio, ''),
         coalesce(cana.is_active, false),
         exists (select 1 from public.route_members m
                  where m.route_id = r.route_id and m.user_id = r.reported_id),
         acusada.role = 'admin',
         coalesce(cana.blocked_at is not null, false),
         exists (select 1 from public.route_bans b
                  where b.route_id = r.route_id and b.user_id = r.reported_id),
         public.esta_suspendida(r.reported_id),
         (select count(*)::integer from public.match_report_messages m where m.report_id = r.id),
         r.notified_at,
         r.handled_by, admin.display_name, r.handled_at,
         r.resolution, r.handler_note
    from public.match_reports r
    join public.profiles quien   on quien.id = r.reporter_id
    join public.profiles acusada on acusada.id = r.reported_id
    join public.routes   ruta    on ruta.id = r.route_id
    left join public.match_profiles cana on cana.user_id = r.reported_id
    left join public.profiles admin on admin.id = r.handled_by
   where r.id = p_report_id;
end;
$$;

-- La lista de vetos vigentes, para poder retirarlos mucho despues de que la
-- denuncia se cerrara.
create or replace function public.match_admin_bans()
returns table (
  tipo        text,
  user_id     uuid,
  user_name   text,
  route_id    uuid,
  route_name  text,
  reason      text,
  created_at  timestamptz
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
  select 'cuenta'::text, s.user_id, p.display_name, null::uuid, ''::text, s.reason, s.created_at
    from public.account_suspensions s
    join public.profiles p on p.id = s.user_id
   where s.lifted_at is null
  union all
  select 'ruta'::text, b.user_id, coalesce(p.display_name, '(cuenta borrada)'), b.route_id, r.name, b.reason, b.created_at
    from public.route_bans b
    join public.routes r on r.id = b.route_id
    left join public.profiles p on p.id = b.user_id
  union all
  select 'cana'::text, mp.user_id, p.display_name, null::uuid, ''::text, mp.blocked_reason, mp.blocked_at
    from public.match_profiles mp
    join public.profiles p on p.id = mp.user_id
   where mp.blocked_at is not null
   order by created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- La purga de una ruta se lleva sus vetos
-- ---------------------------------------------------------------------------
-- Es lo que hace defendible guardar el HMAC del correo: dura lo que dura la
-- ruta, no para siempre.
create or replace function public.match_admin_purge_route(p_route_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin    uuid := public.match_admin_require();
  v_fecha    date;
  v_conex    integer;
  v_votos    integer;
  v_denun    integer;
  v_vetos    integer;
begin
  select event_date into v_fecha from public.routes r where r.id = p_route_id;
  if v_fecha is null then
    raise exception 'ROUTE_WITHOUT_DATE' using errcode = 'P0001';
  end if;
  if v_fecha > (current_date - coalesce(p_days, 30)) then
    raise exception 'ROUTE_TOO_RECENT' using errcode = 'P0001';
  end if;

  delete from public.match_connections c where c.route_id = p_route_id;
  get diagnostics v_conex = row_count;
  delete from public.match_votes v where v.route_id = p_route_id;
  get diagnostics v_votos = row_count;
  delete from public.match_reports r where r.route_id = p_route_id;
  get diagnostics v_denun = row_count;
  delete from public.route_bans b where b.route_id = p_route_id;
  get diagnostics v_vetos = row_count;

  insert into public.match_moderation_log (admin_id, target_id, action, note)
  values (v_admin, v_admin, 'sin_accion', 'Purga de la ruta ' || p_route_id::text);

  return jsonb_build_object('conexiones', v_conex, 'votos', v_votos, 'denuncias', v_denun, 'vetos', v_vetos);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
-- Internas: nadie las llama suelta desde la app.
revoke all on function
  public.sembrar_secreto_vetos(),
  public.hmac_correo(text),
  public.correo_de(uuid),
  public.crear_aviso(uuid, text, uuid, text),
  public.exigir_motivo(text),
  public.route_members_veto()
from public, anon, authenticated;

revoke all on function
  public.match_admin_resolve(uuid, text, text),
  public.esta_suspendida(uuid),
  public.esta_vetada_de_ruta(uuid, uuid),
  public.match_admin_remove_photo(uuid, text, uuid, text),
  public.match_admin_deactivate(uuid, text, uuid, text),
  public.match_admin_remove_from_route(uuid, uuid, text, uuid, text),
  public.match_admin_suspend(uuid, text, uuid, text),
  public.match_admin_lift_cana(uuid, text),
  public.match_admin_lift_route_ban(uuid, uuid, text),
  public.match_admin_unsuspend(uuid, text),
  public.match_admin_bans(),
  public.match_admin_report(uuid),
  public.match_admin_purge_route(uuid, integer),
  public.match_activate(boolean, text, text[], text),
  public.my_notices(),
  public.my_notice_count(),
  public.mark_notices_read(),
  public.my_restrictions()
from public, anon;

grant execute on function
  public.match_admin_resolve(uuid, text, text),
  public.match_admin_remove_photo(uuid, text, uuid, text),
  public.match_admin_deactivate(uuid, text, uuid, text),
  public.match_admin_remove_from_route(uuid, uuid, text, uuid, text),
  public.match_admin_suspend(uuid, text, uuid, text),
  public.match_admin_lift_cana(uuid, text),
  public.match_admin_lift_route_ban(uuid, uuid, text),
  public.match_admin_unsuspend(uuid, text),
  public.match_admin_bans(),
  public.match_admin_report(uuid),
  public.match_admin_purge_route(uuid, integer),
  public.match_activate(boolean, text, text[], text),
  public.my_notices(),
  public.my_notice_count(),
  public.mark_notices_read(),
  public.my_restrictions()
to authenticated;
