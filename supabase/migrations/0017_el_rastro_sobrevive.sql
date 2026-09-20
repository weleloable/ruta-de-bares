-- Ruta de Bares - 0017: el rastro de moderacion sobrevive a que se borre la cuenta.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0016.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Sus sentencias no dan error al repetirse, pero definen funciones que una
-- migracion POSTERIOR rehizo: volver a pegarla las devuelve a esta version,
-- en silencio y sin avisar. Ya paso una vez (re-ejecutar la 0006 dejo a
-- match_require_target sin la comprobacion de bloqueos, o sea que la gente
-- bloqueada volvia a poder interactuar). Aqui quedan obsoletas:
--   * match_admin_report() la rehace la 0028
--   * match_report_nombres() la rehace la 0028
--
-- Por que existe. Comprobado sobre Postgres: si la persona sancionada se borra
-- la cuenta, `on delete cascade` se lleva por delante sus apuntes del registro
-- de moderacion, sus avisos, las denuncias sobre ella y su suspension. Al
-- registrarse otra vez con el mismo correo volvia limpia. Es decir:
--
--   * la sancion MAS dura (suspender la cuenta) se esquivaba borrandose la
--     cuenta, mientras que una menor (el veto de ruta) aguantaba. Al reves de
--     como tiene que ser;
--   * y el registro que justificamos como "la prueba de haber actuado deprisa"
--     lo borraba justamente la persona a la que documenta.
--
-- Como se arregla, sin guardar ni un dato de mas:
--   * las claves ajenas pasan de `cascade` a `set null`, asi que la FILA se
--     queda y lo que desaparece es a quien apunta;
--   * y como una fila sin nombre no sirve para rendir cuentas, se guarda el
--     nombre visible en el momento de los hechos. Un nombre de guerra ("Marta")
--     no reidentifica a nadie por si solo, y es lo minimo para que el historial
--     se pueda leer.
--
-- La suspension ademas guarda el HMAC del correo, igual que el veto de ruta
-- (0015), para que borrarse la cuenta y volver no la borre. **Se borra al
-- levantar la suspension**: el dato vive exactamente lo que vive la sancion.
-- Esto hay que contarlo en la politica de privacidad, como el de la 0015.

-- ---------------------------------------------------------------------------
-- El registro de moderacion
-- ---------------------------------------------------------------------------
alter table public.match_moderation_log add column if not exists admin_name  text not null default '';
alter table public.match_moderation_log add column if not exists target_name text not null default '';

alter table public.match_moderation_log alter column admin_id  drop not null;
alter table public.match_moderation_log alter column target_id drop not null;

alter table public.match_moderation_log drop constraint if exists match_moderation_log_admin_id_fkey;
alter table public.match_moderation_log add constraint match_moderation_log_admin_id_fkey
  foreign key (admin_id) references public.profiles (id) on delete set null;
alter table public.match_moderation_log drop constraint if exists match_moderation_log_target_id_fkey;
alter table public.match_moderation_log add constraint match_moderation_log_target_id_fkey
  foreign key (target_id) references public.profiles (id) on delete set null;

-- Los nombres se rellenan con un trigger y no en cada funcion: hay ocho que
-- escriben en el registro y una que se olvide dejaria un apunte anonimo.
create or replace function public.match_log_nombres()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.admin_name, '') = '' then
    select coalesce(p.display_name, '') into new.admin_name from public.profiles p where p.id = new.admin_id;
  end if;
  if coalesce(new.target_name, '') = '' then
    select coalesce(p.display_name, '') into new.target_name from public.profiles p where p.id = new.target_id;
  end if;
  new.admin_name := coalesce(new.admin_name, '');
  new.target_name := coalesce(new.target_name, '');
  return new;
end;
$$;

drop trigger if exists match_log_nombres on public.match_moderation_log;
create trigger match_log_nombres
  before insert on public.match_moderation_log
  for each row execute function public.match_log_nombres();

-- Lo que ya estaba escrito tambien merece nombre.
update public.match_moderation_log l
   set admin_name = coalesce((select p.display_name from public.profiles p where p.id = l.admin_id), '')
 where l.admin_name = '';
update public.match_moderation_log l
   set target_name = coalesce((select p.display_name from public.profiles p where p.id = l.target_id), '')
 where l.target_name = '';

