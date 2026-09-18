-- Ruta de Bares - 0010: consentimiento, y borrar o descargar tus datos de la cana.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0009.
-- Idempotente: se puede re-ejecutar.
--
-- Por que existe, en una frase por pieza:
--   * A quien das Me gusta y lo que escribis son datos de los que se puede
--     deducir la vida afectiva de una persona, asi que activar la cana no puede
--     ser "pulsar un boton": hace falta un si explicito, informado y guardado,
--     con la version de las condiciones que se acepto.
--   * Quien lo activa tiene que poder llevarse sus datos y borrarlos sin pedir
--     permiso a nadie (derechos de acceso, portabilidad y supresion).
--   * Cada ruta es un evento que termina: lo de la cana no puede quedarse ahi
--     para siempre. match_admin_purge_route borra lo de una ruta pasados N dias.
--
-- Lo que NO borra match_delete_my_data, y por que:
--   * los bloqueos que OTRAS personas te pusieron: borrarlos les devolveria a
--     alguien a quien decidieron no volver a ver;
--   * las denuncias sobre ti y sus mensajes copiados: son la prueba de algo que
--     puede estar sin resolver, y quien organiza tiene que poder responder de
--     ello. Se borran con la ruta (o al resolverlas y purgar).

-- ---------------------------------------------------------------------------
-- Consentimiento guardado
-- ---------------------------------------------------------------------------
alter table public.match_profiles add column if not exists consent_version text;
alter table public.match_profiles add column if not exists consent_at timestamptz;

-- Cambia la firma (una cuarta columna), y eso no lo permite create or replace.
drop function if exists public.match_get_profile();

