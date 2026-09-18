/**
 * Enlaces de invitacion a una ruta.
 *
 * El token son 32 bytes aleatorios en base64url (43 caracteres) generados por
 * create_route_invite() en Postgres y guardados EN CLARO (para que el historial
 * pueda volver a enseñar el enlace): ver
 * supabase/migrations/0004_invitaciones_por_ruta.sql.
 *
 * El enlace que se reparte es una URL https de la web publicada. Un esquema
 * propio (`rutadebares://`) no es un enlace de verdad: WhatsApp no lo pinta como
 * pulsable en todos los casos y, sin la app nativa instalada, no abre nada. La
 * URL https abre siempre la web (la PWA), y ahi la pantalla /invitacion recoge
 * el token, pide crear cuenta o iniciar sesion si hace falta, y mete en la ruta.
 *
 * parseInviteToken traga cualquier forma (https, deep link, `exp://` de
 * desarrollo o el codigo pelado), asi que enlaces y codigos viejos siguen
 * valiendo.
 */

/**
 * Donde vive la web. Tiene que coincidir con la subruta que exporta
 * .github/workflows/deploy-web.yml (WEB_BASE_URL): lo vigila
 * tests/deploy-web.test.ts. Sin barra final.
 */
export const WEB_APP_URL = 'https://weleloable.github.io/ruta-de-bares';

/** Esquema de la app nativa (app.config.ts, `scheme`). */
export const INVITE_SCHEME = 'rutadebares';
export const INVITE_PATH = 'invitacion';

/** 32 bytes en base64url = 43 caracteres, sin relleno. */
export const INVITE_TOKEN_BYTES = 32;
const INVITE_TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidTokenShape(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** El enlace que se comparte: una URL https que abre la web y canjea la ruta. */
export function buildInviteUrl(token: string): string {
  if (!isValidTokenShape(token)) {
    throw new Error('Token de invitacion con formato invalido');
  }
  return `${WEB_APP_URL}/${INVITE_PATH}?token=${token}`;
}

/** Deep link a la app nativa. Ya no se reparte; queda para pruebas y por si hace falta. */
export function buildAppLink(token: string): string {
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

  // Todos los `token=`, no solo el primero: `?token=x&token=<bueno>` es un
  // enlace mal pegado, no un enlace sin token.
  for (const m of texto.matchAll(/[?&]token=([A-Za-z0-9_-]+)/g)) {
    const candidato = m[1];
    if (isValidTokenShape(candidato)) return candidato;
    // WhatsApp pone _cursiva_ y -guiones- alrededor de un enlace: `_` y `-`
    // son letras validas del token, asi que se quedan pegados al final y
    // sobra exactamente un caracter.
    if (candidato.length === INVITE_TOKEN_LENGTH + 1 && /[_-]$/.test(candidato)) {
      return candidato.slice(0, INVITE_TOKEN_LENGTH);
    }
  }

  if (isValidTokenShape(texto)) return texto;

  return null;
}

/**
 * El parametro `token` tal como lo entrega expo-router: puede ser un string, un
 * array (`?token=a&token=b`) o faltar. Nunca lanza: es la entrada publica de
 * /invitacion y un enlace mal formado no puede tumbar la pantalla.
 */
export function parseInviteParam(valor: string | string[] | undefined): string | null {
  const valores = Array.isArray(valor) ? valor : [valor];
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const token = parseInviteToken(v);
    if (token !== null) return token;
  }
  return null;
}

/**
 * Que hacer cuando Share.share falla. react-native-web lo rechaza si el
 * navegador no tiene navigator.share (escritorio): ahi se copia el mensaje.
 * Pero si el usuario CIERRA la hoja de compartir el navegador rechaza con
 * AbortError, y eso es una cancelacion, no un fallo: copiar entonces seria
 * pisarle el portapapeles sin que lo haya pedido.
 */
export function debeCopiarTrasFalloDeCompartir(error: unknown): boolean {
  const nombre = (error as { name?: unknown } | null)?.name;
  return nombre !== 'AbortError';
}

/**
 * Texto que el admin comparte por WhatsApp.
 *
 * Nombra la ruta porque ahora la invitacion es A UNA RUTA, no a la app: quien
 * lo recibe ya puede tener cuenta, y lo que necesita saber es a que le apuntan.
 *
 * La URL va sola en su ultima linea: asi WhatsApp y los demas la detectan como
 * enlace sin arrastrar puntuacion pegada. No lleva el codigo aparte: ya va
 * dentro de la URL, y la pantalla de canje sigue aceptandolo pegado a mano.
 */
export function buildShareMessage(token: string, routeName: string): string {
  const ruta = routeName.trim();
  return [
    ruta.length > 0 ? `Te apuntas a "${ruta}"?` : 'Te apuntas a la ruta?',
    '',
    'Abre este enlace para entrar en la ruta:',
    buildInviteUrl(token),
  ].join('\n');
}
