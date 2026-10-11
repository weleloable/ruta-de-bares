-- Ruta de Bares - 0042: las reglas para activar La Cana se ajustan en cada ruta.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0041.
-- Idempotente: se puede re-ejecutar sin romper nada (`add column if not
-- exists`, restricciones quitadas antes de ponerlas y funciones rehechas).
-- Ojo al reves: rehace funciones de la 0040, que ya no se puede volver a pegar despues.
--
-- Que cambia. La 0040 dejo fijas las dos reglas de activar La Cana para quien
-- no es admin: desde 6 h antes de que abra el primer bar, y a 3 km o menos de
-- el. Ahora son de cada ruta y se tocan desde el editor:
--
--   * `routes.cana_horas_antes` (0..24, por defecto 6): cuantas horas antes de
--     que abra el primer bar se puede activar. 0 = desde que abre.
--   * `routes.cana_radio_km` (0,5..20, por defecto 3): distancia maxima al
--     primer bar. NULL = sin limite (no se pide la ubicacion).
--
-- Las rutas que ya existen se quedan con 6 h y 3 km, que es lo que tenian.
-- El cierre sigue siendo el del ultimo bar. Las columnas las escribe quien ya
-- podia editar la ruta (la politica `routes_write`, solo admins).

alter table public.routes add column if not exists cana_horas_antes smallint not null default 6;
alter table public.routes add column if not exists cana_radio_km numeric(3, 1) default 3;

alter table public.routes drop constraint if exists routes_cana_horas_antes_check;
alter table public.routes
  add constraint routes_cana_horas_antes_check check (cana_horas_antes between 0 and 24);
alter table public.routes drop constraint if exists routes_cana_radio_km_check;
alter table public.routes
  add constraint routes_cana_radio_km_check check (cana_radio_km is null or cana_radio_km between 0.5 and 20);

-- La ventana de la 0040, con las horas y el radio de la ruta. Cambia lo que
-- devuelve (anade el radio), y eso Postgres no lo deja hacer con `or replace`.
drop function if exists public.match_ventana_cana(uuid);
create function public.match_ventana_cana(p_route_id uuid)
returns table (desde timestamptz, hasta timestamptz, lat double precision, lng double precision, radio_m double precision)
language sql
stable
security definer
set search_path = public
as $$
  select primero.opens_at - make_interval(hours => r.cana_horas_antes),
         ultimo.closes_at,
         primero.lat,
         primero.lng,
         r.cana_radio_km::double precision * 1000
    from public.routes r
   cross join (select b.opens_at, b.lat, b.lng from public.route_bars b
                where b.route_id = p_route_id order by b.sort_order asc limit 1) primero
   cross join (select b.closes_at from public.route_bars b
                where b.route_id = p_route_id order by b.sort_order desc limit 1) ultimo
   where r.id = p_route_id;
$$;
revoke all on function public.match_ventana_cana(uuid) from public, anon, authenticated;

-- De la 0040: la distancia es la de la ruta, y sin limite no se pide ubicacion.
create or replace function public.match_activate_en_ruta(
  p_route_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
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
  v_ventana record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if public.esta_suspendida(v_uid) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = 'P0001';
  end if;
  if not public.is_route_participant(p_route_id, v_uid) then
    raise exception 'NOT_PARTICIPANT' using errcode = 'P0001';
  end if;

  insert into public.match_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_perfil from public.match_profiles mp where mp.user_id = v_uid for update;

  -- El veto va ANTES que nada, como en la 0024.
  if v_perfil.blocked_at is not null or public.esta_vetada_de_cana(v_uid) then
    raise exception 'CANA_BLOCKED' using errcode = 'P0001';
  end if;

  -- Las reglas, solo para quien NO la tiene ya activada aqui (volver a pulsar
  -- no es activar) y no es admin. Antes que la frase: no hacerle escribirla
  -- para luego decirle que vuelva otro dia.
  if not public.match_activa_en(p_route_id, v_uid) and not public.is_admin_de(v_uid) then
    select * into v_ventana from public.match_ventana_cana(p_route_id);
    if v_ventana.desde is null or v_ventana.hasta is null then
      raise exception 'CANA_ROUTE_WITHOUT_BARS' using errcode = 'P0001';
    end if;
    if now() < v_ventana.desde then
      raise exception 'CANA_NOT_OPEN_YET' using errcode = 'P0001';
    end if;
    if now() > v_ventana.hasta then
      raise exception 'CANA_CLOSED' using errcode = 'P0001';
    end if;
    if v_ventana.radio_m is not null then
      if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
        raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
      end if;
      if public.distance_m(p_lat, p_lng, v_ventana.lat, v_ventana.lng) > v_ventana.radio_m then
        raise exception 'CANA_TOO_FAR' using errcode = 'P0001';
      end if;
    end if;
  end if;

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
         consent_version = coalesce(mp.consent_version, nullif(v_version, '')),
         consent_at = coalesce(mp.consent_at, case when v_version <> '' then now() end),
         updated_at = now()
   where mp.user_id = v_uid;

  insert into public.match_route_activations (route_id, user_id)
  values (p_route_id, v_uid)
  on conflict do nothing;
end;
$$;

-- De la 0040, con el radio de la ruta (NULL = sin limite) para que la pantalla
-- sepa si tiene que pedir la ubicacion. Cambia lo que devuelve: hay que borrarla antes.
drop function if exists public.match_get_profile_en_ruta(uuid);
create function public.match_get_profile_en_ruta(p_route_id uuid)
returns table (
  is_active            boolean,
  bio                  text,
  tag_ids              text[],
  adult_confirmed      boolean,
  has_activated_before boolean,
  consent_version      text,
  cana_abre            timestamptz,
  cana_cierra          timestamptz,
  sin_reglas           boolean,
  cana_radio_km        numeric
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
  select public.match_activa_en(p_route_id, v_uid),
         coalesce(mp.bio, ''),
         coalesce(
           (select array_agg(pt.tag_id order by pt.tag_id)
              from public.match_profile_tags pt where pt.user_id = v_uid),
           '{}'::text[]
         ),
         coalesce(mp.adult_confirmed_at is not null, false),
         coalesce(mp.first_activated_at is not null, false),
         mp.consent_version,
         ventana.desde,
         ventana.hasta,
         public.is_admin_de(v_uid),
         (select r.cana_radio_km from public.routes r where r.id = p_route_id)
    from (select v_uid as id) yo
    left join public.match_profiles mp on mp.user_id = yo.id
    left join lateral public.match_ventana_cana(p_route_id) ventana on true;
end;
$$;

revoke all on function public.match_get_profile_en_ruta(uuid) from public, anon;
grant execute on function public.match_get_profile_en_ruta(uuid) to authenticated;
