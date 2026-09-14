/**
 * Enlaces de invitacion de un solo uso.
 *
 * El token son 32 bytes aleatorios en base64url (43 caracteres) generados por
 * la Edge Function `create-invite`. La base de datos guarda su sha256, nunca el
 * token: ver supabase/migrations/0001_init.sql.
 */

export const INVITE_SCHEME = 'rutadebares';
export const INVITE_PATH = 'invitacion';

/** 32 bytes en base64url = 43 caracteres, sin relleno. */
export const INVITE_TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidTokenShape(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function buildInviteUrl(token: string): string {
  if (!isValidTokenShape(token)) {
    throw new Error('Token de invitacion con formato invalido');
  }
  return `${INVITE_SCHEME}://${INVITE_PATH}?token=${token}`;
}

/**
 * Saca el token de lo que sea que le llegue: el deep link de produccion, el
 * `exp://.../--/invitacion?token=` del servidor de desarrollo, un enlace https,
 * o el token pelado pegado a mano.
 *
 * Devuelve null si no hay nada con forma de token. No se parsea con `new URL`
 * a proposito: los esquemas propios no estandar se comportan de forma distinta
 * segun plataforma, y aqui solo hace falta un parametro.
 */
export function parseInviteToken(input: string): string | null {
  const texto = input.trim();
  if (texto === '') return null;

  const enQuery = /[?&]token=([A-Za-z0-9_-]+)/.exec(texto);
  if (enQuery && isValidTokenShape(enQuery[1])) return enQuery[1];

  if (isValidTokenShape(texto)) return texto;

  return null;
}

/** Texto que el admin comparte por WhatsApp. */
export function buildShareMessage(token: string, label: string): string {
  const saludo = label.trim().length > 0 ? `Invitacion para ${label.trim()}` : 'Invitacion';
  return [
    `${saludo} a Ruta de Bares.`,
    '',
    'Abre este enlace en el movil con la app instalada:',
    buildInviteUrl(token),
    '',
    'Si el enlace no abre la app, pega este codigo en la pantalla de invitacion:',
    token,
    '',
    'El enlace solo sirve una vez.',
  ].join('\n');
}
