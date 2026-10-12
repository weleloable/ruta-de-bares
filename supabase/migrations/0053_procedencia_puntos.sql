-- Ruta de Bares - 0053: de donde salen los puntos de cada persona.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0052.
-- Idempotente: se puede re-ejecutar sin romper nada (funcion con `or replace`).
--
-- Que hace. `casas_aportes_detalle(ruta, casa, persona)` devuelve el desglose
-- de lo que una persona aporta a su casa en la ruta, AGRUPADO por tipo (sin
-- horas ni lugares): cuantas veces y cuantos puntos de cada cosa. Lo ve quien
-- participa en la ruta o administra, igual que la lista de `casas_aportes`
-- (0052). Mismas reglas de reparto: el QR a medias entre los dos y la racha
-- a partes iguales entre quienes la hicieron. La suma del desglose es SIEMPRE
-- lo que `casas_aportes` dice de esa persona.
--
-- Filas: tipo ('sello', 'consumicion', 'categoria_nueva', 'ruta_completa',
-- 'podio', 'racha', 'qr', 'reto', 'ajuste'), detalle (el juego del podio o el
-- nombre del reto; nulo en el resto), puesto (solo en los podios), veces y puntos.

create or replace function public.casas_aportes_detalle(p_route_id uuid, p_house text, p_user_id uuid)
returns table (tipo text, detalle text, puesto integer, veces integer, puntos numeric)
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
  with partes as (
    -- Lo que tiene persona (los retos, con su nombre; todo lo demas por tipo).
    select m.action as tipo,
           case when m.action = 'reto' then m.detail ->> 'nombre' end as detalle,
           null::integer as puesto,
           m.points::numeric as pts
      from public.point_movements m
     where m.route_id = p_route_id and m.house = p_house and m.annulled_at is null
       and m.user_id = p_user_id and m.action not in ('racha', 'qr')
    union all
    -- Sus podios, en vivo, por juego y puesto.
    select 'podio', pd.juego, pd.puesto, pd.points::numeric
      from public.casas_podios(p_route_id) pd
     where pd.house = p_house and pd.user_id = p_user_id
    union all
    -- Racha y QR: su parte, a partes iguales.
    select m.action, null, null, m.points::numeric / jsonb_array_length(m.detail -> 'usuarios')
      from public.point_movements m
     where m.route_id = p_route_id and m.house = p_house and m.annulled_at is null
       and m.action in ('racha', 'qr') and jsonb_typeof(m.detail -> 'usuarios') = 'array'
       and jsonb_array_length(m.detail -> 'usuarios') > 0
       and (m.detail -> 'usuarios') ? p_user_id::text
  )
  select p.tipo, p.detalle, p.puesto, count(*)::integer, sum(p.pts)::numeric
    from partes p
   group by p.tipo, p.detalle, p.puesto
   order by sum(p.pts) desc, p.tipo, p.detalle nulls first, p.puesto nulls first;
end;
$$;

revoke all on function public.casas_aportes_detalle(uuid, text, uuid) from public, anon;
grant execute on function public.casas_aportes_detalle(uuid, text, uuid) to authenticated;
