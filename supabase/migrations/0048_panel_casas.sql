-- Ruta de Bares - 0048: panel "Casas y puntuaciones" (solo quien administra).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0047.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * export_my_data() la rehace la 0062
-- Ojo al reves: rehace export_my_data() de la 0044, que ya no se puede volver
-- a pegar despues.
--
-- Que hace. Todo con funciones que empiezan comprobando que quien llama
-- administra (FORBIDDEN si no):
--
--   * `casas_admin_movimientos`: TODOS los puntos, de donde salen y quien los
--     consiguio, con filtros por ruta, casa, persona y actividad.
--   * `casas_admin_anular`: anula un movimiento con motivo (no se borra).
--   * `casas_admin_ajuste`: suma o resta puntos a mano a una casa, con motivo
--     (accion 'ajuste'). Para corregir lo que no es un movimiento (un podio).
--   * `casas_admin_reglas` / `casas_admin_regla`: cuanto vale cada accion.
--     Cambia lo que se de a partir de ahora; los podios se recalculan en vivo.
--   * `casas_admin_personas` / `casas_admin_cambiar_casa`: cambiar a alguien de
--     casa. Sus puntos se mueven con el; los que dependen de companeros
--     (racha y QR, por `detail.usuarios`) se anulan con el motivo. Queda en
--     `house_changes`.
--   * `casas_admin_estadisticas`: las cuatro casas, de una ruta o de todas.
--   * Los limites de consumiciones y QR de cada ruta se cambian sobre `routes`
--     (ya lo permite su politica para admins), y los retos sobre `retos`.
--   * `export_my_data()` anade tus consumiciones, tus encuentros, los cambios
--     de casa y los puntos de racha/QR en los que participaste.
--
-- Errores nuevos: REASON_REQUIRED, INVALID_HOUSE, INVALID_POINTS, NOT_FOUND.

