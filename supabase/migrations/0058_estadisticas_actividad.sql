-- Ruta de Bares - 0058: estadisticas de actividad de una ruta para los admins.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0057.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * admin_estadisticas_actividad() la rehace la 0060
--
-- Que hace. La pantalla de Estadisticas (0037) solo sabia de sellos, La Cana y
-- moderacion. `admin_estadisticas_actividad(ruta)` anade lo que ha llegado
-- despues, de una vez y solo para admins (como el resto del panel):
--
--   * participacion: cuanta gente ha sellado, apuntado consumiciones, usado el
--     QR, jugado, activado La Cana o conseguido un reto, y cuanta ha hecho algo
--     en la ultima media hora;
--   * bares: sellos de cada bar, en el orden de la ruta;
--   * horas: sellos por hora (para ver el pico de la noche);
--   * consumiciones: total, cuantas puntuan, personas y reparto por categoria;
--   * juegos: jugadores y mejor nota de cada minijuego (solo hay la mejor nota
--     de cada persona, no cuantas partidas);
--   * retos: cuanta gente ha conseguido cada uno y cuantas plazas tiene;
--   * qr: encuentros y cuantos puntuaron.
--
-- SOLO TOTALES, nunca nada por persona, como la 0037: ni quien bebe que, ni
-- quien juega mejor. Son datos de AHORA MISMO y se van con la ruta al borrarla.

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
        from public.route_bars b where b.route_id = p_route_id
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
          from (values ('tercio'), ('jarra'), ('vino'), ('sidra'), ('chupito'), ('sin_alcohol')) as c (categoria)
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

revoke all on function public.admin_estadisticas_actividad(uuid) from public, anon;
grant execute on function public.admin_estadisticas_actividad(uuid) to authenticated;
