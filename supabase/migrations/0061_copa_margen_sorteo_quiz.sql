-- Ruta de Bares - 0061: copa, margen de sellado, sorteo y nueva puntuacion del quiz.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0060.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define funciones que una migracion POSTERIOR rehizo: volver a pegarla las
-- devuelve a esta version, en silencio y sin avisar. Aqui quedan obsoletas:
--   * sorteo_elegibles() la rehace la 0063
--   * sorteo_estado() la rehace la 0063
--   * minigame_submit_score() la rehace la 0069
--   * minigame_ranking() la rehace la 0069
-- Ojo al reves: rehace funciones de la 0034, 0044, 0045, 0056 y 0060, que ya no
-- se pueden volver a pegar despues.
--
-- Que hace.
--
--   1. COPA: nueva categoria de consumicion ('copa'). Es con alcohol: en los
--      retos de "X de una categoria" sigue el tope de 3.
--   2. MARGEN DE SELLADO: `route_bars.margen_min` (0 a 180 min, por defecto 0).
--      Se puede sellar desde `opens_at - margen` hasta `closes_at + margen`
--      (`claim_stamp`). El horario que se ensena sigue siendo el oficial, y el
--      de la ruta (La Cana, fin de ruta) no cambia.
--   3. SORTEO: por ruta (`routes.sorteo_activo`, `sorteo_premio`). Entra quien
--      ha sellado TODOS los bares de la ruta (admins incluidos). Un admin lo
--      hace con `sorteo_realizar`: ganador y dos suplentes al azar, guardados
--      en `sorteos`. Repetirlo exige un motivo y deja rastro (la tirada vieja
--      queda como no vigente). `sorteo_estado` dice a la gente de la ruta si
--      esta dentro y, cuando se hace, quien ha ganado (lo ve toda la ruta).
--   4. QUIZ "¿Quien quiere ser cervecero?": un punto por pregunta acertada (de
--      0 a 5) y, si empatan, gana quien tardo MENOS en contestar
--      (`minigame_scores.best_ms`). Las notas de la escala vieja (hasta 25) se
--      borran: el ranking del quiz empieza de cero. `minigame_submit_score`
--      acepta el tiempo, y `minigame_ranking` y los podios de las casas
--      (`casas_podios`) desempatan por el.

-- ---------------------------------------------------------------------------
-- 1. Copa
-- ---------------------------------------------------------------------------
alter table public.consumiciones drop constraint if exists consumiciones_categoria_check;
alter table public.consumiciones add constraint consumiciones_categoria_check
  check (categoria in ('tercio', 'jarra', 'vino', 'sidra', 'chupito', 'copa', 'sin_alcohol'));
alter table public.retos drop constraint if exists retos_categoria_check;
alter table public.retos add constraint retos_categoria_check
  check (categoria in ('tercio', 'jarra', 'vino', 'sidra', 'chupito', 'copa', 'sin_alcohol'));