-- ---------------------------------------------------------------------------
-- Las denuncias
-- ---------------------------------------------------------------------------
alter table public.match_reports add column if not exists reporter_name text not null default '';
alter table public.match_reports add column if not exists reported_name text not null default '';

alter table public.match_reports alter column reporter_id drop not null;
alter table public.match_reports alter column reported_id drop not null;

alter table public.match_reports drop constraint if exists match_reports_reporter_id_fkey;
alter table public.match_reports add constraint match_reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles (id) on delete set null;
alter table public.match_reports drop constraint if exists match_reports_reported_id_fkey;
alter table public.match_reports add constraint match_reports_reported_id_fkey
  foreign key (reported_id) references public.profiles (id) on delete set null;

-- La copia de mensajes es la prueba: no puede irse porque su autor se borre.
alter table public.match_report_messages alter column sender_id drop not null;
alter table public.match_report_messages drop constraint if exists match_report_messages_sender_id_fkey;
alter table public.match_report_messages add constraint match_report_messages_sender_id_fkey
  foreign key (sender_id) references public.profiles (id) on delete set null;

create or replace function public.match_report_nombres()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.reporter_name, '') = '' then
    select coalesce(p.display_name, '') into new.reporter_name from public.profiles p where p.id = new.reporter_id;
  end if;
  if coalesce(new.reported_name, '') = '' then
    select coalesce(p.display_name, '') into new.reported_name from public.profiles p where p.id = new.reported_id;
  end if;
  new.reporter_name := coalesce(new.reporter_name, '');
  new.reported_name := coalesce(new.reported_name, '');
  return new;
end;
$$;

drop trigger if exists match_report_nombres on public.match_reports;
create trigger match_report_nombres
  before insert on public.match_reports
  for each row execute function public.match_report_nombres();

update public.match_reports r
   set reporter_name = coalesce((select p.display_name from public.profiles p where p.id = r.reporter_id), '')
 where r.reporter_name = '';
update public.match_reports r
   set reported_name = coalesce((select p.display_name from public.profiles p where p.id = r.reported_id), '')
 where r.reported_name = '';

-- ---------------------------------------------------------------------------
-- La suspension aguanta el borrado de cuenta
-- ---------------------------------------------------------------------------
alter table public.account_suspensions add column if not exists email_hmac text;
alter table public.account_suspensions drop constraint if exists account_suspensions_user_id_fkey;

create index if not exists account_suspensions_hmac_idx on public.account_suspensions (email_hmac)
  where lifted_at is null;

-- Las que ya estuvieran puestas, con su HMAC.
update public.account_suspensions s
   set email_hmac = public.hmac_correo(public.correo_de(s.user_id))
 where s.email_hmac is null and s.lifted_at is null;

-- Suspender: igual que la 0015 pero guardando el HMAC.
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

  insert into public.account_suspensions (user_id, reason, suspended_by, email_hmac)
  values (p_user_id, v_motivo, v_admin, public.hmac_correo(public.correo_de(p_user_id)))
  on conflict (user_id) do update
    set reason = excluded.reason, suspended_by = excluded.suspended_by,
        email_hmac = excluded.email_hmac, lifted_at = null, lifted_by = null;
  -- Ojo: `created_at` NO se toca al re-suspender. Es la fecha en que empezo la
  -- sancion vigente, y pisarla borraria desde cuando esta fuera.

  delete from public.route_members m where m.user_id = p_user_id;
  update public.match_profiles mp set is_active = false, updated_at = now() where mp.user_id = p_user_id;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'cuenta_suspendida', btrim(coalesce(p_note, '')));

  perform public.crear_aviso(p_user_id, 'cuenta_suspendida', null, v_motivo);
end;
$$;

