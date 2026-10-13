-- Ruta de Bares - 0065: cambiar los puntos de una accion ya no da error.
-- Pegar entero en SQL Editor (Supabase > SQL Editor > New query > Run), DESPUES
-- de la 0064.
-- Idempotente: se puede re-ejecutar sin romper nada (funcion con `or replace`).
-- Ojo al reves: rehace casas_admin_regla() de la 0048, que ya no se vuelve a pegar.
--
-- El fallo. En "Casas y puntuaciones" > "Reglas y retos", al tocar + o - de
-- cualquier accion salia "UPDATE requires a WHERE clause" y el valor no cambiaba.
-- Lo lanza `pg-safeupdate`, la proteccion que Supabase activa para las llamadas
-- de la API: rechaza todo UPDATE o DELETE sin WHERE, tambien dentro de una
-- funcion. `casas_admin_regla` acababa con
--
--     update public.casas_marcador set cambiado_at = now();
--
-- que a proposito toca TODAS las filas (avisa al tiempo real de que los podios
-- han cambiado, en cada ruta), pero sin WHERE. En el SQL Editor y en los tests
-- no salta (ahi no esta cargada), por eso no lo cazo ningun test: se vio al
-- probar en el Supabase local, que SI la lleva.
--
-- El arreglo: el mismo cuerpo de la 0048 y `where true`, que dice lo que se
-- quiere (todas las filas) de una forma que la proteccion acepta.
-- `tests/migraciones-sin-update-suelto.test.ts` vigila que no vuelva a pasar.

create or replace function public.casas_admin_regla(p_action text, p_points integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.casas_admin_requerir();
  if p_points is null or p_points < 0 or p_points > 1000 then
    raise exception 'INVALID_POINTS' using errcode = '22023';
  end if;
  update public.point_rules r
     set points = p_points, updated_at = now(), updated_by = auth.uid()
   where r.action = p_action;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Los podios se leen en vivo de las reglas: que el ranking se entere. Todas
  -- las rutas, a proposito: `where true` y no un filtro (ver la cabecera).
  update public.casas_marcador c set cambiado_at = now() where true;
end;
$$;
