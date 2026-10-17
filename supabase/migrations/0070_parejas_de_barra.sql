-- Ruta de Bares - 0070: Parejas de Barra, el primer minijuego en el que MENOS es mejor.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0069.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * minigame_submit_nota() la rehace la 0071
-- Ojo al reves: rehace minigame_submit_nota() y minigame_ranking() de la 0069, y
-- casas_podios() y admin_estadisticas_actividad() de la 0061, que ya no se
-- pueden volver a pegar despues.
--
-- Orden de despliegue: esta migracion va ANTES que la app. La app vieja no
-- conoce el juego y no nota nada (los demas juegos se comportan igual: lo
-- prueba tests/migration-0070.test.ts). Al reves, con la app nueva y sin esto,
-- guardar una partida de Parejas en la ruta da INVALID_GAME y el record se
-- queda solo en el movil.
--
-- ---------------------------------------------------------------------------
-- Que hace
-- ---------------------------------------------------------------------------
-- Parejas de Barra es un memory de 4 x 4. Su nota es el TIEMPO en resolverlo
-- (segundos con dos decimales) y gana quien MENOS tarda. Hasta ahora todo daba
-- por hecho que mas es mejor: guardar el mayor, ordenar desc, el podio de las
-- casas para las notas mas altas, el "mejor" de las estadisticas con max(). Un
-- solo sitio que se olvide hace que gane quien mas tarda, sin dar error.
--
--   * `minijuego_menos_es_mejor(juego)`: el UNICO sitio de SQL que dice que
--     juegos son "menos es mejor". Hoy solo 'parejas-de-barra'. Su espejo en la
--     app es `JUEGOS_MENOS_ES_MEJOR` (src/features/minijuegos/nota.ts); un test
--     compara las dos listas. Todo lo de abajo pregunta aqui.
--   * `minigame_submit_nota`: para estos juegos guarda el MENOR, e is_record es
--     "ha bajado".
--   * `minigame_ranking`: los ordena de menor a mayor.
--   * `casas_podios`: el podio son los 3 tiempos mas BAJOS. Lo heredan sin
--     tocarlas las funciones de puntos que lo usan (casas_ranking, el cierre, el
--     historico, aportes y estadisticas de casas).
--   * `admin_estadisticas_actividad`: su "mejor" es min() y no max().
--   * los checks de game y de best_score aceptan el juego nuevo: entre 4,00 y 600 s.
--
-- EL TIEMPO LO MANDA EL MOVIL. El servidor no puede saber cuanto se tardo de
-- verdad; lo unico que frena a un cliente trucado que envie "0,01 s" es el
-- rango: por debajo de 4,00 s (TIEMPO_MINIMO de juegos/parejas/modelo.ts, el
-- minimo fisico: 16 cartas sin fallar, cada una esperando a que gire la
-- anterior, 0,25 s) o por encima de 600 s (TIEMPO_MAXIMO), INVALID_SCORE. Y
-- con mas de dos decimales, tambien. Un tramposo puede seguir enviando 4,00:
-- igual que en el resto de juegos, solo se frena, no se evita.

-- ---------------------------------------------------------------------------
-- 1. El sentido de la nota
-- ---------------------------------------------------------------------------
create or replace function public.minijuego_menos_es_mejor(p_game text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_game in ('parejas-de-barra');
$$;
revoke all on function public.minijuego_menos_es_mejor(text) from public, anon;
grant execute on function public.minijuego_menos_es_mejor(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Los checks de game (el de la 0056) y de best_score (el de la 0069), con el juego nuevo
-- ---------------------------------------------------------------------------
alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores
  add constraint minigame_scores_game_check
  check (game in ('cana-perfecta', 'conga-cervecera', 'quien-quiere-ser-cervecero', 'tapon-al-vuelo', 'parejas-de-barra'));

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000 and best_score = trunc(best_score))
    or (game = 'quien-quiere-ser-cervecero' and best_score between 0 and 5 and best_score = trunc(best_score) and best_ms is not null)
    or (game = 'tapon-al-vuelo' and best_score between 0 and 1250 and best_score = trunc(best_score))
    or (game = 'parejas-de-barra' and best_score between 4.00 and 600)
  );

