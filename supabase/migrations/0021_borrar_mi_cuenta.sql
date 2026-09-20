-- Ruta de Bares - 0021: borrar tu propia cuenta y todos tus datos.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0020.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Sus sentencias no dan error al repetirse, pero definen funciones que una
-- migracion POSTERIOR rehizo: volver a pegarla las devuelve a esta version,
-- en silencio y sin avisar. Ya paso una vez (re-ejecutar la 0006 dejo a
-- match_require_target sin la comprobacion de bloqueos, o sea que la gente
-- bloqueada volvia a poder interactuar). Aqui quedan obsoletas:
--   * delete_my_account_blockers() la rehace la 0024
--
-- Por que existe. Hasta ahora la app solo dejaba borrar lo de la cana
-- (match_delete_my_data, 0010). La cuenta en si no se podia borrar desde la app,
-- y quien la quiere fuera tiene derecho a ello (art. 17 RGPD) sin pedirselo a
-- nadie. Es una funcion de Postgres y no una Edge Function, como el resto de la
-- app: la regla vive donde manda y no hay pieza nueva que desplegar.
--
-- Que se lleva por delante. Borrar la fila de auth.users arrastra `profiles`
-- (on delete cascade, 0001) y de ahi, tambien en cascada: sellos, pertenencia a
-- rutas, invitaciones creadas, perfil y etiquetas de la cana, votos, conexiones
-- con sus mensajes, TODOS los bloqueos (los que pusiste y los que te pusieron
-- otros: sin cuenta no hay a quien bloquear), avisos y solicitudes de foto.
-- Supabase borra por su cuenta las identidades y sesiones de auth.
--
-- Lo que NO se lleva, y es deliberado (ya lo decidio la 0015 y la 0017): el
-- rastro de moderacion. Registro, denuncias (las que pusiste y las que te
-- pusieron, con sus pruebas), veto de ruta y suspension. Sus claves ajenas son
-- `set null` o no existen: la fila se queda SIN a quien apuntaba, con el nombre
-- de entonces. Si borrarse la cuenta lo limpiase, la sancion mas dura se
-- esquivaria con un clic.
--
-- Limite conocido, sin resolver a proposito: los bloqueos entre personas (los
-- que otra persona te puso) se van con la cuenta, asi que quien vuelve con otro
-- alta no conserva "esta persona me ha bloqueado". Guardarlos pediria un HMAC de
-- correo por cada bloqueo (como 0015/0017) y tampoco pararia a quien use otro
-- correo: el alta es abierta. Es una decision para el dia que haga falta.
--
-- Cuando NO se puede borrar (delete_my_account_blockers), por que, y por que
-- ANTES de tocar nada:
--   * ADMIN_CANNOT_DELETE: `routes.created_by` no tiene cascade (0001), asi que
--     borrar a quien creo una ruta o rompe o se lleva la ruta de todos, y un
--     admin que se borra por un resbalon deja el evento sin nadie al mando. Los
--     admins se crean a mano en Supabase y tambien se quitan a mano.
--   * OWNS_ROUTES: lo mismo para quien fue admin y creo rutas. Sin esto la
--     persona vera un error crudo de clave ajena.
--   * HAS_OPEN_REPORTS: una denuncia SIN RESOLVER sobre ti. La 0017 solo protege
--     una sancion ya puesta; si se pudiese borrar la cuenta con la denuncia
--     abierta, quien organiza no podria vetar (no queda a quien, ni el correo del
--     que sacar el HMAC) y se volveria a entrar con el mismo correo. Es una
--     retencion temporal y acotada: dura hasta que un admin la resuelva
--     (art. 17.3.e RGPD: formulacion o defensa de reclamaciones).
--   * CANA_BLOCKED: la caña desactivada por un admin (blocked_at, 0015) vive en
--     match_profiles, que cae en cascada. Sin esto se borra la cuenta, se vuelve
--     con el mismo correo y activar la caña ya no esta vetado. Se levanta
--     desde Moderacion, como cualquier veto.
-- Una cuenta SUSPENDIDA si puede borrarse (0015): la suspension guarda el HMAC del
-- correo y esta funcion no lo toca (0017).
--
-- Lo que esta funcion NO puede hacer: borrar las fotos del bucket `avatars`.
-- Storage no se deja borrar por SQL. Las borra la app ANTES de llamar aqui, con
-- la policy avatars_delete_own (0001), que solo deja tocar la carpeta propia. Por
-- eso la app pregunta primero por los impedimentos: que no se pierdan las fotos
-- de una cuenta que luego no se puede borrar.

