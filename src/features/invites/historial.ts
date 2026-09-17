import type { RouteInviteRow, RouteMemberRow, RouteRow } from '../../types/database';

/** Una fila del historial: la invitacion + el nombre de su ruta + plazas gastadas. */
export type InviteConRuta = RouteInviteRow & { routeName: string; usos: number };

/**
 * Cruza invitaciones, rutas y pertenencias para pintar el historial.
 *
 * Se hace aqui, en el cliente, y no con un embed de PostgREST
 * (`select('*, routes(name), route_members(count)')`) por dos motivos: el
 * embed necesita que src/types/database.ts declare las relaciones, que se
 * escriben a mano y se desincronizan; y asi el cruce es logica pura que se
 * puede probar sin red, que es como el proyecto prueba el resto de reglas.
 *
 * El coste es una consulta mas. Son tablas de decenas de filas: irrelevante.
 */
export function combinarInvitaciones(
  invitaciones: readonly RouteInviteRow[],
  miembros: readonly Pick<RouteMemberRow, 'invite_id'>[],
  rutas: readonly Pick<RouteRow, 'id' | 'name'>[],
): InviteConRuta[] {
  const nombrePorRuta = new Map(rutas.map((r) => [r.id, r.name]));

  const usosPorInvitacion = new Map<string, number>();
  for (const miembro of miembros) {
    // Los miembros del backfill (migracion 0004) no vienen de ninguna
    // invitacion: tienen invite_id null y no cuentan como plaza gastada.
    if (miembro.invite_id === null) continue;
    usosPorInvitacion.set(miembro.invite_id, (usosPorInvitacion.get(miembro.invite_id) ?? 0) + 1);
  }

  return invitaciones.map((invitacion) => ({
    ...invitacion,
    // Si la ruta se borro, su invitacion cae con ella por el ON DELETE CASCADE.
    // Este texto solo se veria en la ventana entre borrar y recargar.
    routeName: nombrePorRuta.get(invitacion.route_id) ?? 'Ruta borrada',
    usos: usosPorInvitacion.get(invitacion.id) ?? 0,
  }));
}
