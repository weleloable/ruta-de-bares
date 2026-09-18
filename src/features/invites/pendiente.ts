/**
 * El token de una invitacion abierta SIN sesion, guardado hasta que la haya.
 *
 * El problema que resuelve: alguien recibe el enlace de una ruta, lo abre y no
 * tiene la sesion iniciada. Sin esto, AuthGate le manda a /login y el token se
 * pierde por el camino: crea la cuenta, entra, y no esta en ninguna ruta, sin
 * que nada le explique por que.
 *
 * Vive en memoria del modulo, que cubre el viaje login/registro -> canje dentro
 * de la misma carga. En web se refleja ADEMAS en localStorage, porque ahi hay un
 * camino que recarga la pagina: con la confirmacion de correo activada, quien
 * se registra abre el enlace del correo (otra carga, memoria vacia) y despues
 * inicia sesion. Sin el reflejo, el token de la invitacion se perderia justo en
 * el caso normal de alguien nuevo. En nativo no existe localStorage y no se
 * toca; alli, si la app se cierra por el camino, el enlace sigue en WhatsApp.
 *
 * Es de un solo uso (tomar() u olvidar() lo borran) y caduca a las 24 h, para que no reviva
 * en una sesion posterior y meta a alguien en una ruta que ya no esperaba. El
 * servidor sigue siendo quien decide si la invitacion vale (caducidad, plazas).
 */
const CLAVE = 'rutadebares.invitacion-pendiente';
export const VIGENCIA_MS = 24 * 60 * 60 * 1000;

/**
 * Misma forma que isValidTokenShape (link.ts), repetida a proposito: los
 * modulos con test no importan hermanos en runtime (node --test los ejecuta sin
 * resolver extensiones y tsc rechaza el ".ts"). Un test cruzado en
 * pendiente.test.ts vigila que las dos no se separen.
 *
 * Importa mas de lo normal: el token guardado acaba interpolado en una ruta
 * (`/invitacion?token=...` en AuthGate) y sale de un almacen que cualquier
 * script de la pagina puede escribir.
 */
const FORMA_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Lo que se usa de localStorage; se inyecta en los tests. */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

interface Opciones {
  /** null desactiva el reflejo. Por defecto, localStorage si existe. */
  almacen?: Almacen | null;
  ahora?: number;
}

let pendiente: string | null = null;

function almacenWeb(): Almacen | null {
  // Acceder a localStorage puede lanzar (cookies bloqueadas, modo privado), y
  // en nativo no existe: en los dos casos se sigue solo con la memoria.
  try {
    return (globalThis as { localStorage?: Almacen }).localStorage ?? null;
  } catch {
    return null;
  }
}

function elegir(opciones: Opciones): Almacen | null {
  return opciones.almacen === undefined ? almacenWeb() : opciones.almacen;
}

function leerAlmacen(almacen: Almacen | null, ahora: number): string | null {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(CLAVE);
    if (crudo === null) return null;
    const dato: unknown = JSON.parse(crudo);
    if (typeof dato !== 'object' || dato === null) return null;
    const { token, guardadoEn } = dato as { token?: unknown; guardadoEn?: unknown };
    if (typeof token !== 'string' || typeof guardadoEn !== 'number') return null;
    if (ahora - guardadoEn > VIGENCIA_MS || guardadoEn > ahora) return null;
    // El almacen es entrada no fiable: cualquier script de la pagina lo escribe.
    return FORMA_TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
}

function borrarAlmacen(almacen: Almacen | null): void {
  try {
    almacen?.removeItem(CLAVE);
  } catch {
    // Sin almacen no hay nada que limpiar.
  }
}

export function guardarInvitacionPendiente(token: string, opciones: Opciones = {}): void {
  // Validado tambien al entrar y no solo al leer del almacen: el token acaba en
  // una ruta del router, y la copia en memoria no pasa por leerAlmacen.
  if (!FORMA_TOKEN.test(token)) return;
  pendiente = token;
  const almacen = elegir(opciones);
  if (!almacen) return;
  try {
    almacen.setItem(CLAVE, JSON.stringify({ token, guardadoEn: opciones.ahora ?? Date.now() }));
  } catch {
    // Cuota llena o almacen bloqueado: queda la copia en memoria.
  }
}

/**
 * Lo devuelve SIN olvidarlo. Es lo que usa AuthGate: corre dentro de un efecto
 * que se repite (supabase-js reemite la sesion al volver a la pestana y al
 * refrescar el token), y si la primera pasada consumiera el token, la segunda
 * mandaria a "/" y la invitacion se perderia. Quien la borra es la pantalla
 * /invitacion en cuanto se muestra con sesion, o al canjear.
 */
export function leerInvitacionPendiente(opciones: Opciones = {}): string | null {
  return pendiente ?? leerAlmacen(elegir(opciones), opciones.ahora ?? Date.now());
}

/** Lo devuelve y lo olvida. Llamarlo dos veces devuelve null la segunda. */
export function tomarInvitacionPendiente(opciones: Opciones = {}): string | null {
  const token = leerInvitacionPendiente(opciones);
  olvidarInvitacionPendiente(opciones);
  return token;
}

export function olvidarInvitacionPendiente(opciones: Opciones = {}): void {
  pendiente = null;
  borrarAlmacen(elegir(opciones));
}