-- registrar_consumicion (de la 0045), con la copa
create or replace function public.registrar_consumicion(p_route_bar_id uuid, p_categoria text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_ruta    public.routes%rowtype;
  v_ruta_id uuid;
  v_ultimo  uuid;
  v_prev    timestamptz;
  v_casa    text;
  v_id      uuid;
  v_en_bar  integer;
  v_en_ruta integer;
  v_puntua  boolean;
  v_nueva   boolean;
  v_puntos  integer := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_categoria is null or p_categoria not in ('tercio', 'jarra', 'vino', 'sidra', 'chupito', 'copa', 'sin_alcohol') then
    raise exception 'INVALID_CATEGORY' using errcode = '22023';
  end if;
  select b.route_id into v_ruta_id from public.route_bars b where b.id = p_route_bar_id;
  if v_ruta_id is null or not public.is_route_participant(v_ruta_id, v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if public.esta_suspendida(v_uid) then
    raise exception 'SUSPENDED' using errcode = '42501';
  end if;
  -- Una a la vez por persona: dos toques seguidos no se cuelan los dos.
  perform pg_advisory_xact_lock(hashtext('consumicion:' || v_uid::text));

  if not exists (select 1 from public.stamps s where s.user_id = v_uid and s.route_bar_id = p_route_bar_id) then
    raise exception 'NOT_STAMPED' using errcode = 'P0001';
  end if;
  select s.route_bar_id into v_ultimo
    from public.stamps s join public.route_bars b on b.id = s.route_bar_id
   where s.user_id = v_uid and b.route_id = v_ruta_id
   order by s.stamped_at desc limit 1;
  if v_ultimo is distinct from p_route_bar_id then
    raise exception 'NOT_LAST_BAR' using errcode = 'P0001';
  end if;

  select * into v_ruta from public.routes r where r.id = v_ruta_id;
  select max(c.created_at) into v_prev from public.consumiciones c where c.user_id = v_uid and c.route_id = v_ruta_id;
  if v_prev is not null and now() < v_prev + make_interval(mins => v_ruta.consumo_minutos) then
    raise exception 'TOO_SOON' using errcode = 'P0001';
  end if;

  select count(*) into v_en_bar from public.consumiciones c
   where c.user_id = v_uid and c.route_bar_id = p_route_bar_id and c.puntua;
  select count(*) into v_en_ruta from public.consumiciones c
   where c.user_id = v_uid and c.route_id = v_ruta_id and c.puntua;
  v_puntua := v_en_bar < v_ruta.consumo_por_bar and v_en_ruta < v_ruta.consumo_por_ruta;
  v_nueva := not exists (
    select 1 from public.consumiciones c where c.user_id = v_uid and c.route_id = v_ruta_id and c.categoria = p_categoria
  );

  insert into public.consumiciones (route_id, route_bar_id, user_id, categoria, puntua)
  values (v_ruta_id, p_route_bar_id, v_uid, p_categoria, v_puntua)
  returning id into v_id;

  v_casa := public.asignar_casa(v_uid, v_ruta_id);
  if v_puntua and public.puntos_otorgar(v_ruta_id, v_uid, v_casa, 'consumicion', 'consumicion:' || v_id) then
    v_puntos := v_puntos + (select r.points from public.point_rules r where r.action = 'consumicion');
  end if;
  if v_nueva and (
    select count(*) from public.point_movements m
     where m.route_id = v_ruta_id and m.user_id = v_uid and m.action = 'categoria_nueva' and m.annulled_at is null
  ) < v_ruta.variedad_max then
    if public.puntos_otorgar(v_ruta_id, v_uid, v_casa, 'categoria_nueva', 'categoria:' || v_uid || ':' || p_categoria) then
      v_puntos := v_puntos + (select r.points from public.point_rules r where r.action = 'categoria_nueva');
    else
      v_nueva := false;
    end if;
  else
    v_nueva := false;
  end if;

  return jsonb_build_object(
    'puntos', v_puntos,
    'casa', v_casa,
    'puntua', v_puntua,
    'categoria_nueva', v_nueva,
    'siguiente', now() + make_interval(mins => v_ruta.consumo_minutos)
  );
end;
$$;

-- admin_estadisticas_actividad (de la 0060), con la copa
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
          select jsonb_build_object('juego', s.game, 'jugadores', count(distinct s.user_id), 'mejor', max(s.best_score)) as j
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

-- ---------------------------------------------------------------------------
-- 2. Margen de sellado
-- ---------------------------------------------------------------------------
alter table public.route_bars add column if not exists margen_min smallint not null default 0;
alter table public.route_bars drop constraint if exists route_bars_margen_check;
alter table public.route_bars add constraint route_bars_margen_check check (margen_min between 0 and 180);

-- claim_stamp (de la 0060), con el margen
create or replace function public.claim_stamp(
  p_route_bar_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns public.stamps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_bar   public.route_bars%rowtype;
  v_pub   boolean;
  v_dist  double precision;
  v_stamp public.stamps%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select * into v_bar from public.route_bars where id = p_route_bar_id;
  if not found then
    raise exception 'BAR_NOT_FOUND' using errcode = 'P0002';
  end if;

  select r.is_published into v_pub from public.routes r where r.id = v_bar.route_id;
  if not coalesce(v_pub, false) and not public.is_admin() then
    raise exception 'ROUTE_NOT_PUBLISHED' using errcode = 'P0001';
  end if;

  if not public.is_admin() and not public.is_route_member(v_bar.route_id) then
    raise exception 'NOT_A_MEMBER' using errcode = 'P0001';
  end if;

  -- Una parada que no es un bar (foto, otra) no se sella: se ve en el mapa y ya.
  if v_bar.tipo <> 'bar' then
    raise exception 'NOT_STAMPABLE' using errcode = 'P0001';
  end if;

  -- Idempotente: volver a sellar un bar ya sellado devuelve el sello original
  -- en vez de fallar, aunque la ventana ya se haya cerrado.
  select * into v_stamp from public.stamps
   where user_id = v_uid and route_bar_id = p_route_bar_id;
  if found then
    return v_stamp;
  end if;

  -- El horario oficial, ensanchado por el margen de la parada (0061): los
  -- horarios se mueven un poco en la noche y no se quiere dejar a nadie sin sello.
  if now() < v_bar.opens_at - make_interval(mins => v_bar.margen_min) then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;
  if now() > v_bar.closes_at + make_interval(mins => v_bar.margen_min) then
    raise exception 'TOO_LATE' using errcode = 'P0001';
  end if;

  v_dist := public.distance_m(p_lat, p_lng, v_bar.lat, v_bar.lng);
  if v_dist > v_bar.radius_m then
    raise exception 'TOO_FAR_%', round(v_dist)::text using errcode = 'P0001';
  end if;

  insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m)
  values (v_uid, p_route_bar_id, p_lat, p_lng, v_dist)
  returning * into v_stamp;

  return v_stamp;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Sorteo
-- ---------------------------------------------------------------------------
alter table public.routes add column if not exists sorteo_activo boolean not null default false;
alter table public.routes add column if not exists sorteo_premio text not null default '';
alter table public.routes drop constraint if exists routes_sorteo_premio_check;
alter table public.routes add constraint routes_sorteo_premio_check check (char_length(sorteo_premio) <= 60);

create table if not exists public.sorteos (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references public.routes (id) on delete cascade,
  premio        text not null,
  ganador       uuid references public.profiles (id) on delete set null,
  suplentes     uuid[] not null default '{}',
  participantes integer not null,
  -- Solo una tirada vigente por ruta; las repetidas quedan con su motivo.
  vigente       boolean not null default true,
  motivo        text,
  realizado_at  timestamptz not null default now(),
  realizado_por uuid references public.profiles (id) on delete set null
);
create unique index if not exists sorteos_vigente_idx on public.sorteos (route_id) where vigente;
alter table public.sorteos enable row level security;
revoke all on table public.sorteos from anon, authenticated;

-- Quien entra: ha sellado todos los bares (solo 'bar', 0060) de la ruta.
create or replace function public.sorteo_elegibles(p_route_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with bares as (select b.id from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar')
  select rm.user_id
    from public.route_members rm
   where rm.route_id = p_route_id
     and (select count(*) from bares) > 0
     and (select count(distinct s.route_bar_id) from public.stamps s
           where s.user_id = rm.user_id and s.route_bar_id in (select id from bares)) = (select count(*) from bares);
$$;

create or replace function public.sorteo_realizar(p_route_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ruta     public.routes%rowtype;
  v_elegidos uuid[];
  v_total    integer;
  v_motivo   text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  perform public.casas_admin_requerir();
  select * into v_ruta from public.routes r where r.id = p_route_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not v_ruta.sorteo_activo then
    raise exception 'SORTEO_INACTIVO' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('sorteo:' || p_route_id));

  if exists (select 1 from public.sorteos s where s.route_id = p_route_id and s.vigente) then
    if v_motivo is null then
      raise exception 'ALREADY_DRAWN' using errcode = 'P0001';
    end if;
    if char_length(v_motivo) < 3 then
      raise exception 'REASON_REQUIRED' using errcode = '22023';
    end if;
    update public.sorteos s set vigente = false where s.route_id = p_route_id and s.vigente;
  end if;

  select count(*)::integer into v_total from public.sorteo_elegibles(p_route_id);
  if v_total = 0 then
    raise exception 'NO_PARTICIPANTS' using errcode = 'P0001';
  end if;
  select array_agg(u) into v_elegidos
    from (select u from public.sorteo_elegibles(p_route_id) u order by random() limit 3) x;

  insert into public.sorteos (route_id, premio, ganador, suplentes, participantes, motivo, realizado_por)
  values (p_route_id, coalesce(nullif(v_ruta.sorteo_premio, ''), 'el premio'), v_elegidos[1],
          coalesce(v_elegidos[2:3], '{}'), v_total, v_motivo, auth.uid());

  return jsonb_build_object(
    'ganador', (select p.display_name from public.profiles p where p.id = v_elegidos[1]),
    'suplentes', coalesce((select jsonb_agg(p.display_name order by array_position(v_elegidos, p.id))
                             from public.profiles p where p.id = any (v_elegidos[2:3])), '[]'::jsonb),
    'participantes', v_total,
    -- Todos los nombres que entraban, para la ruleta (que se para en el ganador ya elegido).
    'nombres', coalesce((select jsonb_agg(p.display_name order by p.display_name)
                           from public.profiles p where p.id in (select public.sorteo_elegibles(p_route_id))), '[]'::jsonb)
  );
end;
$$;

-- Lo que ve la gente de la ruta: si hay sorteo, si estas dentro y, si ya se hizo, quien gano.
create or replace function public.sorteo_estado(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_ruta public.routes%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not (public.is_route_participant(p_route_id, v_uid) or public.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_ruta from public.routes r where r.id = p_route_id;
  return jsonb_build_object(
    'activo', coalesce(v_ruta.sorteo_activo, false),
    'premio', coalesce(v_ruta.sorteo_premio, ''),
    'bares', (select count(*) from public.route_bars b where b.route_id = p_route_id and b.tipo = 'bar'),
    'participantes', (select count(*) from public.sorteo_elegibles(p_route_id)),
    'dentro', exists (select 1 from public.sorteo_elegibles(p_route_id) u where u = v_uid),
    'resultado', (
      select jsonb_build_object(
               'premio', s.premio,
               'ganador', (select p.display_name from public.profiles p where p.id = s.ganador),
               'soy_ganador', s.ganador = v_uid,
               'suplentes', coalesce((select jsonb_agg(p.display_name order by array_position(s.suplentes, p.id))
                                        from public.profiles p where p.id = any (s.suplentes)), '[]'::jsonb),
               'participantes', s.participantes,
               'realizado_at', s.realizado_at)
        from public.sorteos s where s.route_id = p_route_id and s.vigente
    )
  );
end;
$$;

revoke all on function public.sorteo_elegibles(uuid) from public, anon, authenticated;
revoke all on function public.sorteo_realizar(uuid, text) from public, anon;
revoke all on function public.sorteo_estado(uuid) from public, anon;
grant execute on function public.sorteo_realizar(uuid, text) to authenticated;
grant execute on function public.sorteo_estado(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Quiz: un punto por acierto y desempate por tiempo
-- ---------------------------------------------------------------------------
alter table public.minigame_scores add column if not exists best_ms integer;
alter table public.minigame_scores drop constraint if exists minigame_scores_best_ms_check;
alter table public.minigame_scores add constraint minigame_scores_best_ms_check
  check (best_ms is null or best_ms between 0 and 3600000);

-- La escala vieja (hasta 25) no se compara con la nueva (hasta 5): fuera. Solo
-- las que no traen tiempo, asi que volver a pegar esto no borra las nuevas.
delete from public.minigame_scores where game = 'quien-quiere-ser-cervecero' and best_ms is null;

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000)
    or (game = 'quien-quiere-ser-cervecero' and best_score between 0 and 5 and best_ms is not null)
    or (game = 'tapon-al-vuelo' and best_score between 0 and 1250)
  );

-- La de la 0056, con el tiempo: en el quiz es obligatorio y desempata.
drop function if exists public.minigame_submit_score(uuid, text, integer);
create or replace function public.minigame_submit_score(p_route_id uuid, p_game text, p_score integer, p_ms integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.minijuegos_require(p_route_id, true);
  v_max    integer;
  v_prev   public.minigame_scores%rowtype;
  v_quiz   boolean := p_game = 'quien-quiere-ser-cervecero';
  v_ms     integer := case when p_game = 'quien-quiere-ser-cervecero' then p_ms end;
  v_mejora boolean;
begin
  v_max := case p_game
             when 'cana-perfecta' then 100
             when 'conga-cervecera' then 15000
             when 'quien-quiere-ser-cervecero' then 5
             when 'tapon-al-vuelo' then 1250
           end;
  if v_max is null then
    raise exception 'INVALID_GAME' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > v_max then
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
    values (p_route_id, v_uid, p_game, p_score, v_ms, clock_timestamp(), clock_timestamp());
    return jsonb_build_object('best', p_score, 'best_ms', v_ms, 'is_record', true);
  end if;

  -- Mejor: mas puntos; en el quiz, con los mismos puntos, menos tiempo.
  v_mejora := p_score > v_prev.best_score
              or (v_quiz and p_score = v_prev.best_score and v_ms < coalesce(v_prev.best_ms, 2147483647));
  update public.minigame_scores
     set best_score = case when v_mejora then p_score else best_score end,
         best_ms = case when v_mejora then v_ms else best_ms end,
         best_at = case when v_mejora then clock_timestamp() else best_at end,
         last_submit_at = clock_timestamp()
   where route_id = p_route_id and user_id = v_uid and game = p_game;
  return jsonb_build_object(
    'best', case when v_mejora then p_score else v_prev.best_score end,
    'best_ms', case when v_mejora then v_ms else v_prev.best_ms end,
    'is_record', v_mejora
  );
end;
$$;
revoke all on function public.minigame_submit_score(uuid, text, integer, integer) from public, anon;
grant execute on function public.minigame_submit_score(uuid, text, integer, integer) to authenticated;

-- La de la 0034, con el tiempo (cambia lo que devuelve: hay que borrarla antes).
drop function if exists public.minigame_ranking(uuid, text, integer);
create or replace function public.minigame_ranking(p_route_id uuid, p_game text, p_limit integer default 50)
returns table (pos bigint, user_id uuid, display_name text, score integer, ms integer, achieved_at timestamptz, is_me boolean)
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
    select row_number() over (order by s.best_score desc, s.best_ms asc nulls last, s.best_at asc) as n,
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

-- casas_podios (de la 0044): en el quiz, a igualdad de puntos, menos tiempo
create or replace function public.casas_podios(p_route_id uuid)
returns table (juego text, puesto integer, user_id uuid, house text, points integer)
language sql
stable
security definer
set search_path = public
as $$
  with marcas as (
    -- La Cana Perfecta y La Conga: su ranking de la ruta.
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
    select m.juego, m.user_id,
           row_number() over (partition by m.juego order by m.valor desc, m.ms asc nulls last, m.cuando asc) as puesto
      from marcas m
     where exists (select 1 from public.route_members rm where rm.route_id = p_route_id and rm.user_id = m.user_id)
  )
  select o.juego, o.puesto::integer, o.user_id, h.house, r.points
    from ordenadas o
    join public.user_houses h on h.user_id = o.user_id
    join public.point_rules r on r.action = 'podio_' || o.puesto
   where o.puesto <= 3;
$$;