create or replace function public.match_get_profile()
returns table (
  is_active            boolean,
  bio                  text,
  tag_ids              text[],
  adult_confirmed      boolean,
  has_activated_before boolean,
  consent_version      text
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
  select coalesce(mp.is_active, false),
         coalesce(mp.bio, ''),
         coalesce(
           (select array_agg(pt.tag_id order by pt.tag_id)
              from public.match_profile_tags pt where pt.user_id = v_uid),
           '{}'::text[]
         ),
         mp.adult_confirmed_at is not null,
         mp.first_activated_at is not null,
         mp.consent_version
    from (select v_uid as id) yo
    left join public.match_profiles mp on mp.user_id = yo.id;
end;
$$;

-- La primera activacion exige mayoria de edad Y aceptar las condiciones. Las
-- siguientes (volver de una pausa) no vuelven a preguntar: el si ya esta dado
-- y guardado con su version.
drop function if exists public.match_activate(boolean, text, text[]);

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

  insert into public.match_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_perfil from public.match_profiles mp where mp.user_id = v_uid for update;

  if v_perfil.adult_confirmed_at is null and not coalesce(p_adult_confirmed, false) then
    raise exception 'ADULT_CONFIRMATION_REQUIRED' using errcode = 'P0001';
  end if;
  if v_perfil.consent_at is null then
    if v_version = '' then
      raise exception 'CONSENT_REQUIRED' using errcode = 'P0001';
    end if;
    if char_length(v_version) > 40 then
      raise exception 'CONSENT_VERSION_INVALID' using errcode = '22023';
    end if;
  end if;
  if v_perfil.first_activated_at is null or p_bio is not null then
    perform public.match_save_bio_and_tags(v_uid, p_bio, p_tag_ids);
  end if;

  update public.match_profiles mp
     set is_active = true,
         adult_confirmed_at = coalesce(mp.adult_confirmed_at, now()),
         first_activated_at = coalesce(mp.first_activated_at, now()),
         -- Se guarda el primero que se dio; volver a activar no lo pisa.
         consent_version = coalesce(mp.consent_version, nullif(v_version, '')),
         consent_at = coalesce(mp.consent_at, case when v_version <> '' then now() end),
         updated_at = now()
   where mp.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Descargar lo tuyo (acceso y portabilidad)
-- ---------------------------------------------------------------------------
-- Un solo JSON con lo que la cana guarda de ti. Los mensajes son los QUE TU
-- ESCRIBISTE: los de la otra persona son suyos y no se entregan aqui.
create or replace function public.match_export_my_data()
returns jsonb
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

  return jsonb_build_object(
    'generado_el', now(),
    'perfil', (
      select to_jsonb(x) from (
        select mp.is_active, mp.bio, mp.adult_confirmed_at, mp.first_activated_at,
               mp.consent_version, mp.consent_at, mp.created_at, mp.updated_at,
               (select coalesce(array_agg(pt.tag_id order by pt.tag_id), '{}')
                  from public.match_profile_tags pt where pt.user_id = v_uid) as etiquetas
          from public.match_profiles mp where mp.user_id = v_uid
      ) x
    ),
    'me_gusta_y_vistos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', v.route_id, 'persona', p.display_name, 'valor', v.value, 'fecha', v.updated_at
             ) order by v.updated_at)
        from public.match_votes v join public.profiles p on p.id = v.target_id
       where v.voter_id = v_uid
    ), '[]'::jsonb),
    'conexiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', c.route_id,
               'persona', p.display_name,
               'abierta', c.is_open,
               'desde', c.opened_at,
               'estado_pregunta', c.question_state
             ) order by c.opened_at)
        from public.match_connections c
        join public.profiles p
          on p.id = case when c.user_a = v_uid then c.user_b else c.user_a end
       where v_uid in (c.user_a, c.user_b)
    ), '[]'::jsonb),
    'mensajes_que_enviaste', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo', m.kind, 'texto', m.body, 'respuesta', m.answer, 'fecha', m.created_at
             ) order by m.created_at)
        from public.match_messages m where m.sender_id = v_uid
    ), '[]'::jsonb),
    'personas_que_bloqueaste', coalesce((
      select jsonb_agg(jsonb_build_object('persona', p.display_name, 'fecha', b.created_at) order by b.created_at)
        from public.match_blocks b join public.profiles p on p.id = b.blocked_id
       where b.blocker_id = v_uid
    ), '[]'::jsonb),
    'denuncias_que_pusiste', coalesce((
      select jsonb_agg(jsonb_build_object(
               'motivo', r.reason, 'detalle', r.detail, 'estado', r.status, 'fecha', r.created_at
             ) order by r.created_at)
        from public.match_reports r where r.reporter_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Borrar lo tuyo (supresion)
-- ---------------------------------------------------------------------------
-- Distinto de desactivar, que es una pausa (D8): esto no deja perfil, ni
-- etiquetas, ni votos, ni conexiones, ni mensajes. Devuelve cuantas filas se
-- llevo por delante, para poder ensenarlo y para los tests.
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
  delete from public.match_profiles mp where mp.user_id = v_uid;

  return jsonb_build_object('conexiones', v_conex, 'votos', v_votos, 'mensajes', v_mensajes);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conservacion: lo de una ruta no se queda para siempre
-- ---------------------------------------------------------------------------
-- Para el panel o para una tarea programada. Borra lo de la cana de una ruta
-- cuyo evento fue hace mas de p_days dias (por defecto 30). No toca perfiles ni
-- bloqueos: los perfiles valen para la siguiente ruta y los bloqueos protegen
-- mas alla de un evento.
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

  insert into public.match_moderation_log (admin_id, target_id, action, note)
  values (v_admin, v_admin, 'sin_accion', 'Purga de la ruta ' || p_route_id::text);

  return jsonb_build_object('conexiones', v_conex, 'votos', v_votos, 'denuncias', v_denun);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien puede llamar a que
-- ---------------------------------------------------------------------------
revoke all on function
  public.match_get_profile(),
  public.match_activate(boolean, text, text[], text),
  public.match_export_my_data(),
  public.match_delete_my_data(),
  public.match_admin_purge_route(uuid, integer)
from public, anon;

grant execute on function
  public.match_get_profile(),
  public.match_activate(boolean, text, text[], text),
  public.match_export_my_data(),
  public.match_delete_my_data(),
  public.match_admin_purge_route(uuid, integer)
to authenticated;
