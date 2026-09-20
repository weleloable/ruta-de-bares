-- Ruta de Bares - 0014: expulsar de una ruta desde la bandeja de alertas.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0013.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Sus sentencias no dan error al repetirse, pero definen funciones que una
-- migracion POSTERIOR rehizo: volver a pegarla las devuelve a esta version,
-- en silencio y sin avisar. Ya paso una vez (re-ejecutar la 0006 dejo a
-- match_require_target sin la comprobacion de bloqueos, o sea que la gente
-- bloqueada volvia a poder interactuar). Aqui quedan obsoletas:
--   * match_admin_remove_from_route() la rehace la 0015
--   * match_admin_report() la rehace la 0015
--   * match_admin_resolve() la rehace la 0015
--
-- Por que existe: retirar la foto o apagar la cana no bastan cuando la falta es
-- grave. Quien acosa en una ruta sigue viendo la ruta, sus bares y a su gente,
-- y sigue sellando con todo el mundo alrededor. La medida proporcionada no es
-- borrarle la cuenta -- eso es de la parte de cuentas, no de moderacion -- sino
-- sacarle de LA RUTA en la que se le ha denunciado.
--
-- Que hace exactamente: borra su fila de `route_members`. A partir de ahi la
-- ruta deja de existir para esa persona (`routes_select` e `is_route_member` de
-- la 0004) y tambien desaparece de la cana de esa ruta (`is_route_participant`
-- de la 0012). Es la unica via para borrar de `route_members`: la 0004 le quito
-- el delete a `authenticated` a proposito.
--
-- Que NO hace, a proposito:
--   * No borra su cuenta ni su perfil: puede seguir en otras rutas.
--   * No borra sus sellos. Son historial de lo que paso, no un permiso; si
--     alguna vez vuelve a entrar en la ruta, vuelven a verse.
--   * No impide que vuelva con OTRA invitacion. No hay lista de vetados: si
--     hace falta, la decision es de quien reparte invitaciones.

-- ---------------------------------------------------------------------------
-- Los dos catalogos tienen que admitir la medida nueva
-- ---------------------------------------------------------------------------
alter table public.match_moderation_log drop constraint if exists match_moderation_log_action_check;
alter table public.match_moderation_log add constraint match_moderation_log_action_check
  check (action in ('foto_retirada', 'cana_desactivada', 'sin_accion', 'denuncia_resuelta',
                    'denuncia_en_revision', 'expulsada_de_ruta'));

alter table public.match_reports drop constraint if exists match_reports_resolution_check;
alter table public.match_reports add constraint match_reports_resolution_check
  check (resolution in ('sin_accion', 'foto_retirada', 'cana_desactivada', 'expulsada_de_ruta', 'otra'));

-- ---------------------------------------------------------------------------
-- Expulsar
-- ---------------------------------------------------------------------------
-- `is_admin()` mira a quien llama; aqui hace falta preguntar por OTRA persona.
create or replace function public.is_admin_de(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin'
  );
$$;

-- Devuelve si de verdad estaba dentro: expulsar a quien ya no esta no es un
-- fallo (dos admins a la vez), pero no se apunta como si hubiera pasado algo.
create or replace function public.match_admin_remove_from_route(
  p_user_id uuid,
  p_route_id uuid,
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
  v_admin   uuid := public.match_admin_require();
  v_borrada integer;
begin
  if p_user_id is null or p_route_id is null then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  -- Un admin no puede quedarse sin la ruta por un resbalon en la pantalla.
  if public.is_admin_de(p_user_id) then
    raise exception 'TARGET_IS_ADMIN' using errcode = 'P0001';
  end if;

  delete from public.route_members m
   where m.route_id = p_route_id and m.user_id = p_user_id;
  get diagnostics v_borrada = row_count;

  if v_borrada = 0 then
    return false;
  end if;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, p_user_id, 'expulsada_de_ruta', btrim(coalesce(p_note, '')));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- El ticket tiene que decir si sigue en la ruta
-- ---------------------------------------------------------------------------
-- Sin esto, la pantalla ofreceria expulsar a quien ya no esta. Anadir una
-- columna cambia el tipo de retorno, asi que hay que tirar la funcion antes.
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

-- ---------------------------------------------------------------------------
-- Cerrar una denuncia admite la medida nueva
-- ---------------------------------------------------------------------------
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
     or p_resolution not in ('sin_accion', 'foto_retirada', 'cana_desactivada', 'expulsada_de_ruta', 'otra') then
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
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
-- is_admin_de la usan por dentro las funciones de admin: nadie la llama suelta.
revoke all on function public.is_admin_de(uuid) from public, anon, authenticated;

revoke all on function
  public.match_admin_remove_from_route(uuid, uuid, uuid, text),
  public.match_admin_report(uuid),
  public.match_admin_resolve(uuid, text, text)
from public, anon;

grant execute on function
  public.match_admin_remove_from_route(uuid, uuid, uuid, text),
  public.match_admin_report(uuid),
  public.match_admin_resolve(uuid, text, text)
to authenticated;
