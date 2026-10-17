-- Ruta de Bares - 0075: Pulso de Camarero en el ranking por ruta y en el podio de las casas.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0074 y
-- **ANTES de desplegar la app**.
-- Idempotente: se puede re-ejecutar sin romper nada (rehace una funcion y dos
-- checks, sin tocar datos).
-- Ojo al reves: rehace minigame_submit_nota() de la 0073 (Barman Express), que ya
-- no se puede volver a pegar despues.
--
-- (Parte del CUERPO de la 0073, no de la 0070: se conservan el techo y el
-- `numeric(12, 2)` del Quijote y el tope de Barman Express. La 0074 es la de los
-- anuncios y no toca nada de esto.)
--
-- ---------------------------------------------------------------------------
-- Que hace
-- ---------------------------------------------------------------------------
-- Pulso de Camarero (juegos/pulso/modelo.ts): tres rondas llevando una bandeja
-- que se inclina sola. La nota es un PORCENTAJE de 0 a 100,00 con DOS decimales y
-- MAS es mejor (no entra en minijuego_menos_es_mejor()). PUNTUACION_MAXIMA = 100
-- es la suma de los pesos de las rondas (25 + 35 + 40) y solo sale de salvar el
-- 100 % del liquido: no hay forma de superarla (modelo.test.ts lo demuestra con
-- 500 partidas al azar y con la cota analitica de cada ronda).
-- tests/migration-0075.test.ts lee el tope del modelo, no lo copia a mano.
--
--   * el check de game de minigame_scores acepta 'pulso-de-camarero';
--   * el de best_score, su rango: de 0 a 100, CON decimales (sin `= trunc`);
--   * minigame_submit_nota: su tope (100) en el case y, como la caña, se REDONDEA
--     a 2 decimales en vez de rechazarse. El "en los demas, entero" del cuerpo
--     ahora deja fuera tambien a este juego: sin ese cambio, 68,43 daria
--     INVALID_SCORE.
--
-- Lo que NO hace falta tocar, comprobado leyendo sus cuerpos vigentes (0070):
-- minigame_ranking, casas_podios y admin_estadisticas_actividad no tienen lista
-- de juegos ni casteos de la nota a entero (`best_score::numeric`, y el orden es
-- -best_score): ordenan de mayor a menor y devuelven los decimales tal cual.
-- Entra en el ranking, en el podio de las casas (los 3 mejores) y en las
-- estadisticas de admins sin cambiarlas.
--
-- EL TOPE NO SE LO SALTA NADIE, PERO LA NOTA LA MANDA EL MOVIL: el servidor no
-- puede saber si el liquido se salvo de verdad. Como en la 0039 y la 0069, un
-- cliente trucado puede enviar cualquier nota hasta 100,00. Se frena con el
-- tope y con el espaciado de 4 s entre envios; no se evita.
--
-- Orden de despliegue: esta migracion va ANTES que la app. La app vieja no
-- conoce el juego y no nota nada. Al reves, con la app nueva y sin esto, el
-- juego se juega igual y guarda el record en el movil; al guardar en la ruta da
-- INVALID_GAME y la app dice que falta una migracion (errores.ts).

-- ---------------------------------------------------------------------------
-- 1. Los checks de game y de best_score (los de la 0073), con el juego nuevo
-- ---------------------------------------------------------------------------
alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores
  add constraint minigame_scores_game_check
  check (game in ('cana-perfecta', 'conga-cervecera', 'quien-quiere-ser-cervecero', 'tapon-al-vuelo', 'parejas-de-barra', 'quijote-cervecero', 'barman-express', 'pulso-de-camarero'));

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
    or (game = 'pulso-de-camarero' and best_score between 0 and 100)
  );

-- ---------------------------------------------------------------------------
-- 2. Guardar: la de la 0073 (con Barman Express), con el tope y los decimales de Pulso de Camarero
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
             -- Un porcentaje: PUNTUACION_MAXIMA = 100 en juegos/pulso/modelo.ts (la suma de los pesos de las rondas).
             when 'pulso-de-camarero' then 100
           end;
  if v_max is null then
    raise exception 'INVALID_GAME' using errcode = '22023';
  end if;
  -- Parejas: 4,00 s es el minimo fisico (modelo.ts); por debajo, el cliente miente.
  v_min := case p_game when 'parejas-de-barra' then 4.00 else 0 end;
  if p_score is null or p_score < v_min or p_score > v_max then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;
  -- Dos decimales en la caña y en Pulso de Camarero (se redondea, como en la 0069) y en
  -- Parejas (se EXIGE: la app ya manda dos, y un tercero es un cliente que no es la app).
  -- En los demas, entero (como siempre).
  if p_game = 'parejas-de-barra' and p_score <> round(p_score, 2) then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;
  v_score := case when p_game in ('cana-perfecta', 'pulso-de-camarero') then round(p_score, 2) else p_score end;
  if p_game not in ('cana-perfecta', 'parejas-de-barra', 'pulso-de-camarero') and v_score <> trunc(v_score) then
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
