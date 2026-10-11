-- Ruta de Bares - 0037: estadisticas de una ruta para los admins.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0036.
-- **NO SE PUEDE RE-EJECUTAR.** Se aplica UNA VEZ, en orden, y no se vuelve.
-- Define una funcion que una migracion POSTERIOR rehizo: volver a pegarla la
-- devuelve a esta version, en silencio y sin avisar. Aqui queda obsoleta:
--   * admin_estadisticas_ruta() la rehace la 0040
--
-- Por que existe. "Detras de la barra" tiene una pantalla de estadisticas:
-- cuanta gente hay en una ruta, cuanto se ha sellado, cuanto se usa La Caña,
-- que etiquetas se eligen y cuanta moderacion ha hecho falta. Todo eso ya esta
-- en la base; las tablas de la cana no tienen privilegios para la app (0005),
-- asi que se leen con una funcion SECURITY DEFINER que exige ser admin, como
-- el resto del panel.
--
-- SOLO TOTALES, nunca nada por persona. La politica de privacidad promete que
-- a quien das Me gusta no lo ve nadie, "ni quien organiza la ruta": un total
-- de Me gusta de la ruta no dice nada de nadie; "quien recibe mas" si, y por
-- eso no esta ni debe estar. Lo mismo con las etiquetas: cuantas veces se
-- elige cada una, nunca quien.
--
-- Son datos de AHORA MISMO: si alguien quita un Me gusta deja de contar, y al
-- borrar la ruta desaparecen con ella (0027). No hay historico.

create or replace function public.admin_estadisticas_ruta(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bares integer;
begin
  perform public.match_admin_require();
  if not exists (select 1 from public.routes r where r.id = p_route_id) then
    raise exception 'ROUTE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_bares from public.route_bars b where b.route_id = p_route_id;

  return jsonb_build_object(
    'ruta', jsonb_build_object(
      'personas', (select count(*) from public.route_members m where m.route_id = p_route_id),
      'bares', v_bares,
      'sellos', (
        select count(*) from public.stamps s
          join public.route_bars b on b.id = s.route_bar_id
         where b.route_id = p_route_id
      ),
      'han_sellado', (
        select count(distinct s.user_id) from public.stamps s
          join public.route_bars b on b.id = s.route_bar_id
         where b.route_id = p_route_id
      ),
      -- Una ruta sin bares no se puede completar: 0 y no "todos".
      'completaron', case when v_bares = 0 then 0 else (
        select count(*) from (
          select s.user_id from public.stamps s
            join public.route_bars b on b.id = s.route_bar_id
           where b.route_id = p_route_id
           group by s.user_id
          having count(distinct s.route_bar_id) = v_bares
        ) x
      ) end
    ),

    'cana', jsonb_build_object(
      -- El perfil de la cana es de la persona, no de la ruta: se cuenta a la
      -- gente de ESTA ruta que la tiene activada.
      'activada', (
        select count(*) from public.match_profiles mp
          join public.route_members m on m.user_id = mp.user_id
         where m.route_id = p_route_id and mp.is_active
      ),
      'me_gusta', (
        select count(*) from public.match_votes v where v.route_id = p_route_id and v.value = 'like'
      ),
      'conexiones', (select count(*) from public.match_connections c where c.route_id = p_route_id),
      'conexiones_abiertas', (
        select count(*) from public.match_connections c where c.route_id = p_route_id and c.is_open
      ),
      'preguntas', (
        select count(*) from public.match_connections c
         where c.route_id = p_route_id and c.question_state <> 'none'
      ),
      'si', (
        select count(*) from public.match_connections c
         where c.route_id = p_route_id and c.question_state = 'accepted'
      )
    ),

    -- Las cinco mas elegidas por la gente de la ruta con La Caña activada. En
    -- empate, por orden alfabetico, que es como salen en la app.
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('etiqueta', x.label, 'veces', x.veces) order by x.veces desc, x.sort_order)
        from (
          select t.label, t.sort_order, count(*)::integer as veces
            from public.match_profile_tags pt
            join public.match_tags t on t.id = pt.tag_id
            join public.match_profiles mp on mp.user_id = pt.user_id and mp.is_active
            join public.route_members m on m.user_id = pt.user_id and m.route_id = p_route_id
           group by t.label, t.sort_order
           order by veces desc, t.sort_order
           limit 5
        ) x
    ), '[]'::jsonb),

    'moderacion', jsonb_build_object(
      'denuncias', (select count(*) from public.match_reports r where r.route_id = p_route_id),
      'denuncias_sin_cerrar', (
        select count(*) from public.match_reports r where r.route_id = p_route_id and r.status <> 'resuelta'
      ),
      -- Vetos que siguen puestos en esta ruta: de la ruta y de La Caña. Las
      -- suspensiones de cuenta no son de ninguna ruta (sacan de todas), asi
      -- que no se cuentan aqui.
      'vetos', (
        (select count(*) from public.route_bans b where b.route_id = p_route_id)
        + (select count(*) from public.cana_bans c where c.route_id = p_route_id)
      )
    )
  );
end;
$$;

revoke all on function public.admin_estadisticas_ruta(uuid) from public, anon;
grant execute on function public.admin_estadisticas_ruta(uuid) to authenticated;
