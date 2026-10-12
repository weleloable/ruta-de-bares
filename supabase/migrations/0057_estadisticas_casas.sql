-- Ruta de Bares - 0057: estadisticas de las casas en la ruta.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0056.
-- Idempotente: se puede re-ejecutar sin romper nada (funcion con `or replace`).
--
-- Que hace. `casas_estadisticas(ruta)` devuelve, por casa, los datos con los que
-- la pestana Casas cuenta de donde sacan sus puntos y que casa destaca en que
-- ("la mas jugona", "la mas sociable"...). Lo ve quien participa en la ruta o
-- administra, como el ranking.
--
--   * puntos por origen, que SUMAN lo que `casas_ranking` ensena (los podios,
--     en vivo, como alli):
--       p_sellos   sellos y completar la ruta
--       p_consumo  consumiciones y categorias nuevas
--       p_juegos   podios de los minijuegos
--       p_social   encuentros por QR y rachas de casa
--       p_otros    retos, ajustes a mano y cualquier accion futura
--   * `sellos` (cuantos sellos suman las personas de la casa en la ruta) y
--     `consumiciones` (cuantas han apuntado, puntuen o no), y `miembros`.
--
-- Solo agregados por casa: nada de quien hizo que. Ojo con una casa de pocas
-- personas, donde el agregado se parece mucho al dato de una sola (las
-- consumiciones de cada persona siguen siendo privadas en su detalle).

create or replace function public.casas_estadisticas(p_route_id uuid)
returns table (
  house text,
  miembros integer,
  sellos integer,
  consumiciones integer,
  p_sellos numeric,
  p_consumo numeric,
  p_juegos numeric,
  p_social numeric,
  p_otros numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if not (public.is_route_participant(p_route_id, v_uid) or public.is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select c.casa,
         (select count(*)::integer from public.route_members rm
            join public.user_houses h on h.user_id = rm.user_id
           where rm.route_id = p_route_id and h.house = c.casa),
         (select count(*)::integer from public.stamps s
            join public.route_bars b on b.id = s.route_bar_id
            join public.user_houses h on h.user_id = s.user_id
           where b.route_id = p_route_id and h.house = c.casa),
         (select count(*)::integer from public.consumiciones q
            join public.user_houses h on h.user_id = q.user_id
           where q.route_id = p_route_id and h.house = c.casa),
         coalesce((select sum(m.points) from public.point_movements m
                    where m.route_id = p_route_id and m.house = c.casa and m.annulled_at is null
                      and m.action in ('sello', 'ruta_completa')), 0)::numeric,
         coalesce((select sum(m.points) from public.point_movements m
                    where m.route_id = p_route_id and m.house = c.casa and m.annulled_at is null
                      and m.action in ('consumicion', 'categoria_nueva')), 0)::numeric,
         coalesce((select sum(pd.points) from public.casas_podios(p_route_id) pd where pd.house = c.casa), 0)::numeric,
         coalesce((select sum(m.points) from public.point_movements m
                    where m.route_id = p_route_id and m.house = c.casa and m.annulled_at is null
                      and m.action in ('qr', 'racha')), 0)::numeric,
         coalesce((select sum(m.points) from public.point_movements m
                    where m.route_id = p_route_id and m.house = c.casa and m.annulled_at is null
                      and m.action not in ('sello', 'ruta_completa', 'consumicion', 'categoria_nueva', 'qr', 'racha')), 0)::numeric
    from (values ('mahou'), ('cruzcampo'), ('estrella'), ('alhambra')) as c (casa);
end;
$$;

revoke all on function public.casas_estadisticas(uuid) from public, anon;
grant execute on function public.casas_estadisticas(uuid) to authenticated;
