-- Ruta de Bares - 0040: La Cana se activa POR RUTA, y solo el dia de la ruta y cerca de ella.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0039.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define funciones que una migracion POSTERIOR rehizo: volver a pegarla las
-- devuelve a esta version, en silencio y sin avisar. Aqui quedan obsoletas:
--   * match_activate_en_ruta() la rehace la 0042
--   * match_get_profile_en_ruta() la rehace la 0042
--   * match_ventana_cana() la rehace la 0042
--   * match_grid() la rehace la 0051
--   * admin_estadisticas_ruta() la rehace la 0060
-- (Ademas, esta rehace funciones de la 0005, 0009, 0010, 0011, 0024, 0028 y
-- 0037, que tampoco se pueden volver a pegar despues.)
--
-- Que cambia.
--
--   1. **Activada es por ruta.** Antes `match_profiles.is_active` era de la
--      persona: activada en una ruta, activada en todas. Ahora cada ruta tiene
--      su interruptor (`match_route_activations`). El PERFIL (frase, etiquetas,
--      mayoria de edad, consentimiento, veto) sigue siendo uno para toda la app.
--   2. **Activar tiene reglas**, que se comprueban SOLO al activar (nunca
--      despues, y no echan a nadie que ya este dentro):
--        * desde 6 h antes de que abra el PRIMER bar de la ruta hasta que cierra
--          el ULTIMO (primero y ultimo por `sort_order`, el orden de la ruta,
--          como al deducir que una ruta ha terminado);
--        * a 3 km o menos del primer bar (la ubicacion la manda el movil, como
--          al sellar: frena al usuario normal, no a quien la falsee);
--        * una ruta sin bares no se puede activar (no hay ni hora ni sitio).
--      **Los admins no tienen reglas**: la activan cuando y donde quieran.
--
-- Decisiones que conviene conocer:
--
--   * Quien la tenia activada la sigue teniendo: el relleno inicial la activa
--     en TODAS las rutas en las que estaba en ese momento. Solo se hace la vez
--     que se crea la tabla; pegar esto dos veces no reactiva a nadie.
--   * `match_profiles.is_active` se queda, con un significado nuevo y mas
--     flojo: "activada en alguna ruta". Lo mantienen al dia activar y
--     desactivar. Sirve a la app vieja en cache y a las funciones de
--     moderacion, que NO se tocan: vetar, suspender y borrar tus datos siguen
--     poniendo is_active = false, y un disparador quita entonces la activacion
--     de TODAS sus rutas. Moderar sigue siendo por persona.
--   * Si alguien sale de una ruta (lo expulsan, se va), un disparador le quita
--     la activacion de esa ruta: si vuelve, tendra que activarla otra vez.
--   * Desactivar es solo en esa ruta (`match_deactivate_en_ruta`). La vieja
--     `match_deactivate()` sigue existiendo para la app en cache y desactiva
--     en todas, que es lo que esa app cree que hace.
--   * La vieja `match_activate()` ya no activa: lanza APP_UPDATE_REQUIRED. Si
--     siguiera funcionando, la app en cache se saltaria las reglas nuevas.
--   * ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app. Con la app vieja
--     y la base nueva, activar pide actualizar; lo demas funciona.
--
-- Errores nuevos: CANA_ROUTE_WITHOUT_BARS, CANA_NOT_OPEN_YET, CANA_CLOSED,
-- LOCATION_REQUIRED, CANA_TOO_FAR, APP_UPDATE_REQUIRED.

-- ---------------------------------------------------------------------------
-- La tabla, y el relleno inicial (una sola vez)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.match_route_activations') is null then
    create table public.match_route_activations (
      route_id     uuid not null references public.routes (id) on delete cascade,
      user_id      uuid not null references public.match_profiles (user_id) on delete cascade,
      activated_at timestamptz not null default now(),
      primary key (route_id, user_id)
    );
    create index match_route_activations_user_idx on public.match_route_activations (user_id);

    -- Quien la tenia activada, activada en todas las rutas en las que esta ahora.
    insert into public.match_route_activations (route_id, user_id, activated_at)
    select m.route_id, mp.user_id, coalesce(mp.updated_at, now())
      from public.match_profiles mp
      join public.route_members m on m.user_id = mp.user_id
     where mp.is_active
    on conflict do nothing;
  end if;
end;
$$;

-- Como las demas match_*: sin privilegios para la app, todo pasa por funciones.
alter table public.match_route_activations enable row level security;
revoke all on table public.match_route_activations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudantes internos
-- ---------------------------------------------------------------------------
create or replace function public.match_activa_en(p_route_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.match_route_activations a
     where a.route_id = p_route_id and a.user_id = p_user_id
  );
$$;

