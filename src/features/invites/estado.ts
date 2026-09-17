import type { RouteInviteRow } from '../../types/database';

/**
 * Estado de una invitacion a una ruta, derivado de sus datos.
 *
 * Modulo aparte de invites/api.ts porque es logica pura y api.ts importa el
 * cliente de Supabase, que no se puede cargar en los tests de Node.
 *
 * El orden importa y no es arbitrario, es el del historial:
 *   anulada  gana a todo, porque fue un acto deliberado de un admin y el
 *            historial tiene que seguir contandolo aunque ademas caducara.
 *   llena    gana a caducada: dice que la invitacion hizo su trabajo, que es
 *            mas informativo que decir que se le paso la hora.
 */
export type InviteStatus = 'anulada' | 'llena' | 'caducada' | 'activa';

export type InviteParaEstado = Pick<RouteInviteRow, 'revoked_at' | 'expires_at' | 'max_uses'> & {
  /** Plazas ya gastadas: filas de route_members con este invite_id. */
  usos: number;
};

export function inviteStatus(invite: InviteParaEstado, now = new Date()): InviteStatus {
  if (invite.revoked_at !== null) return 'anulada';
  if (invite.usos >= invite.max_uses) return 'llena';
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return 'caducada';
  return 'activa';
}

/** "3 de 20 plazas" para el historial. */
export function plazasTexto(invite: InviteParaEstado): string {
  return `${invite.usos} de ${invite.max_uses} ${invite.max_uses === 1 ? 'plaza' : 'plazas'}`;
}
