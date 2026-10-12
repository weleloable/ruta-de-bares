-- Ruta de Bares - 0056: ranking por ruta de "Tapon al Vuelo".
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0055.
-- Idempotente: se puede re-ejecutar sin romper nada (las restricciones se
-- quitan con `if exists` antes de ponerlas y la funcion va con `or replace`).
-- Ojo al reves: rehace minigame_submit_score() a partir de la 0055, asi que la
-- 0055 ya no se puede volver a pegar despues (le quitaria el juego a la tabla).
--
-- Que hace. El ranking de la 0034 (`minigame_scores`: la mejor nota de cada
-- persona en cada juego y ruta) admite ahora 'tapon-al-vuelo': diez tiros de
-- chapa a cuatro dianas, con racha que multiplica hasta x3.
--
-- Decisiones que conviene conocer:
--
--   * **Tope 1250.** Es el maximo de la partida: diez aciertos seguidos a la
--     diana que mas vale (la oreja del camarero, 50) con la racha a tope,
--     50 x (1 + 1,5 + 2 + 2,5 + 3 x 6). Es el espejo de PUNTUACION_MAXIMA en
--     juegos/tapon/modelo.ts; un test lo lee de ahi y otro demuestra que
--     ninguna secuencia de tiros lo supera. Si cambian las dianas o la racha,
--     hay que subir el tope en una migracion nueva.
--   * El servidor NO puede saber si los puntos se ganaron jugando (la fisica
--     corre en el movil): el tope y el ritmo minimo entre envios (4 s, el de la
--     0034) son lo que frena a quien se salte la app.
--   * Los otros tres juegos conservan su tope (cana 100, conga 15000, quiz 25).
--   * Como el resto, entra en el podio de las casas (`casas_podios`, 0044, lee
--     `minigame_scores` entera) con los mismos 10/7/5.
--   * La tabla, sus permisos y `minigame_ranking` no cambian.
--   * ORDEN DE DESPLIEGUE: esta migracion va ANTES que la app. Si la app nueva
--     llega antes, el juego funciona y guarda el record en el movil, pero al
--     guardar en la ruta avisa de que falta una migracion.

alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores
  add constraint minigame_scores_game_check
  check (game in ('cana-perfecta', 'conga-cervecera', 'quien-quiere-ser-cervecero', 'tapon-al-vuelo'));

alter table public.minigame_scores drop constraint if exists minigame_scores_best_score_check;
alter table public.minigame_scores
  add constraint minigame_scores_best_score_check check (
    (game = 'cana-perfecta' and best_score between 0 and 100)
    or (game = 'conga-cervecera' and best_score between 0 and 15000)
    or (game = 'quien-quiere-ser-cervecero' and best_score between 0 and 25)
    or (game = 'tapon-al-vuelo' and best_score between 0 and 1250)
  );

-- Igual que la de la 0055, salvo que conoce Tapon al Vuelo y su tope.
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
             when 'tapon-al-vuelo' then 1250
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