-- Cuando se puede activar en una ruta y desde donde: abre 6 h antes que el
-- primer bar, cierra con el ultimo, y el sitio es el primer bar. Sin bares, nulos.
create or replace function public.match_ventana_cana(p_route_id uuid)
returns table (desde timestamptz, hasta timestamptz, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select primero.opens_at - interval '6 hours', ultimo.closes_at, primero.lat, primero.lng
    from (select b.opens_at, b.lat, b.lng from public.route_bars b
           where b.route_id = p_route_id order by b.sort_order asc limit 1) primero
   cross join (select b.closes_at from public.route_bars b
                where b.route_id = p_route_id order by b.sort_order desc limit 1) ultimo;
$$;

-- Deja `is_active` como "activada en alguna ruta".
create or replace function public.match_sincronizar_activa(p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.match_profiles mp
     set is_active = exists (select 1 from public.match_route_activations a where a.user_id = p_user_id),
         updated_at = now()
   where mp.user_id = p_user_id
     and mp.is_active is distinct from exists (select 1 from public.match_route_activations a where a.user_id = p_user_id);
$$;

revoke all on function public.match_activa_en(uuid, uuid) from public, anon, authenticated;
revoke all on function public.match_ventana_cana(uuid) from public, anon, authenticated;
revoke all on function public.match_sincronizar_activa(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Disparadores: la moderacion y salir de una ruta quitan la activacion
-- ---------------------------------------------------------------------------
create or replace function public.match_al_desactivar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Vetar, suspender, borrar tus datos o la app vieja: fuera de TODAS las rutas.
  delete from public.match_route_activations a where a.user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists match_profiles_desactivada on public.match_profiles;
create trigger match_profiles_desactivada
  after update of is_active on public.match_profiles
  for each row when (old.is_active and not new.is_active)
  execute function public.match_al_desactivar_perfil();

create or replace function public.match_al_salir_de_ruta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.match_route_activations a
   where a.route_id = old.route_id and a.user_id = old.user_id;
  perform public.match_sincronizar_activa(old.user_id);
  return old;
end;
$$;

drop trigger if exists route_members_salida_cana on public.route_members;
create trigger route_members_salida_cana
  after delete on public.route_members
  for each row execute function public.match_al_salir_de_ruta();

revoke all on function public.match_al_desactivar_perfil() from public, anon, authenticated;
revoke all on function public.match_al_salir_de_ruta() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activar, desactivar y leer el estado EN UNA RUTA (lo que llama la app nueva)
-- ---------------------------------------------------------------------------
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
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
    end if;
    if public.distance_m(p_lat, p_lng, v_ventana.lat, v_ventana.lng) > 3000 then
      raise exception 'CANA_TOO_FAR' using errcode = 'P0001';
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

create or replace function public.match_deactivate_en_ruta(p_route_id uuid)
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
  delete from public.match_route_activations a where a.route_id = p_route_id and a.user_id = v_uid;
  perform public.match_sincronizar_activa(v_uid);
end;
$$;

-- El perfil (que es uno) con lo de ESTA ruta: si esta activada aqui, cuando se
-- puede activar y si a esta persona no le aplican las reglas (admin).
create or replace function public.match_get_profile_en_ruta(p_route_id uuid)
returns table (
  is_active            boolean,
  bio                  text,
  tag_ids              text[],
  adult_confirmed      boolean,
  has_activated_before boolean,
  consent_version      text,
  cana_abre            timestamptz,
  cana_cierra          timestamptz,
  sin_reglas           boolean
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
         public.is_admin_de(v_uid)
    from (select v_uid as id) yo
    left join public.match_profiles mp on mp.user_id = yo.id
    left join lateral public.match_ventana_cana(p_route_id) ventana on true;
end;
$$;

revoke all on function public.match_activate_en_ruta(uuid, double precision, double precision, boolean, text, text[], text) from public, anon;
revoke all on function public.match_deactivate_en_ruta(uuid) from public, anon;
revoke all on function public.match_get_profile_en_ruta(uuid) from public, anon;
grant execute on function public.match_activate_en_ruta(uuid, double precision, double precision, boolean, text, text[], text) to authenticated;
grant execute on function public.match_deactivate_en_ruta(uuid) to authenticated;
grant execute on function public.match_get_profile_en_ruta(uuid) to authenticated;

-- La de la app vieja: activar sin ruta ya no tiene sentido y se saltaria las reglas.
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
begin
  raise exception 'APP_UPDATE_REQUIRED' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo que miraba "activada" pasa a mirar "activada EN ESTA RUTA".
-- Cada una es la version vigente con solo ese cambio.
-- ---------------------------------------------------------------------------

-- De la 0005.
create or replace function public.match_require_member(p_route_id uuid)
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
  if not public.is_route_participant(p_route_id, v_uid) then
    raise exception 'NOT_PARTICIPANT' using errcode = 'P0001';
  end if;
  if not public.match_activa_en(p_route_id, v_uid) then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- De la 0009.
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
  if not public.match_activa_en(v_conn.route_id, v_uid) then
    raise exception 'MATCH_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_other := case when v_conn.user_a = v_uid then v_conn.user_b else v_conn.user_a end;
  if public.match_hay_bloqueo(v_uid, v_other) then
    raise exception 'BLOCKED' using errcode = 'P0001';
  end if;
  -- La otra persona ha pausado la feature EN ESTA RUTA o ya no esta en ella:
  -- la conexion sigue guardada (desactivar es una pausa) pero no se usa.
  if not public.match_activa_en(v_conn.route_id, v_other) or not public.is_route_participant(v_conn.route_id, v_other) then
    raise exception 'CONNECTION_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return v_conn;
end;
$$;

-- De la 0005.
create or replace function public.match_vote(p_route_id uuid, p_target_id uuid, p_value text)
returns table (my_vote text, connection_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := public.match_require_member(p_route_id);
  v_a     uuid;
  v_b     uuid;
  v_other text;
  v_conn  public.match_connections%rowtype;
begin
  if p_value is null or p_value not in ('like', 'dislike') then
    raise exception 'INVALID_VOTE' using errcode = '22023';
  end if;
  if p_target_id is null or p_target_id = v_uid then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if not public.match_activa_en(p_route_id, p_target_id) or not public.is_route_participant(p_route_id, p_target_id) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_a := least(v_uid, p_target_id);
  v_b := greatest(v_uid, p_target_id);
  perform public.match_lock_pair(p_route_id, v_a, v_b);

  insert into public.match_votes (route_id, voter_id, target_id, value)
  values (p_route_id, v_uid, p_target_id, p_value)
  on conflict (route_id, voter_id, target_id)
  do update set value = excluded.value, updated_at = now();

  select mv.value into v_other
    from public.match_votes mv
   where mv.route_id = p_route_id and mv.voter_id = p_target_id and mv.target_id = v_uid;

  select * into v_conn
    from public.match_connections c
   where c.route_id = p_route_id and c.user_a = v_a and c.user_b = v_b
     for update;

  if p_value = 'like' and v_other = 'like' then
    if v_conn.id is null then
      insert into public.match_connections (route_id, user_a, user_b)
      values (p_route_id, v_a, v_b)
      returning * into v_conn;
      insert into public.match_connection_members (connection_id, user_id)
      values (v_conn.id, v_a), (v_conn.id, v_b);
    elsif not v_conn.is_open then
      update public.match_connections c
         set is_open = true, opened_at = now(), closed_at = null
       where c.id = v_conn.id;
    end if;
    return query select p_value, v_conn.id;
  else
    if v_conn.id is not null and v_conn.is_open then
      perform public.match_close_connection(v_conn.id);
    end if;
    return query select p_value, null::uuid;
  end if;
end;
$$;

-- De la 0009.
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
  if not public.match_activa_en(p_route_id, p_target_id) or not public.is_route_participant(p_route_id, p_target_id) then
    raise exception 'TARGET_UNAVAILABLE' using errcode = 'P0001';
  end if;
end;
$$;

-- De la 0009.
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
    join public.match_route_activations a on a.user_id = mp.user_id and a.route_id = p_route_id
    join public.profiles p on p.id = mp.user_id
    left join public.match_votes v
      on v.route_id = p_route_id and v.voter_id = v_uid and v.target_id = p.id
    left join public.match_connections c
      on c.route_id = p_route_id and c.is_open
     and c.user_a = least(v_uid, p.id) and c.user_b = greatest(v_uid, p.id)
   where p.id <> v_uid
     and public.is_route_participant(p_route_id, p.id)
     and not public.match_hay_bloqueo(v_uid, p.id)
   order by (v.value is null) desc, md5(v_uid::text || p.id::text || p_route_id::text);
end;
$$;

-- De la 0011.
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
  unread_count      integer,
  never_opened      boolean
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
         ), 0),
         coalesce((
           select yo.last_read_at = '-infinity'::timestamptz
             from public.match_connection_members yo
            where yo.connection_id = c.id and yo.user_id = v_uid
         ), true)
    from public.match_connections c
    join public.profiles o
      on o.id = case when c.user_a = v_uid then c.user_b else c.user_a end
    join public.match_route_activations oa
      on oa.user_id = o.id and oa.route_id = p_route_id
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

-- De la 0028: "activa" en la ficha de una denuncia es activa EN LA RUTA de la denuncia.
create or replace function public.match_admin_report(p_report_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  reason text,
  detail text,
  route_id uuid,
  route_name text,
  reporter_id uuid,
  reporter_name text,
  reported_id uuid,
  reported_name text,
  reported_avatar_url text,
  reported_bio text,
  reported_active boolean,
  reported_in_route boolean,
  reported_is_admin boolean,
  reported_cana_blocked boolean,
  reported_route_banned boolean,
  reported_suspended boolean,
  mensajes integer,
  notified_at timestamptz,
  handled_by uuid,
  handled_by_name text,
  handled_at timestamptz,
  resolution text,
  handler_note text
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
         coalesce(r.reported_avatar_url, acusada.avatar_url, acusada.avatar_thumb_url),
         coalesce(r.reported_bio, cana.bio, ''),
         public.match_activa_en(r.route_id, r.reported_id),
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

-- De la 0010: "descargar mis datos" dice tambien en que rutas la tienes activada.
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
    'activada_en_las_rutas', coalesce((
      select jsonb_agg(jsonb_build_object('ruta', r.name, 'desde', a.activated_at) order by a.activated_at)
        from public.match_route_activations a join public.routes r on r.id = a.route_id
       where a.user_id = v_uid
    ), '[]'::jsonb),
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

-- De la 0037: cuenta a quien la tiene activada EN ESTA RUTA (antes, en cualquiera).
create or replace function public.admin_estadisticas_ruta(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bares integer;
begin
  perform public.match_admin_require();
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_bares from public.route_bars b where b.route_id = p_route_id;

  return jsonb_build_object(
    'ruta', jsonb_build_object(
      'personas', (select count(*) from public.route_members m where m.route_id = p_route_id),
      'bares', v_bares,
      'sellos', (
        select count(*) from public.stamps s
          join public.route_bars b on b.id = s.route_bar_id
         where b.route_id = p_route_id
      ),
      'han_sellado', (
        select count(distinct s.user_id) from public.stamps s
          join public.route_bars b on b.id = s.route_bar_id
         where b.route_id = p_route_id
      ),
      -- Una ruta sin bares no se puede completar: 0 y no "todos".
      'completaron', case when v_bares = 0 then 0 else (
        select count(*) from (
          select s.user_id from public.stamps s
            join public.route_bars b on b.id = s.route_bar_id
           where b.route_id = p_route_id
           group by s.user_id
          having count(distinct s.route_bar_id) = v_bares
        ) x
      ) end
    ),

    'cana', jsonb_build_object(
      'activada', (
        select count(*) from public.match_route_activations a
          join public.route_members m on m.user_id = a.user_id and m.route_id = a.route_id
         where a.route_id = p_route_id
      ),
      'me_gusta', (
        select count(*) from public.match_votes v where v.route_id = p_route_id and v.value = 'like'
      ),
      'conexiones', (select count(*) from public.match_connections c where c.route_id = p_route_id),
      'conexiones_abiertas', (
        select count(*) from public.match_connections c where c.route_id = p_route_id and c.is_open
      ),
      'preguntas', (
        select count(*) from public.match_connections c
         where c.route_id = p_route_id and c.question_state <> 'none'
      ),
      'si', (
        select count(*) from public.match_connections c
         where c.route_id = p_route_id and c.question_state = 'accepted'
      )
    ),

    -- Las cinco mas elegidas por la gente con La Caña activada EN ESTA RUTA. En
    -- empate, por orden alfabetico, que es como salen en la app.
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('etiqueta', x.label, 'veces', x.veces) order by x.veces desc, x.sort_order)
        from (
          select t.label, t.sort_order, count(*)::integer as veces
            from public.match_profile_tags pt
            join public.match_tags t on t.id = pt.tag_id
            join public.match_route_activations a on a.user_id = pt.user_id and a.route_id = p_route_id
            join public.route_members m on m.user_id = pt.user_id and m.route_id = p_route_id
           group by t.label, t.sort_order
           order by veces desc, t.sort_order
           limit 5
        ) x
    ), '[]'::jsonb),

    'moderacion', jsonb_build_object(
      'denuncias', (select count(*) from public.match_reports r where r.route_id = p_route_id),
      'denuncias_sin_cerrar', (
        select count(*) from public.match_reports r where r.route_id = p_route_id and r.status <> 'resuelta'
      ),
      -- Vetos que siguen puestos en esta ruta: de la ruta y de La Caña. Las
      -- suspensiones de cuenta no son de ninguna ruta (sacan de todas), asi
      -- que no se cuentan aqui.
      'vetos', (
        (select count(*) from public.route_bans b where b.route_id = p_route_id)
        + (select count(*) from public.cana_bans c where c.route_id = p_route_id)
      )
    )
  );
end;
$$;
