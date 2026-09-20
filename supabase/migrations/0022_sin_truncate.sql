-- Ruta de Bares - 0022: quitarle TRUNCATE a anon y authenticated.
-- Pegar entero en Supabase > SQL Editor > New query > Run, DESPUES de la 0021.
-- Idempotente: se puede re-ejecutar sin romper nada.
--
-- Por que existe. Los permisos por defecto de Supabase conceden `all` a `anon`
-- y `authenticated` sobre lo que se cree en `public`, y `all` incluye TRUNCATE.
-- **La RLS no protege de TRUNCATE**: es un privilegio de TABLA, no de fila, asi
-- que una policy que filtra a cero filas no impide vaciarla entera. Comprobado
-- contra la base local: como rol `anon`, sin sesion siquiera, un `truncate`
-- funcionaba sobre route_bars, stamps, route_invites y route_members. Vaciar
-- route_members deja a todo el mundo fuera de todas las rutas de golpe.
--
-- Las tablas match_* no hacen falta aqui: la 0005 ya les revoco todo (la cana
-- va entera por funciones SECURITY DEFINER). profiles y routes se salvaban solo
-- de casualidad, porque el cascade topaba con esas tablas; eso no es una
-- defensa, es un accidente que el dia que se toque deja de valer.
--
-- Explotabilidad hoy: BAJA. PostgREST no tiene verbo TRUNCATE y los roles son
-- NOLOGIN, asi que no hay camino desde la API. Esto se arregla porque es barato
-- y porque el dia que alguien anada una funcion `security invoker` con SQL
-- dinamico, o se conceda `login` a un rol, deja de ser bajo.
--
-- La segunda mitad (alter default privileges) es la que de verdad cierra el
-- agujero: sin ella, la tabla que cree la proxima migracion vuelve a nacer con
-- el mismo problema y hay que acordarse de revocarlo a mano. Aplica a lo que
-- cree el rol que ejecuta esto (postgres, el del SQL Editor), que es quien crea
-- las tablas de las migraciones.

revoke truncate on
  public.profiles,
  public.routes,
  public.route_bars,
  public.stamps,
  public.route_invites,
  public.route_members,
  public.avatar_requests
from anon, authenticated;

alter default privileges in schema public
  revoke truncate on tables from anon, authenticated;
