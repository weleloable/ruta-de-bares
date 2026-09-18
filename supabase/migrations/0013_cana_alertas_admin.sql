-- Ruta de Bares - 0013: lo que le faltaba al contrato de admin para la bandeja
-- de "Alertas de administracion".
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0012.
-- Idempotente: se puede re-ejecutar.
--
-- Por que existe: la 0009 dejo el contrato del panel (listar, retirar foto,
-- desactivar, resolver), pero con tres huecos que solo se ven al construir la
-- pantalla:
--
--   1. `status` admite 'en_revision' y NINGUNA funcion lo pone. Con varios
--      admins mirando la misma bandeja desde el movil, dos pueden ponerse con
--      la misma denuncia sin enterarse. `match_admin_take` la reclama.
--   2. La ficha del ticket necesita cosas que `match_admin_reports` no trae
--      (nombre de la ruta, foto de quien esta denunciado, si su cana sigue
--      activa, quien la resolvio). Se podrian pedir sueltas -- un admin puede
--      leer `profiles` y `routes` por RLS -- pero serian tres viajes mas por
--      ticket y la foto es justo lo que hay que mirar para decidir.
--   3. El boton de Mi perfil solo quiere un numero, no la lista entera.
--
-- Sigue sin haber ninguna via a los chats: la denuncia se lleva COPIADOS los
-- mensajes al denunciar (D10) y esto no anade ninguna lectura de la conversacion.

-- ---------------------------------------------------------------------------
-- El registro de moderacion tiene que admitir el nuevo apunte
-- ---------------------------------------------------------------------------
-- Reclamar una denuncia tambien es una accion de moderacion: si alguien pregunta
-- por que tardo dos horas en resolverse, el registro dice quien la cogio y cuando.
alter table public.match_moderation_log drop constraint if exists match_moderation_log_action_check;
alter table public.match_moderation_log add constraint match_moderation_log_action_check
  check (action in ('foto_retirada', 'cana_desactivada', 'sin_accion', 'denuncia_resuelta', 'denuncia_en_revision'));

-- ---------------------------------------------------------------------------
-- Reclamar una denuncia
-- ---------------------------------------------------------------------------
-- Solo pasa de 'pendiente' a 'en_revision'. Si otra persona se adelanto, no
-- falla: la bandeja se refresca y se vera quien la tiene. Que no falle importa
-- porque la pantalla la llama sola al abrir el ticket, no es un boton.
create or replace function public.match_admin_take(p_report_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin  uuid := public.match_admin_require();
  v_target uuid;
begin
  update public.match_reports r
     set status = 'en_revision'
   where r.id = p_report_id
     and r.status = 'pendiente'
  returning r.reported_id into v_target;

  if v_target is null then
    return false;
  end if;

  insert into public.match_moderation_log (report_id, admin_id, target_id, action, note)
  values (p_report_id, v_admin, v_target, 'denuncia_en_revision', '');
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Un ticket entero
-- ---------------------------------------------------------------------------
-- Devuelve la foto grande y no la miniatura: aqui se decide si se retira, y esa
-- decision no se puede tomar sobre una imagen de 400 px.
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
         (select count(*)::integer from public.match_report_messages m where m.report_id = r.id),
         r.notified_at,
         r.handled_by, admin.display_name, r.handled_at,
         r.resolution, r.handler_note
    from public.match_reports r
    join public.profiles quien   on quien.id = r.reporter_id
    join public.profiles acusada on acusada.id = r.reported_id
    join public.routes   ruta    on ruta.id = r.route_id
    -- left: quien denuncian puede no haber activado nunca la cana, y la
    -- denuncia tiene que poder abrirse igual.
    left join public.match_profiles cana on cana.user_id = r.reported_id
    left join public.profiles admin on admin.id = r.handled_by
   where r.id = p_report_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuantas alertas hay sin cerrar
-- ---------------------------------------------------------------------------
-- Para la burbujita del boton de Mi perfil. Se llama a menudo, asi que devuelve
-- un numero y no filas.
create or replace function public.match_admin_alert_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  perform public.match_admin_require();
  select count(*)::integer into v_total
    from public.match_reports r
   where r.status <> 'resuelta';
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
revoke all on function
  public.match_admin_take(uuid),
  public.match_admin_report(uuid),
  public.match_admin_alert_count()
from public, anon;

grant execute on function
  public.match_admin_take(uuid),
  public.match_admin_report(uuid),
  public.match_admin_alert_count()
to authenticated;
