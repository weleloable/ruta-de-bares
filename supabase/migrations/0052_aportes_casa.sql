-- Ruta de Bares - 0052: cuanto aporta cada persona a los puntos de su casa.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0051.
-- Idempotente: se puede re-ejecutar sin romper nada (funcion con `or replace`).
--
-- Que hace. `casas_aportes(ruta, casa)` devuelve, para una casa en una ruta,
-- cada persona y los puntos que ha puesto, de mayor a menor. Lo ve quien
-- participa en la ruta o administra (como el ranking). Solo el TOTAL por
-- persona: de que acciones salen no se ensena (eso es del panel de admin).
--
-- Como se reparte lo que es de varios:
--   * encuentro por QR: a partes iguales entre los dos (5 puntos = 2,5 cada uno);
--   * racha de casa: a partes iguales entre las personas que la hicieron
--     (6 puntos entre 3 = 2 cada una);
--   * podios de minijuegos: a quien quedo en el podio.
-- Lo que no tiene persona (un ajuste a mano a la casa, o una cuenta que se
-- borro) sale en una fila aparte con `user_id` nulo, para que la suma de la
-- lista sea SIEMPRE la que ensena el ranking.

create or replace function public.casas_aportes(p_route_id uuid, p_house text)
returns table (user_id uuid, nombre text, puntos numeric)
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
  if p_house is null or p_house not in ('mahou', 'cruzcampo', 'estrella', 'alhambra') then
    raise exception 'INVALID_HOUSE' using errcode = '22023';
  end if;

  return query
  with propios as (
    -- Lo que tiene persona.
    select m.user_id as uid, m.points::numeric as pts
      from public.point_movements m
     where m.route_id = p_route_id and m.house = p_house and m.annulled_at is null
       and m.user_id is not null and m.action not in ('racha', 'qr')
    union all
    -- Los podios, en vivo.
    select pd.user_id, pd.points::numeric
      from public.casas_podios(p_route_id) pd
     where pd.house = p_house
    union all
    -- Racha y QR: a partes iguales entre quienes los hicieron.
    select u.uid::uuid, m.points::numeric / jsonb_array_length(m.detail -> 'usuarios')
      from public.point_movements m,
           lateral jsonb_array_elements_text(m.detail -> 'usuarios') as u (uid)
     where m.route_id = p_route_id and m.house = p_house and m.annulled_at is null
       and m.action in ('racha', 'qr') and jsonb_typeof(m.detail -> 'usuarios') = 'array'
       and jsonb_array_length(m.detail -> 'usuarios') > 0
    union all
    -- Lo que no tiene persona (ajustes a la casa, cuentas borradas): fila aparte.
    select null::uuid, m.points::numeric
      from public.point_movements m
     where m.route_id = p_route_id and m.house = p_house and m.annulled_at is null
       and ((m.user_id is null and m.action not in ('racha', 'qr'))
            or (m.action in ('racha', 'qr') and (jsonb_typeof(m.detail -> 'usuarios') is distinct from 'array'
                                                 or jsonb_array_length(m.detail -> 'usuarios') = 0)))
    union all
    -- Quien es de la casa en la ruta aparece aunque aun no haya aportado nada.
    select rm.user_id, 0::numeric
      from public.route_members rm
      join public.user_houses h on h.user_id = rm.user_id
     where rm.route_id = p_route_id and h.house = p_house
  )
  select p.uid, pr.display_name, sum(p.pts)::numeric
    from propios p
    left join public.profiles pr on pr.id = p.uid
   group by p.uid, pr.display_name
   order by sum(p.pts) desc, pr.display_name nulls last;
end;
$$;

revoke all on function public.casas_aportes(uuid, text) from public, anon;
grant execute on function public.casas_aportes(uuid, text) to authenticated;
