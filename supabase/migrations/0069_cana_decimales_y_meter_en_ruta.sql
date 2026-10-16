-- Ruta de Bares - 0069: notas con decimales en La Caña Perfecta y meter a alguien
-- en una ruta desde la pantalla de Usuarios.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0068.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define funciones que una migracion POSTERIOR rehizo: volver a pegarla las
-- devuelve a esta version, en silencio y sin avisar. Aqui quedan obsoletas:
--   * minigame_submit_nota() la rehace la 0070
--   * minigame_ranking() la rehace la 0070
-- (Hasta la 0070 si lo era: el borrado de las notas viejas solo corre la
-- PRIMERA vez, cuando la columna aun es entera: ver 1. Y pegarla ahora, ademas,
-- volveria a dejar fuera a 'parejas-de-barra' del check de best_score.)
-- Ojo al reves: rehace minigame_submit_score() y minigame_ranking() de la 0061,
-- que ya no se pueden volver a pegar despues.
--
-- Orden de despliegue: da igual, pero lo normal es la app y esta migracion con
-- pocos minutos de diferencia. La app nueva guarda con `minigame_submit_nota`
-- (nueva): hasta pegar esto, guardar una partida de la caña da error y el
-- récord local se conserva. La app VIEJA (una pestaña que sigue abierta) usa
-- `minigame_submit_score`, que para la caña ahora lanza APP_UPDATE_REQUIRED:
-- sin eso, esas pestañas seguirian enviando notas de la escala generosa DESPUES
-- del borrado de abajo y volverian a quedar arriba del ranking. Para el resto de
-- juegos la vieja sigue funcionando igual.
--
-- ---------------------------------------------------------------------------
-- 1. La Caña Perfecta puntua con DOS DECIMALES (94,67) y es mas dificil
-- ---------------------------------------------------------------------------
-- La puntuacion cambia en la app (modelo.ts): la nota ya no se redondea a
-- entero y por encima de 90 se comprime, de modo que 100 solo sale de una
-- partida perfecta. Con enteros, un jugador bueno sacaba 99 una y otra vez y
-- empataba con medio ranking; con decimales casi nadie empata.
--
--   * `minigame_scores.best_score` pasa de integer a numeric(7,2). Los demas
--     juegos siguen en enteros (lo exige el check de abajo): el tope de 15000
--     de la conga cabe de sobra. El indice del ranking se reconstruye solo.
--   * `minigame_submit_nota` (nueva) recibe numeric y es la que usa la app
--     nueva. En la caña redondea a 2 decimales.
--   * `minigame_submit_score` (la de siempre, con la nota entera) pasa a ser un
--     envoltorio: para la caña lanza APP_UPDATE_REQUIRED, para los demas juegos
--     llama a la nueva. Mismo patron que la 0040 con `match_activate`.
--   * `minigame_ranking` devuelve la nota como numeric.
--   * `casas_podios` y las estadisticas leian best_score sin tipar (::numeric o
--     jsonb): no cambian.
--
-- Las notas VIEJAS de la caña se BORRAN. Salieron de otra escala (mucho mas
-- generosa): dejarlas pondria arriba del ranking de cada ruta, para siempre, a
-- quien jugo antes del cambio, y nadie podria alcanzarlas. Mismo criterio que
-- la 0061 con el quiz. Solo se borran la primera vez (mientras la columna sea
-- integer), asi que volver a pegar esto no borra las nuevas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'minigame_scores'
       and column_name = 'best_score' and data_type = 'integer'
  ) then
    delete from public.minigame_scores where game = 'cana-perfecta';
  end if;
end;
$$;

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores alter column best_score type numeric(7, 2) using best_score::numeric(7, 2);
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000 and best_score = trunc(best_score))
    or (game = 'quien-quiere-ser-cervecero' and best_score between 0 and 5 and best_score = trunc(best_score) and best_ms is not null)
    or (game = 'tapon-al-vuelo' and best_score between 0 and 1250 and best_score = trunc(best_score))
  );

