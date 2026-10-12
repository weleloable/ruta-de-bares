-- Ruta de Bares - 0059: estadisticas de auditoria y de todas las rutas, para admins.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0058.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * admin_estadisticas_global() la rehace la 0060
--
-- Que hace. Completa la pantalla de Estadisticas (0037, 0058) con dos cosas,
-- las dos solo para admins y solo agregadas:
--
--   * `admin_estadisticas_auditoria(ruta)`: lo que se ha tocado a mano en una
--     ruta. Puntos anulados (cuantos, cuanto sumaban y los motivos mas
--     repetidos), ajustes manuales (cuantos y su efecto neto) y cambios de casa
--     de gente de la ruta. Los motivos son lo que escribio quien administra;
--     ya los ve en el panel de Casas y puntuaciones.
--   * `admin_estadisticas_global(temporada)`: totales de TODAS las rutas que
--     existen (o de las de una temporada) y una fila por ruta para
--     compararlas. Ojo: las rutas se borran a los pocos dias (0027) y con ellas
--     sus numeros; lo unico que se guarda para siempre es el resultado de las
--     casas (0049), que se ve en el ranking historico.

create or replace function public.admin_estadisticas_auditoria(p_route_id uuid)
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
    'anulados', jsonb_build_object(
      'n', (select count(*) from public.point_movements m where m.route_id = p_route_id and m.annulled_at is not null),
      'puntos', coalesce((select sum(m.points) from public.point_movements m
                           where m.route_id = p_route_id and m.annulled_at is not null), 0),
      'motivos', coalesce((
        select jsonb_agg(jsonb_build_object('motivo', x.motivo, 'n', x.n) order by x.n desc, x.motivo)
          from (
            select coalesce(nullif(trim(m.annul_reason), ''), '(sin motivo)') as motivo, count(*) as n
              from public.point_movements m
             where m.route_id = p_route_id and m.annulled_at is not null
             group by 1 order by count(*) desc, 1 limit 5
          ) x
      ), '[]'::jsonb)
    ),
    'ajustes', jsonb_build_object(
      'n', (select count(*) from public.point_movements m
             where m.route_id = p_route_id and m.action = 'ajuste' and m.annulled_at is null),
      'puntos', coalesce((select sum(m.points) from public.point_movements m
                           where m.route_id = p_route_id and m.action = 'ajuste' and m.annulled_at is null), 0)
    ),
    'cambios_casa', (select count(*) from public.house_changes c
                      where c.user_id in (select rm.user_id from public.route_members rm where rm.route_id = p_route_id))
  );
end;
$$;

create or replace function public.admin_estadisticas_global(p_temporada_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.match_admin_require();

  return (
    with rutas as (
      select r.* from public.routes r where p_temporada_id is null or r.temporada_id = p_temporada_id
    ),
    filas as (
      select r.id, r.name, r.event_date, r.created_at,
             (select count(*) from public.route_members rm where rm.route_id = r.id) as personas,
             (select count(*) from public.route_bars b where b.route_id = r.id) as bares,
             (select count(*) from public.stamps s join public.route_bars b on b.id = s.route_bar_id where b.route_id = r.id) as sellos,
             (select count(*) from public.consumiciones q where q.route_id = r.id) as consumiciones,
             (select count(*) from (
                select s.user_id from public.stamps s join public.route_bars b on b.id = s.route_bar_id
                 where b.route_id = r.id group by s.user_id
                having count(distinct s.route_bar_id) >= (select count(*) from public.route_bars b2 where b2.route_id = r.id)
                   and (select count(*) from public.route_bars b3 where b3.route_id = r.id) > 0
              ) c) as completaron,
             (select cr.ganadoras from public.casas_resultados cr where cr.route_id = r.id) as ganadoras
        from rutas r
    )
    select jsonb_build_object(
      'totales', jsonb_build_object(
        'rutas', (select count(*) from rutas),
        'personas', (select count(distinct rm.user_id) from public.route_members rm where rm.route_id in (select id from rutas)),
        'sellos', coalesce((select sum(f.sellos) from filas f), 0),
        'consumiciones', coalesce((select sum(f.consumiciones) from filas f), 0),
        'encuentros', (select count(*) from public.encuentros e where e.tipo = 'qr' and e.route_id in (select id from rutas)),
        'retos', (select count(*) from public.point_movements m
                   where m.action = 'reto' and m.annulled_at is null and m.route_id in (select id from rutas))
      ),
      'rutas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre', f.name, 'fecha', f.event_date, 'personas', f.personas, 'bares', f.bares,
                 'sellos', f.sellos, 'completaron', f.completaron, 'consumiciones', f.consumiciones,
                 'cerrada', f.ganadoras is not null, 'ganadoras', coalesce(to_jsonb(f.ganadoras), '[]'::jsonb))
               order by f.event_date desc nulls last, f.created_at desc)
          from filas f
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_estadisticas_auditoria(uuid) from public, anon;
revoke all on function public.admin_estadisticas_global(uuid) from public, anon;
grant execute on function public.admin_estadisticas_auditoria(uuid) to authenticated;
grant execute on function public.admin_estadisticas_global(uuid) to authenticated;
