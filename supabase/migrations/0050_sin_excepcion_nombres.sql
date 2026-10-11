-- Ruta de Bares - 0050: fuera la excepcion de casa por nombre (Pablo / Rodrigo).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0049.
-- Idempotente: se puede re-ejecutar sin romper nada (`or replace` y
-- `drop function if exists`).
-- Ojo al reves: rehace asignar_casa() de la 0043, que ya no se puede volver a
-- pegar despues (devolveria la excepcion por nombre).
--
-- Que hace. La 0043 mandaba a Pablo a Cruzcampo y a Rodrigo a Estrella Galicia
-- por encima del equilibrio. Era una regla temporal, para quien ya estaba
-- cuando llegaron las casas. Se quita entera:
--
--   * `asignar_casa()` vuelve a ser solo equilibrio: la casa con menos gente en
--     la ruta, y a sorteo si empatan.
--   * `casa_por_nombre()` se borra.
--
-- A quien ya tiene casa NO se le toca nada (la casa es para siempre, y un admin
-- puede cambiarla desde el panel). Solo afecta a quien entre en su primera ruta
-- a partir de ahora.

create or replace function public.asignar_casa(p_user_id uuid, p_route_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_actual text;
  v_casa   text;
begin
  select h.house into v_actual from public.user_houses h where h.user_id = p_user_id;
  if v_actual is not null then
    return v_actual;
  end if;

  -- La casa con menos gente en esta ruta (sin contarle a el); empate a sorteo.
  select c.casa into v_casa
    from (values ('mahou'), ('cruzcampo'), ('estrella'), ('alhambra')) as c (casa)
    left join (
      select h.house, count(*) as n
        from public.route_members m
        join public.user_houses h on h.user_id = m.user_id
       where m.route_id = p_route_id and m.user_id <> p_user_id
       group by h.house
    ) cuenta on cuenta.house = c.casa
   order by coalesce(cuenta.n, 0) asc, random()
   limit 1;

  insert into public.user_houses (user_id, house, assigned_route)
  values (p_user_id, v_casa, p_route_id)
  on conflict (user_id) do nothing;

  select h.house into v_casa from public.user_houses h where h.user_id = p_user_id;
  return v_casa;
end;
$$;

revoke all on function public.asignar_casa(uuid, uuid) from public, anon, authenticated;

drop function if exists public.casa_por_nombre(text);
