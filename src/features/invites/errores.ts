/**
 * Traduce los errores que lanzan create_route_invite() y redeem_route_invite().
 *
 * Modulo aparte de invites/api.ts porque es logica pura y api.ts importa el
 * cliente de Supabase, que no se puede cargar en los tests de Node.
 *
 * Postgres manda el texto crudo del RAISE ('INVITE_FULL', a veces envuelto en
 * mas texto del driver), asi que se busca por contenido y no por igualdad.
 */
const MENSAJES: readonly (readonly [string, string])[] = [
  ['INVITE_FULL', 'Esta invitacion ya ha agotado sus plazas.'],
  ['INVITE_UNUSABLE', 'Esta invitacion no vale: no existe, ha caducado o la han anulado.'],
  ['NOT_AUTHENTICATED', 'Inicia sesion para entrar en la ruta.'],
  ['FORBIDDEN', 'Solo un administrador puede crear invitaciones.'],
  ['ROUTE_NOT_FOUND', 'Esa ruta ya no existe.'],
  ['BAD_EXPIRY', 'La caducidad tiene que estar entre 1 y 72 horas.'],
];

export function traducirErrorInvitacion(mensaje: string): string {
  for (const [codigo, texto] of MENSAJES) {
    if (mensaje.includes(codigo)) return texto;
  }
  return mensaje;
}
