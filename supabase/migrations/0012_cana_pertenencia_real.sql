-- Ruta de Bares - 0012: la cana usa la pertenencia de verdad (route_members).
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0011.
-- Idempotente: se puede re-ejecutar.
--
-- Por que existe: la 0005 trajo `is_route_participant(ruta, usuario)` como
-- version PROVISIONAL ("participa todo el mundo en las rutas publicadas"),
-- creada solo si no existia, a la espera de la migracion de pertenencia. Esa
-- migracion ya esta aqui: la 0004 del remoto crea `route_members` y decide con
-- ella lo que ve cada persona.
--
-- La 0004 expone `is_route_member(p_route_id)`, que mira `auth.uid()`. A la
-- cana no le basta: tiene que preguntar tambien por OTRAS personas ("¿esta
-- Marta en esta ruta?") al pintar la grilla, al votar y al abrir un chat. Por
-- eso se conserva la firma de dos argumentos, pero deja de inventarse la
-- respuesta: la lee de `route_members`, que es la autoridad.
--
-- Efecto practico: quien no ha canjeado una invitacion a la ruta desaparece de
-- la grilla y de los chats de esa ruta, aunque tenga la cana activada.

create or replace function public.is_route_participant(p_route_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1 from public.route_members m
     where m.route_id = p_route_id and m.user_id = p_user_id
  );
$$;

-- Mismos permisos que traia de la 0005: la app no la llama directamente, la
-- usan por dentro las funciones match_*.
revoke all on function public.is_route_participant(uuid, uuid) from public, anon;
grant execute on function public.is_route_participant(uuid, uuid) to authenticated;