create or replace function public.delete_my_account_blockers()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_res text[] := '{}';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if public.is_admin_de(v_uid) then
    v_res := array_append(v_res, 'ADMIN_CANNOT_DELETE'::text);
  end if;
  if exists (select 1 from public.routes r where r.created_by = v_uid) then
    v_res := array_append(v_res, 'OWNS_ROUTES'::text);
  end if;
  if exists (select 1 from public.match_reports r
              where r.reported_id = v_uid and r.status <> 'resuelta') then
    v_res := array_append(v_res, 'HAS_OPEN_REPORTS'::text);
  end if;
  if exists (select 1 from public.match_profiles mp
              where mp.user_id = v_uid and mp.blocked_at is not null) then
    v_res := array_append(v_res, 'CANA_BLOCKED'::text);
  end if;
  return v_res;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_bloqueos text[];
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  -- Candado ANTES de mirar los impedimentos: una denuncia nueva sobre esta
  -- persona toma un FOR KEY SHARE sobre su fila de profiles (por la clave ajena),
  -- que este FOR UPDATE espera. Sin el, una denuncia que se confirma entre la
  -- comprobacion y el borrado se quedaria sin persona a la que vetar.
  perform 1 from public.profiles p where p.id = v_uid for update;

  v_bloqueos := public.delete_my_account_blockers();
  if array_length(v_bloqueos, 1) is not null then
    raise exception '%', v_bloqueos[1] using errcode = 'P0001';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Borrar lo de la cana ya no borra un veto de la cana
-- ---------------------------------------------------------------------------
-- Encontrado revisando esto: match_delete_my_data (0010) hace `delete from
-- match_profiles`, y ahi vive `blocked_at` (0015). Una persona con la caña
-- desactivada por un admin la reactivaba borrando "sus datos de la caña", sin
-- necesidad de tocar la cuenta. Ahora, si hay veto, la fila se queda con
-- blocked_at, blocked_by y blocked_reason y se vacia TODO lo demas: descripcion,
-- consentimiento y mayoria de edad (al levantar el veto tendria que aceptar de
-- nuevo). Sin veto, se borra entera como antes.
-- Cuerpo copiado de la 0010 salvo la fila de match_profiles.
create or replace function public.match_delete_my_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_conex     integer;
  v_votos     integer;
  v_mensajes  integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select count(*) into v_mensajes from public.match_messages m
    join public.match_connections c on c.id = m.connection_id
   where v_uid in (c.user_a, c.user_b);

  -- Las conexiones se llevan por delante miembros y mensajes (on delete cascade).
  delete from public.match_connections c where v_uid in (c.user_a, c.user_b);
  get diagnostics v_conex = row_count;

  -- En los dos sentidos: lo que votaste y lo que votaron de ti.
  delete from public.match_votes v where v.voter_id = v_uid or v.target_id = v_uid;
  get diagnostics v_votos = row_count;

  -- Los bloqueos que pusiste tu, si. Los que te pusieron a ti se quedan: son la
  -- decision de otra persona de no volver a verte.
  delete from public.match_blocks b where b.blocker_id = v_uid;

  delete from public.match_profile_tags pt where pt.user_id = v_uid;

  delete from public.match_profiles mp where mp.user_id = v_uid and mp.blocked_at is null;
  update public.match_profiles mp
     set is_active = false,
         bio = '',
         adult_confirmed_at = null,
         consent_version = null,
         consent_at = null,
         updated_at = now()
   where mp.user_id = v_uid and mp.blocked_at is not null;

  return jsonb_build_object('conexiones', v_conex, 'votos', v_votos, 'mensajes', v_mensajes);
end;
$$;

revoke all on function public.delete_my_account_blockers(), public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account_blockers(), public.delete_my_account() to authenticated;
