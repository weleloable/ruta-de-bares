-- Ruta de Bares - 0073: Barman Express en el ranking por ruta y en el podio de las casas.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0072.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define funciones que una migracion POSTERIOR rehizo: volver a pegarla las
-- devuelve a esta version, en silencio y sin avisar. Aqui quedan obsoletas:
--   * minigame_submit_nota() la rehace la 0075 (Pulso de Camarero: tope 100 y decimales)
-- Ojo al reves: rehace minigame_submit_nota() de la 0071 (Quijote), que ya no se puede
-- volver a pegar despues.
--
-- Orden de despliegue: esta migracion va ANTES que la app. La app vieja no
-- conoce el juego y no nota nada. Al reves, con la app nueva y sin esto, Barman
-- Express se juega igual y guarda el record en el movil; al guardar en la ruta
-- da INVALID_GAME y la app dice que falta una migracion (errores.ts).
--
-- (Parte de la 0071, la del Quijote: su techo y su numeric(12, 2) se conservan. La 0072 es La
-- Penul, routes.la_penul_visible, y no toca nada de esto.)
--
-- ---------------------------------------------------------------------------
-- Que hace
-- ---------------------------------------------------------------------------
-- Barman Express (juegos/barman/modelo.ts): partida de 20 pedidos, nota ENTERA
-- y MAS es mejor (no entra en minijuego_menos_es_mejor()). Su tope es
-- PUNTUACION_MAXIMA = 5197, una cota analitica: cada pedido k vale como mucho
-- la comanda mas larga que permite el calendario de la carta, con la propina
-- mas alta y la racha maxima posible en ese pedido. Ninguna partida la alcanza
-- (haria falta que todas las comandas fueran las mas largas); el test lo
-- demuestra enumerando todas las comandas y jugando 2000 partidas con un
-- jugador instantaneo. tests/migration-0073.test.ts lee el tope del modelo.
--
--   * el check de game de minigame_scores (el de la 0070) acepta 'barman-express';
--   * el de best_score, su rango: entero de 0 a 5197;
--   * minigame_submit_nota (la de la 0070): su tope en el case. Sin minimo
--     especial (0) y en enteros: el "en los demas, entero" del cuerpo ya lo cubre.
--
-- Lo que NO hace falta tocar, comprobado leyendo sus cuerpos vigentes (0070):
-- minigame_ranking, casas_podios y admin_estadisticas_actividad no tienen
-- lista de juegos: tratan igual a cualquiera de minigame_scores y solo
-- preguntan por el sentido (minijuego_menos_es_mejor), que para este juego es
-- el de siempre (mas es mejor). Entra en el ranking, en el podio de las casas
-- y en las estadisticas de admins sin cambiarlas.
--
-- EL TOPE NO SE LO SALTA NADIE, PERO LA NOTA LA MANDA EL MOVIL: como en el
-- resto de juegos, un cliente trucado puede enviar cualquier entero hasta 5197.
-- Se frena con el tope y el espaciado de 4 s entre envios; no se evita.

-- ---------------------------------------------------------------------------
-- 1. Los checks de game y de best_score (los de la 0071, con el Quijote), con el juego nuevo
-- ---------------------------------------------------------------------------
alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores
  add constraint minigame_scores_game_check
  check (game in ('cana-perfecta', 'conga-cervecera', 'quien-quiere-ser-cervecero', 'tapon-al-vuelo', 'parejas-de-barra', 'quijote-cervecero', 'barman-express'));

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000 and best_score = trunc(best_score))
    or (game = 'quien-quiere-ser-cervecero' and best_score between 0 and 5 and best_score = trunc(best_score) and best_ms is not null)
    or (game = 'tapon-al-vuelo' and best_score between 0 and 1250 and best_score = trunc(best_score))
    or (game = 'parejas-de-barra' and best_score between 4.00 and 600)
    or (game = 'quijote-cervecero' and best_score between 0 and 10000000 and best_score = trunc(best_score))
    or (game = 'barman-express' and best_score between 0 and 5197 and best_score = trunc(best_score))
  );

-- ---------------------------------------------------------------------------
-- 2. Guardar: la de la 0071 (con el Quijote), con el tope de Barman Express en el case
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
             when 'barman-express' then 5197
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
