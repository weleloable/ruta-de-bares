-- Ruta de Bares - 0039: ranking por ruta de La Conga Cervecera.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0038.
-- Idempotente: se puede re-ejecutar sin romper nada (las restricciones se
-- quitan con `if exists` antes de ponerlas y la funcion va con `or replace`).
-- Ojo al reves: rehace minigame_submit_score() a partir de la 0034, asi que la
-- 0034 ya no se puede volver a pegar despues.
--
-- Que hace. El ranking de la 0034 (`minigame_scores`: la mejor nota de cada
-- persona en cada juego y ruta) ya era generico, pero solo admitia un juego,
-- 'cana-perfecta', y notas de 0 a 100. Aqui entra 'conga-cervecera', que se
-- puntua en puntos de partida (10 por jarra, 25 por tapa, doble con la dorada).
--
-- Decisiones que conviene conocer:
--
--   * **Tope por juego, no uno comun.** La Cana Perfecta sigue en 0..100. La
--     conga, en 0..15000: es el maximo teorico del mapa (214 casillas libres,
--     todas con jarra durante el doble y con una tapa doble cada una, 14 910),
--     redondeado. Es el espejo de PUNTUACION_MAXIMA en conga/modelo.ts; un test
--     comprueba que ningun mapa puede pasarse de ahi. Si un mapa nuevo lo
--     supera, hay que subir el tope en una migracion nueva.
--   * Como en la cana, el servidor NO puede saber si los puntos se ganaron
--     jugando: el tope y el ritmo minimo entre envios (4 s, el de la 0034) son
--     lo que frena a quien se salte la app.
--   * La tabla, sus permisos y `minigame_ranking` no cambian: el ranking de la
--     conga es el mismo de siempre filtrado por juego.
--   * ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app. Si la app nueva
--     llega antes, la conga se juega igual y guarda el record en el movil, pero
--     al guardar en la ruta avisa de que falta una migracion.

alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores
  add constraint minigame_scores_game_check check (game in ('cana-perfecta', 'conga-cervecera'));

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000)
  );

-- Igual que la de la 0034, salvo que valida el juego y el tope de cada uno.
create or replace function public.minigame_submit_score(p_route_id uuid, p_game text, p_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.minijuegos_require(p_route_id, true);
  v_max  integer;
  v_prev public.minigame_scores%rowtype;
  v_best integer;
begin
  v_max := case p_game
             when 'cana-perfecta' then 100
             when 'conga-cervecera' then 15000
           end;
  if v_max is null then
    raise exception 'INVALID_GAME' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > v_max then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;

  select * into v_prev from public.minigame_scores
   where route_id = p_route_id and user_id = v_uid and game = p_game
   for update;

  if found and clock_timestamp() - v_prev.last_submit_at < interval '4 seconds' then
    raise exception 'TOO_FAST' using errcode = '54000';
  end if;

  if not found then
    insert into public.minigame_scores (route_id, user_id, game, best_score, best_at, last_submit_at)
    values (p_route_id, v_uid, p_game, p_score, clock_timestamp(), clock_timestamp());
    return jsonb_build_object('best', p_score, 'is_record', true);
  end if;

  v_best := greatest(v_prev.best_score, p_score);
  update public.minigame_scores
     set best_score = v_best,
         best_at = case when p_score > v_prev.best_score then clock_timestamp() else best_at end,
         last_submit_at = clock_timestamp()
   where route_id = p_route_id and user_id = v_uid and game = p_game;
  return jsonb_build_object('best', v_best, 'is_record', p_score > v_prev.best_score);
end;
$$;

-- `or replace` conserva los permisos, pero se repiten por si se pega en una base sin la 0034 al dia.
revoke all on function public.minigame_submit_score(uuid, text, integer) from public, anon;
grant execute on function public.minigame_submit_score(uuid, text, integer) to authenticated;