-- Estar suspendida se mira tambien por el correo: si no, borrarse la cuenta y
-- volver a registrarse con el mismo correo limpiaba la sancion mas dura.
create or replace function public.esta_suspendida(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hmac text;
begin
  if exists (select 1 from public.account_suspensions s
              where s.user_id = p_user_id and s.lifted_at is null) then
    return true;
  end if;
  v_hmac := public.hmac_correo(public.correo_de(p_user_id));
  if v_hmac is null then
    return false;
  end if;
  return exists (select 1 from public.account_suspensions s
                  where s.email_hmac = v_hmac and s.lifted_at is null);
end;
$$;

-- Levantar la suspension: tambien por correo, o a quien volvio no se le podria
-- levantar nunca. Y al levantarla se BORRA el HMAC: el dato vive lo que vive la
-- sancion, ni un dia mas.
create or replace function public.match_admin_unsuspend(p_user_id uuid, p_note text default '')
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_hmac  text := public.hmac_correo(public.correo_de(p_user_id));
  v_filas integer;
begin
  update public.account_suspensions s
     set lifted_at = now(), lifted_by = v_admin, email_hmac = null
   where s.lifted_at is null
     and (s.user_id = p_user_id or (v_hmac is not null and s.email_hmac = v_hmac));
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

-- Mismo problema en el veto de ruta: la fila guarda el id VIEJO, asi que
-- retirarlo con el id nuevo no encontraba nada y el veto se quedaba para
-- siempre. Ahora tambien se busca por correo.
create or replace function public.match_admin_lift_route_ban(p_user_id uuid, p_route_id uuid, p_note text default '')
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_hmac  text := public.hmac_correo(public.correo_de(p_user_id));
  v_filas integer;
begin
  delete from public.route_bans b
   where b.route_id = p_route_id
     and (b.user_id = p_user_id or (v_hmac is not null and b.email_hmac = v_hmac));
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return false;
  end if;

  insert into public.match_moderation_log (admin_id, target_id, action, note)
  values (v_admin, p_user_id, 'veto_retirado', btrim(coalesce(p_note, '')));
  perform public.crear_aviso(p_user_id, 'veto_de_ruta_retirado', p_route_id, btrim(coalesce(p_note, '')));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- El panel lee las denuncias aunque falte quien las protagonizo
-- ---------------------------------------------------------------------------
-- Los `join` de antes eran internos: una denuncia cuya persona se borro la
-- cuenta desaparecia de la bandeja. Ahora son `left join` y el nombre sale del
-- que se guardo al crearla.
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
         r.reporter_id, coalesce(quien.display_name, nullif(r.reporter_name, ''), '(cuenta borrada)'),
         r.reported_id, coalesce(acusada.display_name, nullif(r.reported_name, ''), '(cuenta borrada)'),
         (select count(*)::integer from public.match_report_messages m where m.report_id = r.id),
         r.notified_at, r.handled_by, r.handled_at, r.resolution
    from public.match_reports r
    left join public.profiles quien   on quien.id = r.reporter_id
    left join public.profiles acusada on acusada.id = r.reported_id
   where not coalesce(p_solo_pendientes, true) or r.status <> 'resuelta'
   order by r.created_at;
end;
$$;

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
         r.reporter_id, coalesce(quien.display_name, nullif(r.reporter_name, ''), '(cuenta borrada)'),
         r.reported_id, coalesce(acusada.display_name, nullif(r.reported_name, ''), '(cuenta borrada)'),
         coalesce(acusada.avatar_url, acusada.avatar_thumb_url),
         coalesce(cana.bio, ''),
         coalesce(cana.is_active, false),
         exists (select 1 from public.route_members m
                  where m.route_id = r.route_id and m.user_id = r.reported_id),
         coalesce(acusada.role = 'admin', false),
         coalesce(cana.blocked_at is not null, false),
         exists (select 1 from public.route_bans b
                  where b.route_id = r.route_id and b.user_id = r.reported_id),
         coalesce(public.esta_suspendida(r.reported_id), false),
         (select count(*)::integer from public.match_report_messages m where m.report_id = r.id),
         r.notified_at,
         r.handled_by, admin.display_name, r.handled_at,
         r.resolution, r.handler_note
    from public.match_reports r
    left join public.profiles quien   on quien.id = r.reporter_id
    left join public.profiles acusada on acusada.id = r.reported_id
    join public.routes ruta on ruta.id = r.route_id
    left join public.match_profiles cana on cana.user_id = r.reported_id
    left join public.profiles admin on admin.id = r.handled_by
   where r.id = p_report_id;
end;
$$;

revoke all on function
  public.match_log_nombres(),
  public.match_report_nombres()
from public, anon, authenticated;

revoke all on function
  public.match_admin_reports(boolean),
  public.match_admin_report(uuid)
from public, anon;

grant execute on function
  public.match_admin_reports(boolean),
  public.match_admin_report(uuid)
to authenticated;