-- Quien cambio a quien de casa, cuando y por que.
create table if not exists public.house_changes (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete cascade,
  de         text,
  a          text not null,
  motivo     text not null,
  movidos    integer not null default 0,
  anulados   integer not null default 0,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.house_changes enable row level security;
revoke all on table public.house_changes from anon, authenticated;

create or replace function public.casas_admin_requerir()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Movimientos
-- ---------------------------------------------------------------------------
create or replace function public.casas_admin_movimientos(
  p_route_id uuid default null,
  p_house text default null,
  p_user_id uuid default null,
  p_action text default null,
  p_incluir_anulados boolean default true,
  p_limite integer default 200
)
returns table (
  id bigint,
  route_id uuid,
  ruta text,
  user_id uuid,
  persona text,
  house text,
  action text,
  points integer,
  ref text,
  detail jsonb,
  created_at timestamptz,
  annulled_at timestamptz,
  annul_reason text,
  anulado_por text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  return query
  select m.id, m.route_id, r.name, m.user_id, p.display_name, m.house, m.action, m.points, m.ref,
         m.detail, m.created_at, m.annulled_at, m.annul_reason, pa.display_name
    from public.point_movements m
    join public.routes r on r.id = m.route_id
    left join public.profiles p on p.id = m.user_id
    left join public.profiles pa on pa.id = m.annulled_by
   where (p_route_id is null or m.route_id = p_route_id)
     and (p_house is null or m.house = p_house)
     and (p_user_id is null or m.user_id = p_user_id
          or coalesce(m.detail -> 'usuarios', '[]'::jsonb) ? p_user_id::text)
     and (p_action is null or m.action = p_action)
     and (p_incluir_anulados or m.annulled_at is null)
   order by m.created_at desc, m.id desc
   limit least(greatest(coalesce(p_limite, 200), 1), 1000);
end;
$$;

create or replace function public.casas_admin_anular(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.point_movements m
     set annulled_at = now(), annulled_by = auth.uid(), annul_reason = trim(p_motivo)
   where m.id = p_id and m.annulled_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.casas_admin_ajuste(
  p_route_id uuid, p_house text, p_points integer, p_motivo text, p_user_id uuid default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  perform public.casas_admin_requerir();
  if p_house is null or p_house not in ('mahou', 'cruzcampo', 'estrella', 'alhambra') then
    raise exception 'INVALID_HOUSE' using errcode = '22023';
  end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000 then
    raise exception 'INVALID_POINTS' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.point_movements (route_id, user_id, house, action, points, ref, detail)
  values (p_route_id, p_user_id, p_house, 'ajuste', p_points, 'ajuste:' || gen_random_uuid(),
          jsonb_build_object('motivo', trim(p_motivo), 'por', auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reglas
-- ---------------------------------------------------------------------------
create or replace function public.casas_admin_reglas()
returns table (action text, points integer, label text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  return query select r.action, r.points, r.label, r.updated_at from public.point_rules r order by r.action;
end;
$$;

create or replace function public.casas_admin_regla(p_action text, p_points integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  if p_points is null or p_points < 0 or p_points > 1000 then
    raise exception 'INVALID_POINTS' using errcode = '22023';
  end if;
  update public.point_rules r
     set points = p_points, updated_at = now(), updated_by = auth.uid()
   where r.action = p_action;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Los podios se leen en vivo de las reglas: que el ranking se entere.
  update public.casas_marcador set cambiado_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Personas y cambio de casa
-- ---------------------------------------------------------------------------
create or replace function public.casas_admin_personas(p_busqueda text default null)
returns table (user_id uuid, nombre text, house text, puntos integer, rutas integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  return query
  select p.id, p.display_name, h.house,
         coalesce((select sum(m.points)::integer from public.point_movements m
                    where m.user_id = p.id and m.annulled_at is null), 0),
         (select count(*)::integer from public.route_members rm where rm.user_id = p.id)
    from public.profiles p
    left join public.user_houses h on h.user_id = p.id
   where p_busqueda is null or trim(p_busqueda) = ''
      or p.display_name ilike '%' || trim(p_busqueda) || '%'
   order by p.display_name
   limit 100;
end;
$$;

create or replace function public.casas_admin_cambiar_casa(p_user_id uuid, p_house text, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_de       text;
  v_movidos  integer;
  v_anulados integer;
  v_motivo   text := trim(coalesce(p_motivo, ''));
begin
  perform public.casas_admin_requerir();
  if p_house is null or p_house not in ('mahou', 'cruzcampo', 'estrella', 'alhambra') then
    raise exception 'INVALID_HOUSE' using errcode = '22023';
  end if;
  if char_length(v_motivo) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select h.house into v_de from public.user_houses h where h.user_id = p_user_id;
  if v_de = p_house then
    return jsonb_build_object('movidos', 0, 'anulados', 0);
  end if;

  insert into public.user_houses (user_id, house) values (p_user_id, p_house)
  on conflict (user_id) do update set house = excluded.house;

  -- Lo suyo se va con el.
  update public.point_movements m set house = p_house
   where m.user_id = p_user_id and m.annulled_at is null and m.action not in ('racha', 'qr');
  get diagnostics v_movidos = row_count;

  -- Lo que hizo con companeros de su casa anterior deja de valer.
  update public.point_movements m
     set annulled_at = now(), annulled_by = auth.uid(),
         annul_reason = 'Cambio de casa: ' || v_motivo
   where m.annulled_at is null and m.action in ('racha', 'qr')
     and coalesce(m.detail -> 'usuarios', '[]'::jsonb) ? p_user_id::text;
  get diagnostics v_anulados = row_count;

  insert into public.house_changes (user_id, de, a, motivo, movidos, anulados, changed_by)
  values (p_user_id, v_de, p_house, v_motivo, v_movidos, v_anulados, auth.uid());

  -- Los podios cuentan por la casa de hoy: que el ranking se entere.
  update public.casas_marcador c set cambiado_at = now()
   where c.route_id in (select rm.route_id from public.route_members rm where rm.user_id = p_user_id);

  return jsonb_build_object('movidos', v_movidos, 'anulados', v_anulados);
end;
$$;

create or replace function public.casas_admin_cambios()
returns table (persona text, de text, a text, motivo text, movidos integer, anulados integer, por text, el timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  return query
  select p.display_name, c.de, c.a, c.motivo, c.movidos, c.anulados, pa.display_name, c.changed_at
    from public.house_changes c
    left join public.profiles p on p.id = c.user_id
    left join public.profiles pa on pa.id = c.changed_by
   order by c.changed_at desc
   limit 100;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estadisticas: de una ruta (con sus podios en vivo) o de todas
-- ---------------------------------------------------------------------------
create or replace function public.casas_admin_estadisticas(p_route_id uuid default null)
returns table (house text, puntos integer, miembros integer, por_accion jsonb, mejor text, mejor_puntos integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  return query
  with casas(house) as (values ('mahou'), ('cruzcampo'), ('estrella'), ('alhambra')),
  movs as (
    select m.house, m.action, m.points, m.user_id
      from public.point_movements m
     where m.annulled_at is null and (p_route_id is null or m.route_id = p_route_id)
  ),
  podios as (
    select pd.house, 'podio_' || pd.puesto as action, pd.points, pd.user_id
      from public.casas_podios(p_route_id) pd
     where p_route_id is not null
  ),
  todo as (select * from movs union all select * from podios),
  por_persona as (
    select t.house, t.user_id, sum(t.points)::integer as pts,
           row_number() over (partition by t.house order by sum(t.points) desc) as n
      from todo t where t.user_id is not null
     group by t.house, t.user_id
  )
  select c.house,
         coalesce((select sum(t.points)::integer from todo t where t.house = c.house), 0),
         case when p_route_id is null
              then (select count(*)::integer from public.user_houses h where h.house = c.house)
              else (select count(*)::integer from public.route_members rm
                      join public.user_houses h on h.user_id = rm.user_id
                     where rm.route_id = p_route_id and h.house = c.house) end,
         coalesce((select jsonb_object_agg(x.action, x.pts) from (
                     select t.action, sum(t.points)::integer as pts from todo t
                      where t.house = c.house group by t.action) x), '{}'::jsonb),
         (select p.display_name from por_persona pp join public.profiles p on p.id = pp.user_id
           where pp.house = c.house and pp.n = 1),
         (select pp.pts from por_persona pp where pp.house = c.house and pp.n = 1)
    from casas c;
end;
$$;

revoke all on function public.casas_admin_requerir() from public, anon, authenticated;
revoke all on function public.casas_admin_movimientos(uuid, text, uuid, text, boolean, integer) from public, anon;
revoke all on function public.casas_admin_anular(bigint, text) from public, anon;
revoke all on function public.casas_admin_ajuste(uuid, text, integer, text, uuid) from public, anon;
revoke all on function public.casas_admin_reglas() from public, anon;
revoke all on function public.casas_admin_regla(text, integer) from public, anon;
revoke all on function public.casas_admin_personas(text) from public, anon;
revoke all on function public.casas_admin_cambiar_casa(uuid, text, text) from public, anon;
revoke all on function public.casas_admin_cambios() from public, anon;
revoke all on function public.casas_admin_estadisticas(uuid) from public, anon;
grant execute on function public.casas_admin_movimientos(uuid, text, uuid, text, boolean, integer) to authenticated;
grant execute on function public.casas_admin_anular(bigint, text) to authenticated;
grant execute on function public.casas_admin_ajuste(uuid, text, integer, text, uuid) to authenticated;
grant execute on function public.casas_admin_reglas() to authenticated;
grant execute on function public.casas_admin_regla(text, integer) to authenticated;
grant execute on function public.casas_admin_personas(text) to authenticated;
grant execute on function public.casas_admin_cambiar_casa(uuid, text, text) to authenticated;
grant execute on function public.casas_admin_cambios() to authenticated;
grant execute on function public.casas_admin_estadisticas(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Descargar tus datos: tambien consumiciones, encuentros y cambios de casa
-- ---------------------------------------------------------------------------
-- Es la export_my_data() de la 0044 tal cual (copiada de su cuerpo, no de
-- memoria): los `puntos` incluyen ademas los de racha/QR en los que estabas, y
-- al final van `consumiciones`, `encuentros` y `cambios_de_casa`.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_hmac text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  v_hmac := public.hmac_correo(public.correo_de(v_uid));

  return jsonb_build_object(
    'generado_el', now(),

    -- `avatar_url` parece un enlace y no lo es: desde la 0023 el bucket es
    -- privado y esa direccion no descarga nada. Se dice aqui, dentro de la
    -- descarga, para que nadie piense que se le esta negando la imagen.
    'sobre_las_fotos',
      'avatar_url y avatar_thumb_url identifican tu foto; no son enlaces para descargarla. '
      || 'Si quieres una copia de la imagen, pidela desde Mi perfil > Escribir a la organizacion.',

    'cuenta', (
      select to_jsonb(x) from (
        select p.id, p.display_name, p.role, p.avatar_url, p.avatar_thumb_url,
               p.created_at, p.updated_at,
               public.correo_de(v_uid) as correo
          from public.profiles p where p.id = v_uid
      ) x
    ),

    -- Como entras y que guarda de ti cada via. Con Google: correo, nombre,
    -- foto e identificador de la cuenta de Google, tal cual los dio Google.
    'acceso', jsonb_build_object(
      'formas_de_entrar', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'via', i.provider,
                 'datos', i.identity_data,
                 'vinculada_el', i.created_at,
                 'ultimo_acceso', i.last_sign_in_at
               ) order by i.created_at)
          from auth.identities i where i.user_id = v_uid
      ), '[]'::jsonb),
      'metadatos_de_la_cuenta', (
        select u.raw_user_meta_data from auth.users u where u.id = v_uid
      )
    ),

    -- A que rutas perteneces. El nombre y la fecha del evento, no la ruta
    -- entera: los bares son de la organizacion, no datos personales tuyos.
    'rutas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'fecha_evento', r.event_date, 'desde', rm.joined_at
             ) order by rm.joined_at)
        from public.route_members rm join public.routes r on r.id = rm.route_id
       where rm.user_id = v_uid
    ), '[]'::jsonb),

    -- Con coordenadas y hora: es dato de localizacion tuyo, y que lo tengamos
    -- es justo lo que hay que poder ensenar.
    'sellos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'bar', b.name, 'ruta', r.name,
               'cuando', s.stamped_at,
               'lat', s.lat, 'lng', s.lng, 'distancia_m', s.distance_m
             ) order by s.stamped_at)
        from public.stamps s
        join public.route_bars b on b.id = s.route_bar_id
        join public.routes r on r.id = b.route_id
       where s.user_id = v_uid
    ), '[]'::jsonb),

    -- Las fotos que enviaste a revision y que se decidio con ellas.
    'fotos_enviadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'enviada_el', a.created_at, 'estado', a.status,
               'motivo_del_rechazo', a.reason, 'decidida_el', a.decided_at
             ) order by a.created_at)
        from public.avatar_requests a where a.user_id = v_uid
    ), '[]'::jsonb),

    -- Lo que se ha decidido sobre ti y por que (art. 17 DSA). Es lo que hace
    -- falta para reclamar, asi que tiene que poder llevarselo quien se va.
    'avisos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'que', n.action, 'motivo', n.reason, 'ruta', n.route_name,
               'fecha', n.created_at, 'leido_el', n.read_at
             ) order by n.created_at)
        from public.user_notices n where n.user_id = v_uid
    ), '[]'::jsonb),

    -- Las sanciones vigentes, con el HMAC incluido.
    'sanciones', jsonb_build_object(
      'suspension', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'motivo', s.reason, 'desde', s.created_at,
                 'levantada_el', s.lifted_at, 'hmac_de_tu_correo', s.email_hmac
               ) order by s.created_at)
          from public.account_suspensions s
         where s.user_id = v_uid or (v_hmac is not null and s.email_hmac = v_hmac)
      ), '[]'::jsonb),
      'vetos_de_ruta', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'ruta', r.name, 'motivo', b.reason, 'desde', b.created_at,
                 'hmac_de_tu_correo', b.email_hmac
               ) order by b.created_at)
          from public.route_bans b join public.routes r on r.id = b.route_id
         where b.user_id = v_uid or (v_hmac is not null and b.email_hmac = v_hmac)
      ), '[]'::jsonb),
      'veto_de_cana', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'motivo', c.reason, 'desde', c.created_at,
                 'hmac_de_tu_correo', c.email_hmac
               ) order by c.created_at)
          from public.cana_bans c
         where c.user_id = v_uid or (v_hmac is not null and c.email_hmac = v_hmac)
      ), '[]'::jsonb)
    ),

    -- Lo de los minijuegos (0034): tu mejor nota por juego y ruta, y las cervezas
    -- que has hecho, con el nombre que les pusiste. Es lo que otras personas de
    -- la ruta ven de ti en el ranking y en la lista de cervezas.
    'minijuegos', jsonb_build_object(
      'records', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'juego', s.game, 'ruta', r.name,
                 'mejor_nota', s.best_score, 'el', s.best_at
               ) order by s.best_at)
          from public.minigame_scores s join public.routes r on r.id = s.route_id
         where s.user_id = v_uid
      ), '[]'::jsonb),
      'cervezas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre', b.name, 'ruta', r.name, 'estilo', b.estilo,
                 'malta', b.malta, 'levadura', b.levadura,
                 'graduacion', b.abv, 'amargor_ibu', b.ibu, 'cuerpo', b.cuerpo,
                 'nota', b.score, 'maceracion', b.maceracion,
                 'amargor', b.amargor, 'aroma', b.aroma, 'siembra', b.siembra, 'el', b.created_at
               ) order by b.created_at)
          from public.maestro_beers b join public.routes r on r.id = b.route_id
         where b.user_id = v_uid
      ), '[]'::jsonb),
      -- "¿Conduces tu?" (0041): tu mejor distancia por ruta y nivel de cañas.
      'conduces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'ruta', r.name, 'nivel_de_canas', c.level,
                 'mejor_distancia_m', c.best_distance, 'el', c.best_at
               ) order by c.best_at)
          from public.conduces_scores c join public.routes r on r.id = c.route_id
         where c.user_id = v_uid
      ), '[]'::jsonb)
    ),

    -- Y lo de la cana, tal cual lo devuelve la funcion de la 0010: se llama en
    -- vez de copiarse, para que no puedan separarse con el tiempo.
    'cana', public.match_export_my_data(),

    -- Tu casa (0043) y los puntos que has conseguido para ella (0044), con su origen.
    'casa', (
      select jsonb_build_object('casa', h.house, 'desde', h.assigned_at)
        from public.user_houses h where h.user_id = v_uid
    ),
    'puntos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'casa', m.house, 'accion', m.action, 'puntos', m.points,
               'el', m.created_at, 'anulado_el', m.annulled_at, 'motivo_anulacion', m.annul_reason
             ) order by m.created_at)
        from public.point_movements m join public.routes r on r.id = m.route_id
       where m.user_id = v_uid
          or coalesce(m.detail -> 'usuarios', '[]'::jsonb) ? v_uid::text
    ), '[]'::jsonb),

    -- Las consumiciones que apuntaste (0045): categoria, bar y hora.
    'consumiciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'bar', b.name, 'categoria', c.categoria,
               'puntuo', c.puntua, 'el', c.created_at
             ) order by c.created_at)
        from public.consumiciones c
        join public.routes r on r.id = c.route_id
        join public.route_bars b on b.id = c.route_bar_id
       where c.user_id = v_uid
    ), '[]'::jsonb),

    -- Los encuentros por QR (0046): con quien (su nombre visible) y cuando.
    'encuentros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ruta', r.name, 'tipo', e.tipo, 'puntuo', e.puntua, 'el', e.created_at,
               'con', (select jsonb_agg(p.display_name) from public.profiles p
                        where p.id = any (e.usuarios) and p.id <> v_uid)
             ) order by e.created_at)
        from public.encuentros e join public.routes r on r.id = e.route_id
       where v_uid = any (e.usuarios)
    ), '[]'::jsonb),

    -- Si se te cambio de casa (0048), de cual a cual y por que.
    'cambios_de_casa', coalesce((
      select jsonb_agg(jsonb_build_object(
               'de', c.de, 'a', c.a, 'motivo', c.motivo, 'el', c.changed_at
             ) order by c.changed_at)
        from public.house_changes c where c.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
