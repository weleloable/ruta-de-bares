-- Ruta de Bares - 0071: ranking de Don Quijote Cervecero.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0070.
-- Idempotente: se puede re-ejecutar sin romper nada (solo rehace una funcion y
-- los checks, sin tocar datos).
-- Ojo al reves: rehace minigame_submit_nota() de la 0070, que ya no se vuelve a
-- pegar despues.
--
-- Orden de despliegue: esta migracion va ANTES que la app. Sin ella, guardar
-- una partida del Quijote en la ruta da INVALID_GAME y el record se queda solo
-- en el movil; los demas juegos no notan nada.
--
-- Que hace.
--
--   Don Quijote Cervecero es un endless runner: la nota son los metros mas los
--   puntos de las jarras y de lo derribado, entera y sin limite natural. MAS es
--   mejor, como en casi todos. El servidor no puede saber cuanto se corrio de
--   verdad: lo que frena a un cliente trucado es un techo de 10.000.000 (nadie
--   llega jugando; ¿Conduces tu? tiene uno parecido) y el limite de un envio
--   cada 4 s de siempre. Igual que en el resto, solo se frena, no se evita.
--   Para que quepa, la columna de la nota pasa de numeric(7, 2) a (12, 2).
--   El ranking, el podio de las casas y las estadisticas no necesitan nada: ya
--   valen para cualquier juego de minigame_scores.

-- ---------------------------------------------------------------------------
-- 1. Sitio para la nota: numeric(7, 2) (la 0069) llega solo a 99.999,99
-- ---------------------------------------------------------------------------
-- Se ensancha a numeric(12, 2): mismos dos decimales (la caña, Parejas), y los
-- datos que hay caben igual. Solo si aun no se ha hecho (re-ejecutable).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'minigame_scores'
                and column_name = 'best_score' and numeric_precision < 12) then
    alter table public.minigame_scores alter column best_score type numeric(12, 2);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Los checks de game y de best_score (los de la 0070), con el juego nuevo
-- ---------------------------------------------------------------------------
alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores
  add constraint minigame_scores_game_check
  check (game in ('cana-perfecta', 'conga-cervecera', 'quien-quiere-ser-cervecero', 'tapon-al-vuelo', 'parejas-de-barra', 'quijote-cervecero'));

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000 and best_score = trunc(best_score))
    or (game = 'quien-quiere-ser-cervecero' and best_score between 0 and 5 and best_score = trunc(best_score) and best_ms is not null)
    or (game = 'tapon-al-vuelo' and best_score between 0 and 1250 and best_score = trunc(best_score))
    or (game = 'parejas-de-barra' and best_score between 4.00 and 600)
    or (game = 'quijote-cervecero' and best_score between 0 and 10000000 and best_score = trunc(best_score))
  );

-- ---------------------------------------------------------------------------
-- 3. Guardar: la de la 0070, con el techo del Quijote
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
             -- Sin limite natural (metros + jarras + gigantes): un techo de seguridad que
             -- nadie alcanza jugando, como el de ¿Conduces tu? (0041).
             when 'quijote-cervecero' then 10000000
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
