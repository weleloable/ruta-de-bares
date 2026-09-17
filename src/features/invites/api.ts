import { supabase } from '../../lib/supabase';
import { traducirErrorInvitacion } from './errores';
import { combinarInvitaciones, type InviteConRuta } from './historial';

export { inviteStatus, plazasTexto, type InviteStatus, type InviteParaEstado } from './estado';
export type { InviteConRuta } from './historial';

export type CreatedInvite = { id: string; token: string; expiresAt: string };

/**
 * Crea una invitacion a una ruta.
 *
 * El token vuelve UNA sola vez, en esta respuesta: la base de datos solo guarda
 * su sha256. Si el admin lo pierde, crea otra invitacion.
 *
 * Quien comprueba que eres admin es la propia funcion de Postgres, no esta
 * pantalla: create_route_invite() lanza FORBIDDEN si no lo eres.
 */
export async function createRouteInvite(
  routeId: string,
  maxUses: number,
  expiresInHours: number,
): Promise<CreatedInvite> {
  const { data, error } = await supabase.rpc('create_route_invite', {
    p_route_id: routeId,
    p_max_uses: maxUses,
    p_expires_in_hours: expiresInHours,
  });

  if (error) throw new Error(traducirErrorInvitacion(error.message));

  // `returns table` de Postgres llega como un array de una fila.
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila) throw new Error('La base de datos no devolvio la invitacion.');

  return { id: fila.invite_id, token: fila.invite_token, expiresAt: fila.invite_expires_at };
}

/**
 * Canje. Se llama CON sesion: la cuenta ya existe (el alta es abierta) y esto
 * solo apunta a quien llama a una ruta. Devuelve el id de esa ruta.
 */
export async function redeemRouteInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_route_invite', { p_token: token });
  if (error) throw new Error(traducirErrorInvitacion(error.message));
  if (!data) throw new Error('No se pudo canjear la invitacion.');
  return data as string;
}

/**
 * Historial de invitaciones, con el nombre de su ruta y las plazas gastadas.
 *
 * Tres consultas y el cruce en cliente (ver historial.ts). El recuento sale de
 * route_members: un admin las ve todas por RLS, asi que el numero es el real y
 * no solo el que le toque ver a quien pregunta.
 */
export async function listRouteInvites(): Promise<InviteConRuta[]> {
  const [invitaciones, miembros, rutas] = await Promise.all([
    supabase.from('route_invites').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('route_members').select('invite_id'),
    supabase.from('routes').select('id, name'),
  ]);

  if (invitaciones.error) throw new Error(invitaciones.error.message);
  if (miembros.error) throw new Error(miembros.error.message);
  if (rutas.error) throw new Error(rutas.error.message);

  return combinarInvitaciones(invitaciones.data ?? [], miembros.data ?? [], rutas.data ?? []);
}

/**
 * Anular. No borra la fila: marca revoked_at para que el historial siga
 * contando que existio. Quien ya entro con ella se queda dentro (lo impone
 * redeem_route_invite, no esta funcion).
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('route_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw new Error(error.message);
}
