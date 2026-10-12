-- Ruta de Bares - 0054: cuanto vale cada accion, visible para quien participa.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0053.
-- Idempotente: se puede re-ejecutar sin romper nada (funcion con `or replace`).
--
-- Que hace. `point_rules` (0044) no se puede leer desde la app; solo lo ve quien
-- administra, por `casas_admin_reglas()` (0048). Para el boton (i) de la tabla
-- de casas ("todas las formas de ganar puntos") la gente necesita ver los
-- valores ACTUALES, que un admin puede cambiar. `casas_puntos()` los devuelve:
-- solo accion y puntos, nada mas.

create or replace function public.casas_puntos()
returns table (action text, points integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  return query select r.action, r.points from public.point_rules r order by r.action;
end;
$$;

revoke all on function public.casas_puntos() from public, anon;
grant execute on function public.casas_puntos() to authenticated;
