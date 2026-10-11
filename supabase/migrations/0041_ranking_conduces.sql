-- Ruta de Bares - 0041: ranking por ruta Y POR NIVEL de "¿Conduces tú?".
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0040.
-- Idempotente: se puede re-ejecutar sin romper nada (`if not exists` y
-- funciones con `or replace`). Ojo al reves: rehace export_my_data() a partir
-- de la 0038, asi que la 0038 ya no se puede volver a pegar despues.
--
-- Que hace. En "¿Conduces tú?" eliges cuantas cañas llevas (nivel 1..N, con N
-- el numero de bares de la ruta) y la puntuacion es la distancia en metros.
-- Solo se comparan partidas del MISMO nivel: ir a 1 caña y a 8 no es el mismo
-- juego. Por eso no cabe en `minigame_scores` (una fila por persona y juego):
-- aqui hay una por persona, ruta y NIVEL.
--
-- Decisiones que conviene conocer:
--
--   * Como la 0034: sin privilegios para la app, todo por funciones SECURITY
--     DEFINER; solo ve y escribe quien esta dentro de la ruta (un admin puede
--     leer); la suspension impide escribir; se guarda solo la mejor.
--   * El nivel tiene que existir en la ruta: de 1 al numero de bares (una ruta
--     sin bares admite el nivel 1). `INVALID_LEVEL` si no.
--   * La distancia NO se puede comprobar: el servidor no ve la partida. Se
--     frena con un tope (1000 km) y el ritmo minimo de la 0034 (4 s entre
--     envios, por nivel). Igual que en los demas juegos.
--   * Envia de vuelta tu puesto en ese nivel y cuantos hay, para la pantalla final.
--   * Se borra con la ruta y con la cuenta (cascade), y sale en "descargar mis
--     datos" (export_my_data, dentro de "minijuegos").
--   * ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app. Si la app llega
--     antes, se juega igual y guarda el record en el movil, pero avisa de que
--     falta una migracion al guardar en la ruta.
--
-- Errores: los de la 0034 (NOT_AUTHENTICATED, FORBIDDEN, SUSPENDED, TOO_FAST,
-- INVALID_SCORE) y INVALID_LEVEL.

create table if not exists public.conduces_scores (
  route_id       uuid not null references public.routes (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  level          smallint not null check (level between 1 and 99),
  best_distance  integer not null check (best_distance between 0 and 1000000),
  best_at        timestamptz not null default now(),
  -- Cuando llego el ULTIMO envio (mejorase o no): para espaciarlos.
  last_submit_at timestamptz not null default now(),
  primary key (route_id, user_id, level)
);

create index if not exists conduces_scores_ranking_idx
  on public.conduces_scores (route_id, level, best_distance desc, best_at);

alter table public.conduces_scores enable row level security;
revoke all on table public.conduces_scores from anon, authenticated;

create or replace function public.conduces_submit_score(p_route_id uuid, p_level integer, p_distance integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.minijuegos_require(p_route_id, true);
  v_max   integer;
  v_prev  public.conduces_scores%rowtype;
  v_best  integer;
  v_at    timestamptz;
  v_rec   boolean;
  v_pos   integer;
  v_total integer;
begin
  select greatest(count(*), 1)::integer into v_max from public.route_bars b where b.route_id = p_route_id;
  if p_level is null or p_level < 1 or p_level > v_max then
    raise exception 'INVALID_LEVEL' using errcode = '22023';
  end if;
  if p_distance is null or p_distance < 0 or p_distance > 1000000 then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;

  select * into v_prev from public.conduces_scores s
   where s.route_id = p_route_id and s.user_id = v_uid and s.level = p_level
   for update;

  if found and clock_timestamp() - v_prev.last_submit_at < interval '4 seconds' then
    raise exception 'TOO_FAST' using errcode = '54000';
  end if;

  if not found then
    insert into public.conduces_scores (route_id, user_id, level, best_distance, best_at, last_submit_at)
    values (p_route_id, v_uid, p_level, p_distance, clock_timestamp(), clock_timestamp());
    v_best := p_distance;
    v_rec := true;
  else
    v_rec := p_distance > v_prev.best_distance;
    v_best := greatest(v_prev.best_distance, p_distance);
    update public.conduces_scores s
       set best_distance = v_best,
           best_at = case when v_rec then clock_timestamp() else s.best_at end,
           last_submit_at = clock_timestamp()
     where s.route_id = p_route_id and s.user_id = v_uid and s.level = p_level;
  end if;

  select s.best_at into v_at from public.conduces_scores s
   where s.route_id = p_route_id and s.user_id = v_uid and s.level = p_level;
  -- El puesto, con el mismo orden que el ranking: mas metros, y en empate quien llego antes.
  select count(*)::integer + 1 into v_pos from public.conduces_scores s
   where s.route_id = p_route_id and s.level = p_level
     and (s.best_distance > v_best or (s.best_distance = v_best and s.best_at < v_at));
  select count(*)::integer into v_total from public.conduces_scores s
   where s.route_id = p_route_id and s.level = p_level;

  return jsonb_build_object('best', v_best, 'is_record', v_rec, 'position', v_pos, 'total', v_total);
end;
$$;

create or replace function public.conduces_ranking(p_route_id uuid, p_level integer, p_limit integer default 50)
returns table (pos bigint, user_id uuid, display_name text, distance integer, achieved_at timestamptz, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.minijuegos_require(p_route_id, false);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  return query
  with ordenado as (
    select row_number() over (order by s.best_distance desc, s.best_at asc) as n,
           s.user_id as uid, p.display_name as nombre, s.best_distance as metros, s.best_at as cuando
      from public.conduces_scores s
      join public.profiles p on p.id = s.user_id
     where s.route_id = p_route_id and s.level = p_level
  )
  select o.n, o.uid, o.nombre, o.metros, o.cuando, (o.uid = v_uid)
    from ordenado o
   where o.n <= v_limit or o.uid = v_uid
   order by o.n;
end;
$$;

revoke all on function public.conduces_submit_score(uuid, integer, integer) from public, anon;
revoke all on function public.conduces_ranking(uuid, integer, integer) from public, anon;
grant execute on function public.conduces_submit_score(uuid, integer, integer) to authenticated;
grant execute on function public.conduces_ranking(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Descargar tus datos: tus distancias de "¿Conduces tú?"
-- ---------------------------------------------------------------------------
-- Es la export_my_data() de la 0038 tal cual (copiada de su cuerpo, no de
-- memoria), con `conduces` dentro de "minijuegos".
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
      -- "¿Conduces tú?" (0041): tu mejor distancia por ruta y nivel de cañas.
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
    'cana', public.match_export_my_data()
  );
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