-- ---------------------------------------------------------------------------
-- 3. Guardar: la de la 0069, con el rango del tiempo y el sentido
-- ---------------------------------------------------------------------------
create or replace function public.minigame_submit_nota(p_route_id uuid, p_game text, p_score numeric, p_ms integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.minijuegos_require(p_route_id, true);
  v_min    numeric;
  v_max    integer;
  v_score  numeric;
  v_prev   public.minigame_scores%rowtype;
  v_quiz   boolean := p_game = 'quien-quiere-ser-cervecero';
  v_menos  boolean := public.minijuego_menos_es_mejor(p_game);
  v_ms     integer := case when p_game = 'quien-quiere-ser-cervecero' then p_ms end;
  v_mejora boolean;
begin
  v_max := case p_game
             when 'cana-perfecta' then 100
             when 'conga-cervecera' then 15000
             when 'quien-quiere-ser-cervecero' then 5
             when 'tapon-al-vuelo' then 1250
             when 'parejas-de-barra' then 600
           end;
  if v_max is null then
    raise exception 'INVALID_GAME' using errcode = '22023';
  end if;
  -- Parejas: 4,00 s es el minimo fisico (modelo.ts); por debajo, el cliente miente.
  v_min := case p_game when 'parejas-de-barra' then 4.00 else 0 end;
  if p_score is null or p_score < v_min or p_score > v_max then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;
  -- Dos decimales en la caña (se redondea, como en la 0069) y en Parejas (se
  -- EXIGE: la app ya manda dos, y un tercero es un cliente que no es la app).
  -- En los demas, entero (como siempre).
  if p_game = 'parejas-de-barra' and p_score <> round(p_score, 2) then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;
  v_score := case when p_game = 'cana-perfecta' then round(p_score, 2) else p_score end;
  if p_game not in ('cana-perfecta', 'parejas-de-barra') and v_score <> trunc(v_score) then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;
  -- Cinco preguntas de 30 s como mucho: mas de 10 minutos no es una partida.
  if v_quiz and (v_ms is null or v_ms < 0 or v_ms > 600000) then
    raise exception 'INVALID_TIME' using errcode = '22023';
  end if;

  select * into v_prev from public.minigame_scores
   where route_id = p_route_id and user_id = v_uid and game = p_game
   for update;

  if found and clock_timestamp() - v_prev.last_submit_at < interval '4 seconds' then
    raise exception 'TOO_FAST' using errcode = '54000';
  end if;

  if not found then
    insert into public.minigame_scores (route_id, user_id, game, best_score, best_ms, best_at, last_submit_at)
    values (p_route_id, v_uid, p_game, v_score, v_ms, clock_timestamp(), clock_timestamp());
    return jsonb_build_object('best', v_score, 'best_ms', v_ms, 'is_record', true);
  end if;

  -- Mejor: mas puntos (o MENOS tiempo, en los de minijuego_menos_es_mejor); en el
  -- quiz, con los mismos puntos, menos tiempo.
  v_mejora := case when v_menos then v_score < v_prev.best_score else v_score > v_prev.best_score end
              or (v_quiz and v_score = v_prev.best_score and v_ms < coalesce(v_prev.best_ms, 2147483647));
  update public.minigame_scores
     set best_score = case when v_mejora then v_score else best_score end,
         best_ms = case when v_mejora then v_ms else best_ms end,
         best_at = case when v_mejora then clock_timestamp() else best_at end,
         last_submit_at = clock_timestamp()
   where route_id = p_route_id and user_id = v_uid and game = p_game;
  return jsonb_build_object(
    'best', case when v_mejora then v_score else v_prev.best_score end,
    'best_ms', case when v_mejora then v_ms else v_prev.best_ms end,
    'is_record', v_mejora
  );
end;
$$;
revoke all on function public.minigame_submit_nota(uuid, text, numeric, integer) from public, anon;
grant execute on function public.minigame_submit_nota(uuid, text, numeric, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ranking: la de la 0069, de menor a mayor en los de tiempo
-- ---------------------------------------------------------------------------
-- Mismo tipo de retorno que la 0069: basta con create or replace.
-- "-nota asc" es "nota desc": asi una sola clave de orden vale para los dos sentidos.
create or replace function public.minigame_ranking(p_route_id uuid, p_game text, p_limit integer default 50)
returns table (pos bigint, user_id uuid, display_name text, score numeric, ms integer, achieved_at timestamptz, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.minijuegos_require(p_route_id, false);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_menos boolean := public.minijuego_menos_es_mejor(p_game);
begin
  return query
  with ordenado as (
    select row_number() over (
             order by case when v_menos then s.best_score else -s.best_score end asc,
                      s.best_ms asc nulls last, s.best_at asc) as n,
           s.user_id as uid, p.display_name as nombre, s.best_score as nota, s.best_ms as tiempo, s.best_at as cuando
      from public.minigame_scores s
      join public.profiles p on p.id = s.user_id
     where s.route_id = p_route_id and s.game = p_game
  )
  select o.n, o.uid, o.nombre, o.nota, o.tiempo, o.cuando, (o.uid = v_uid)
    from ordenado o
   where o.n <= v_limit or o.uid = v_uid
   order by o.n;
end;
$$;
revoke all on function public.minigame_ranking(uuid, text, integer) from public, anon;
grant execute on function public.minigame_ranking(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Podio de las casas: la de la 0061, los tiempos mas BAJOS en Parejas
-- ---------------------------------------------------------------------------
create or replace function public.casas_podios(p_route_id uuid)
returns table (juego text, puesto integer, user_id uuid, house text, points integer)
language sql
stable
security definer
set search_path = public
as $$
  with marcas as (
    -- Los juegos de minigame_scores: su ranking de la ruta.
    select s.game as juego, s.user_id, s.best_score::numeric as valor, s.best_ms as ms, s.best_at as cuando
      from public.minigame_scores s
     where s.route_id = p_route_id
    union all
    -- Maestro Cervecero: la mejor cerveza de cada persona (la primera, si empata).
    select 'maestro-cervecero', x.user_id, x.score, null::integer, x.created_at
      from (
        select b.user_id, b.score, b.created_at,
               row_number() over (partition by b.user_id order by b.score desc, b.created_at asc) as n
          from public.maestro_beers b where b.route_id = p_route_id
      ) x where x.n = 1
    union all
    -- ¿Conduces tu?: solo el nivel mas alto con partidas.
    select 'conduces-tu', c.user_id, c.best_distance, null::integer, c.best_at
      from public.conduces_scores c
     where c.route_id = p_route_id
       and c.level = (select max(c2.level) from public.conduces_scores c2 where c2.route_id = p_route_id)
  ),
  ordenadas as (
    -- "-valor asc" es "valor desc": en los de tiempo, el que menos tarda primero.
    select m.juego, m.user_id,
           row_number() over (
             partition by m.juego
             order by case when public.minijuego_menos_es_mejor(m.juego) then m.valor else -m.valor end asc,
                      m.ms asc nulls last, m.cuando asc) as puesto
      from marcas m
     where exists (select 1 from public.route_members rm where rm.route_id = p_route_id and rm.user_id = m.user_id)
  )
  select o.juego, o.puesto::integer, o.user_id, h.house, r.points
    from ordenadas o
    join public.user_houses h on h.user_id = o.user_id
    join public.point_rules r on r.action = 'podio_' || o.puesto
   where o.puesto <= 3;
$$;
revoke all on function public.casas_podios(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Estadisticas de admins: la de la 0061, con min() en los de tiempo
-- ---------------------------------------------------------------------------
create or replace function public.admin_estadisticas_actividad(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'participacion', jsonb_build_object(
      'personas', (select count(*) from public.route_members m where m.route_id = p_route_id),
      'sellaron', (select count(distinct s.user_id) from public.stamps s
                     join public.route_bars b on b.id = s.route_bar_id where b.route_id = p_route_id),
      'consumieron', (select count(distinct q.user_id) from public.consumiciones q where q.route_id = p_route_id),
      'qr', (select count(distinct u) from public.encuentros e, unnest(e.usuarios) as u
              where e.route_id = p_route_id and e.tipo = 'qr'),
      'jugaron', (select count(*) from (
                    select s.user_id from public.minigame_scores s where s.route_id = p_route_id
                    union select b.user_id from public.maestro_beers b where b.route_id = p_route_id
                    union select c.user_id from public.conduces_scores c where c.route_id = p_route_id
                  ) x),
      'cana', (select count(*) from public.match_route_activations a where a.route_id = p_route_id),
      'retos', (select count(distinct m.user_id) from public.point_movements m
                 where m.route_id = p_route_id and m.action = 'reto' and m.annulled_at is null and m.user_id is not null),
      'activos_30min', (select count(*) from (
                          select s.user_id from public.stamps s
                            join public.route_bars b on b.id = s.route_bar_id
                           where b.route_id = p_route_id and s.stamped_at > now() - interval '30 minutes'
                          union select q.user_id from public.consumiciones q
                           where q.route_id = p_route_id and q.created_at > now() - interval '30 minutes'
                          union select u from public.encuentros e, unnest(e.usuarios) as u
                           where e.route_id = p_route_id and e.created_at > now() - interval '30 minutes'
                        ) x)
    ),
    'bares', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', b.name, 'sellos', (
               select count(*) from public.stamps s where s.route_bar_id = b.id))
             order by b.sort_order)
        from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar'
    ), '[]'::jsonb),
    'horas', coalesce((
      select jsonb_agg(jsonb_build_object('hora', h.hora, 'sellos', h.n) order by h.hora)
        from (
          select date_trunc('hour', s.stamped_at) as hora, count(*) as n
            from public.stamps s join public.route_bars b on b.id = s.route_bar_id
           where b.route_id = p_route_id
           group by 1
        ) h
    ), '[]'::jsonb),
    'consumiciones', jsonb_build_object(
      'total', (select count(*) from public.consumiciones q where q.route_id = p_route_id),
      'puntuan', (select count(*) from public.consumiciones q where q.route_id = p_route_id and q.puntua),
      'personas', (select count(distinct q.user_id) from public.consumiciones q where q.route_id = p_route_id),
      'por_categoria', (
        select jsonb_object_agg(c.categoria, (
                 select count(*) from public.consumiciones q where q.route_id = p_route_id and q.categoria = c.categoria))
          from (values ('tercio'), ('jarra'), ('vino'), ('sidra'), ('chupito'), ('copa'), ('sin_alcohol')) as c (categoria)
      )
    ),
    'juegos', coalesce((
      select jsonb_agg(j order by j ->> 'juego')
        from (
          -- El "mejor" de un juego de tiempo es el MENOR.
          select jsonb_build_object('juego', s.game, 'jugadores', count(distinct s.user_id),
                                    'mejor', case when public.minijuego_menos_es_mejor(s.game)
                                                  then min(s.best_score) else max(s.best_score) end) as j
            from public.minigame_scores s where s.route_id = p_route_id group by s.game
          union all
          select jsonb_build_object('juego', 'maestro-cervecero', 'jugadores', count(distinct b.user_id), 'mejor', max(b.score))
            from public.maestro_beers b where b.route_id = p_route_id having count(*) > 0
          union all
          select jsonb_build_object('juego', 'conduces-tu', 'jugadores', count(distinct c.user_id), 'mejor', null)
            from public.conduces_scores c where c.route_id = p_route_id having count(*) > 0
        ) x
    ), '[]'::jsonb),
    'retos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', r.nombre, 'activo', r.activo, 'puntos', r.puntos, 'plazas', r.max_personas,
               'conseguidos', (select count(*) from public.point_movements m
                                where m.route_id = p_route_id and m.action = 'reto' and m.annulled_at is null
                                  and m.detail ->> 'reto' = r.id::text))
             order by r.created_at)
        from public.retos r where r.route_id = p_route_id
    ), '[]'::jsonb),
    'qr', jsonb_build_object(
      'encuentros', (select count(*) from public.encuentros e where e.route_id = p_route_id and e.tipo = 'qr'),
      'puntuan', (select count(*) from public.encuentros e where e.route_id = p_route_id and e.tipo = 'qr' and e.puntua)
    )
  );
end;
$$;
revoke all on function public.admin_estadisticas_actividad(uuid) from public, anon;
grant execute on function public.admin_estadisticas_actividad(uuid) to authenticated;
