/**
 * A donde manda el portero de la navegacion (AuthGate, app/_layout.tsx), sin
 * red ni router, para poder probarlo con node --test.
 *
 * La regla que faltaba: con sesion y una invitacion pendiente, SIEMPRE se va a
 * la invitacion, este donde este la persona. Antes solo se miraba al estar en
 * login o registro, y la sesion aparece en otros sitios: la vuelta de Google y
 * el enlace del correo de confirmacion aterrizan en la raiz de la app, y de ahi
 * la persona acababa en Sellos sin haberse unido a la ruta que venia a buscar.
 */

export type Destino = { pathname: '/login' } | { pathname: '/' } | { pathname: '/invitacion'; params: { token: string } };

export type EstadoPortero = {
  /** Hay sesion iniciada. */
  sesion: boolean;
  /** segments[0] de expo-router: '(auth)', 'invitacion', 'privacidad', '(tabs)'... */
  primero: string | undefined;
  /** El token de una invitacion abierta sin sesion y todavia sin canjear, si lo hay. */
  pendiente: string | null;
};

/** null = quedarse donde esta. */
export function destinoDelPortero({ sesion, primero, pendiente }: EstadoPortero): Destino | null {
  const enAuth = primero === '(auth)';
  // /invitacion y /privacidad son publicas a proposito (ver AuthGate): la
  // primera para no perder el token al pedir sesion, la segunda porque el
  // art. 13 del RGPD obliga a informar ANTES de recoger datos.
  const enInvitacion = primero === 'invitacion';
  const enPrivacidad = primero === 'privacidad';

  if (!sesion) return !enAuth && !enInvitacion && !enPrivacidad ? { pathname: '/login' } : null;

  // Con sesion, en la propia invitacion o leyendo la politica: no se toca. La
  // invitacion borra el pendiente en cuanto se muestra con sesion, asi que esto
  // no puede hacer bucle.
  if (enInvitacion || enPrivacidad) return null;

  if (pendiente) return { pathname: '/invitacion', params: { token: pendiente } };
  return enAuth ? { pathname: '/' } : null;
}
