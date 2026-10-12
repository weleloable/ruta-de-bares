-- Ruta de Bares - 0055: ranking por ruta de "¿Quien quiere ser cervecero?".
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0054.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar (y quita de la tabla el
-- juego que entro despues). Aqui queda obsoleta:
--   * minigame_submit_score() la rehace la 0056
-- Ojo al reves: rehace minigame_submit_score() a partir de la 0039, asi que la
-- 0039 ya no se puede volver a pegar despues (le quitaria el juego a la tabla).
--
-- Que hace. El ranking de la 0034 (`minigame_scores`: la mejor nota de cada
-- persona en cada juego y ruta) admite ahora 'quien-quiere-ser-cervecero', que
-- se puntua con el premio de la escalera: 0, 1, 2, 5, 10 o 25 puntos.
--
-- Decisiones que conviene conocer:
--
--   * **Tope 25.** Es el premio de la ultima pregunta (`CONFIG.premios` en
--     features/quiz/config.ts) y no se puede sacar mas. Un test comprueba que
--     la migracion y la app dicen lo mismo; si se sube un premio, hay que
--     subir el tope en una migracion nueva.
--   * El servidor NO puede saber si los puntos se ganaron jugando (la partida
--     corre en el movil): el tope y el ritmo minimo entre envios (4 s, el de la
--     0034) son lo que frena a quien se salte la app. Con un tope de 25, lo
--     peor que se puede hacer es empatar en cabeza.
--   * Los empates son lo normal (hay seis notas posibles): desempata quien
--     llego antes a esa nota (`best_at`), como en el resto de juegos.
--   * Entra solo en el reparto de puntos de las casas (`casas_podios`, 0044),
--     que lee `minigame_scores` entera: un podio aqui suma 10/7/5 como en los
--     demas juegos.
--   * La tabla, sus permisos y `minigame_ranking` no cambian.
--   * ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app. Si la app nueva
--     llega antes, el quiz se juega igual y guarda el record en el movil, pero
--     al guardar en la ruta avisa de que falta una migracion.

alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores
  add constraint minigame_scores_game_check
  check (game in ('cana-perfecta', 'conga-cervecera', 'quien-quiere-ser-cervecero'));

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000)
    or (game = 'quien-quiere-ser-cervecero' and best_score between 0 and 25)
  );

-- Igual que la de la 0039, salvo que conoce el quiz y su tope.
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
             when 'quien-quiere-ser-cervecero' then 25
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
