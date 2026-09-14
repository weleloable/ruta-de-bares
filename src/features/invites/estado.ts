import type { InviteRow } from '../../types/database';

/**
 * Estado de una invitacion, derivado de sus fechas.
 *
 * Modulo aparte de invites/api.ts porque es logica pura y api.ts importa el
 * cliente de Supabase, que no se puede cargar en los tests de Node.
 *
 * El orden importa: una invitacion usada sigue siendo 'usada' aunque su fecha
 * de caducidad ya haya pasado. Lo contrario borraria del historial quien la uso.
 */
export type InviteStatus = 'usada' | 'caducada' | 'activa';

export function inviteStatus(
  invite: Pick<InviteRow, 'used_at' | 'expires_at'>,
  now = new Date(),
): InviteStatus {
  if (invite.used_at !== null) return 'usada';
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return 'caducada';
  return 'activa';
}
