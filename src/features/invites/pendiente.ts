/**
 * El token de una invitacion abierta SIN sesion, guardado hasta que la haya.
 *
 * El problema que resuelve: alguien recibe el enlace de una ruta, lo abre y no
 * tiene la sesion iniciada. Sin esto, AuthGate le manda a /login y el token se
 * pierde por el camino: crea la cuenta, entra, y no esta en ninguna ruta, sin
 * que nada le explique por que.
 *
 * En memoria del modulo a proposito, no en SecureStore: solo tiene que
 * sobrevivir al viaje login/registro -> canje dentro de la misma apertura de la
 * app. Si la app se cierra por el camino, el enlace sigue en su WhatsApp.
 *
 * Es de un solo uso (tomar() lo borra) para que no reviva en una sesion
 * posterior y meta a alguien en una ruta que ya no esperaba.
 */
let pendiente: string | null = null;

export function guardarInvitacionPendiente(token: string): void {
  pendiente = token;
}

/** Lo devuelve y lo olvida. Llamarlo dos veces devuelve null la segunda. */
export function tomarInvitacionPendiente(): string | null {
  const token = pendiente;
  pendiente = null;
  return token;
}

export function olvidarInvitacionPendiente(): void {
  pendiente = null;
}