-- La de la 0061, con la nota numerica y con OTRO NOMBRE: la vieja se queda (abajo)
-- para las apps en cache, y dos sobrecargas con los mismos argumentos nombrados
-- darian "Could not choose the best candidate function" en PostgREST.
create or replace function public.minigame_submit_nota(p_route_id uuid, p_game text, p_score numeric, p_ms integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.minijuegos_require(p_route_id, true);
  v_max    integer;
  v_score  numeric;
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
  -- Dos decimales solo en la caña; en los demas, entero (como siempre).
  v_score := case when p_game = 'cana-perfecta' then round(p_score, 2) else p_score end;
  if p_game <> 'cana-perfecta' and v_score <> trunc(v_score) then
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

  -- Mejor: mas puntos; en el quiz, con los mismos puntos, menos tiempo.
  v_mejora := v_score > v_prev.best_score
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

-- La de la 0061, tal cual salvo la caña: una app en cache sigue guardando el
-- resto de juegos, pero NO la caña (escala vieja).
create or replace function public.minigame_submit_score(p_route_id uuid, p_game text, p_score integer, p_ms integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_game = 'cana-perfecta' then
    raise exception 'APP_UPDATE_REQUIRED' using errcode = 'P0001';
  end if;
  return public.minigame_submit_nota(p_route_id, p_game, p_score, p_ms);
end;
$$;
revoke all on function public.minigame_submit_score(uuid, text, integer, integer) from public, anon;
grant execute on function public.minigame_submit_score(uuid, text, integer, integer) to authenticated;

-- La de la 0061, con la nota como numeric (cambia lo que devuelve: hay que borrarla antes).
drop function if exists public.minigame_ranking(uuid, text, integer);
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

-- ---------------------------------------------------------------------------
-- 2. Meter a alguien en una ruta desde Usuarios
-- ---------------------------------------------------------------------------
-- Para quien creo la cuenta pero nunca canjeo una invitacion (el enlace se
-- perdio, abrio el correo en otro navegador...). Un admin la mete en la ruta
-- sin pasar por un enlace.
--
-- La CASA no se asigna aqui: la asigna el disparador `route_members_casa` (0043)
-- en el mismo INSERT, igual que con una invitacion. La casa que le toca es la
-- que menos gente tiene EN ESA RUTA, y si empatan, al azar (0050). Si ya tenia
-- casa, se queda con ella. La persona ve la animacion de "tu casa es..." la
-- primera vez que abre la app.
--
-- Tampoco se salta el veto: `route_members_veto` (0015) corre igual y rechaza a
-- quien esta suspendido (ACCOUNT_SUSPENDED) o vetado de esa ruta (ROUTE_BANNED).
-- Un admin no deberia poder deshacer una sancion sin querer; para eso esta
-- retirar el veto en Moderacion.
--
-- `added_by` apunta al admin: es lo que distingue "la metieron" de "canjeo un
-- enlace" (`invite_id` tambien es null cuando se borra la invitacion).
alter table public.route_members add column if not exists added_by uuid references public.profiles (id) on delete set null;

create or replace function public.admin_meter_en_ruta(p_user_id uuid, p_route_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_admin uuid := public.match_admin_require();
  v_casa  text;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Ya dentro: no se hace nada y se dice (dos admins a la vez, o un doble clic).
  if exists (select 1 from public.route_members m where m.route_id = p_route_id and m.user_id = p_user_id) then
    select h.house into v_casa from public.user_houses h where h.user_id = p_user_id;
    return jsonb_build_object('ya_estaba', true, 'casa', v_casa);
  end if;

  insert into public.route_members (route_id, user_id, added_by)
  values (p_route_id, p_user_id, v_admin)
  on conflict (route_id, user_id) do nothing;

  select h.house into v_casa from public.user_houses h where h.user_id = p_user_id;
  return jsonb_build_object('ya_estaba', false, 'casa', v_casa);
end;
$$;

revoke all on function public.admin_meter_en_ruta(uuid, uuid) from public, anon;
grant execute on function public.admin_meter_en_ruta(uuid, uuid) to authenticated;
