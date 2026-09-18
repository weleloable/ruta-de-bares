/**
 * Reglas de "Tirate una cana". Espejo de supabase/migrations/0004_tirate_una_cana.sql.
 *
 * El servidor es la autoridad: decide si activas, si hay conexion, si puedes
 * preguntar o escribir. Esta copia existe solo para la interfaz (deshabilitar
 * un boton, contar caracteres, decir "podras volver a preguntar en 12 min")
 * sin ir al servidor a cada toque. Si las dos discrepan, manda el SQL; los
 * numeros de abajo los compara con la migracion tests/match-espejo.test.ts.
 *
 * Sin imports a proposito: se prueba con node --test directamente.
 */

/** Caracteres de la frase de presentacion. */
export const BIO_MAX = 120;
/** Etiquetas que puede elegir cada persona (D11). */
export const ETIQUETAS_MAX = 5;

export type Presentacion = { bio: string; etiquetas: readonly string[] };

/** Problemas que el servidor rechazaria. Vacio = se puede enviar. */
export function validarPresentacion({ bio, etiquetas }: Presentacion): string[] {
  const errores: string[] = [];
  const frase = bio.trim();
  if (frase.length === 0) errores.push('Escribe una frase para presentarte.');
  if (frase.length > BIO_MAX) errores.push(`La frase no puede pasar de ${BIO_MAX} caracteres.`);
  if (new Set(etiquetas).size > ETIQUETAS_MAX) {
    errores.push(`Puedes elegir hasta ${ETIQUETAS_MAX} etiquetas.`);
  }
  return errores;
}

/**
 * Marca o desmarca una etiqueta. Con el maximo alcanzado no anade mas: la
 * pantalla ensena el limite en vez de dejar elegir y fallar al guardar.
 */
export function alternarEtiqueta(seleccion: readonly string[], id: string): string[] {
  if (seleccion.includes(id)) return seleccion.filter((actual) => actual !== id);
  if (seleccion.length >= ETIQUETAS_MAX) return [...seleccion];
  return [...seleccion, id];
}

/** Estado de la pestana segun el perfil cervecero y si hay ruta. */
export type EstadoPestana =
  | { tipo: 'sin-ruta' }
  | { tipo: 'desactivado'; primeraVez: boolean; pideMayoriaDeEdad: boolean }
  | { tipo: 'activado' };

export function estadoPestana(
  hayRuta: boolean,
  perfil: { is_active: boolean; adult_confirmed: boolean; has_activated_before: boolean } | null,
): EstadoPestana {
  if (!hayRuta) return { tipo: 'sin-ruta' };
  if (perfil?.is_active) return { tipo: 'activado' };
  return {
    tipo: 'desactivado',
    primeraVez: !perfil?.has_activated_before,
    pideMayoriaDeEdad: !perfil?.adult_confirmed,
  };
}

// --- Grilla -----------------------------------------------------------------

/**
 * Lo que ve cada persona de una tarjeta. El voto de la otra persona no llega
 * nunca al cliente: solo se nota como conexion cuando los dos coinciden.
 * No hay "No me gusta" (0004): quien abrio la ficha y no dio Me gusta, o lo
 * quito, queda como Visto.
 */
export type EstadoTarjeta = 'nuevo' | 'me-gusta' | 'visto' | 'conexion';

export function estadoTarjeta(tarjeta: {
  my_vote: 'like' | 'seen' | null;
  connection_id: string | null;
}): EstadoTarjeta {
  if (tarjeta.connection_id !== null) return 'conexion';
  if (tarjeta.my_vote === 'like') return 'me-gusta';
  if (tarjeta.my_vote === 'seen') return 'visto';
  return 'nuevo';
}

export type Filtro = 'todos' | 'me-gusta' | 'visto' | 'conexiones' | 'nuevos';

/** En el orden en que se ensenan. */
export const FILTROS: readonly { id: Filtro; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'me-gusta', etiqueta: 'Me gusta' },
  { id: 'visto', etiqueta: 'Visto' },
  { id: 'conexiones', etiqueta: 'Conexiones' },
  { id: 'nuevos', etiqueta: 'Nuevos' },
];

export function pasaFiltro(filtro: Filtro, estado: EstadoTarjeta): boolean {
  switch (filtro) {
    case 'todos':
      return true;
    case 'me-gusta':
      // Una conexion tambien es un Me gusta que has dado (D6).
      return estado === 'me-gusta' || estado === 'conexion';
    case 'visto':
      return estado === 'visto';
    case 'conexiones':
      return estado === 'conexion';
    case 'nuevos':
      return estado === 'nuevo';
  }
}

export function contarPorFiltro(estados: readonly EstadoTarjeta[]): Record<Filtro, number> {
  const cuenta = { todos: 0, 'me-gusta': 0, visto: 0, conexiones: 0, nuevos: 0 };
  for (const estado of estados) {
    for (const { id } of FILTROS) if (pasaFiltro(id, estado)) cuenta[id] += 1;
  }
  return cuenta;
}

/**
 * Quitar el Me gusta a alguien con quien hay conexion la cierra y borra el
 * chat: es lo unico irreversible de la ficha, y lo unico que se confirma.
 */
export function quitarMeGustaRompeConexion(estado: EstadoTarjeta): boolean {
  return estado === 'conexion';
}

/** Al abrir una ficha solo hay que apuntar Visto si aun no habia nada. */
export function hayQueMarcarVisto(estado: EstadoTarjeta): boolean {
  return estado === 'nuevo';
}

// --- Chat -------------------------------------------------------------------

/**
 * Cuanto se solapa cada consulta de mensajes con la anterior. Un mensaje
 * insertado antes puede confirmarse despues de otro ya recibido; sin solape el
 * polling se lo saltaria. Los repetidos se quitan por id (fusionarMensajes).
 */
export const SOLAPE_SONDEO_MS = 10_000;

type MensajeOrdenable = { id: string; created_at: string };

/** Une lo que ya habia con lo recien traido, sin repetidos y en orden. */
export function fusionarMensajes<T extends MensajeOrdenable>(actuales: readonly T[], nuevos: readonly T[]): T[] {
  const porId = new Map<string, T>();
  for (const mensaje of actuales) porId.set(mensaje.id, mensaje);
  for (const mensaje of nuevos) porId.set(mensaje.id, mensaje);
  return [...porId.values()].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
}

/**
 * Lo que la pantalla de chat sabe del hilo. `mensajes` es lo que se pinta,
 * tambien lo que el movil acaba de enviar; `ultimoSondeado` es la hora del
 * mensaje mas reciente que ha devuelto una consulta de mensajes, y solo de ahi
 * sale el "desde" de la siguiente.
 *
 * Lo enviado no mueve el "desde" porque la respuesta del envio no dice nada de
 * lo que la otra persona haya mandado entretanto. Cuando contaba, un movil que
 * pasaba mas de 10 s sin sondear (sin cobertura) y al volver lo primero que
 * hacia era enviar, pedia desde su propio mensaje menos el solape y se saltaba
 * para siempre lo que habia llegado en ese hueco.
 */
export type HiloChat<T extends MensajeOrdenable> = { mensajes: T[]; ultimoSondeado: string | null };

export function hiloVacio<T extends MensajeOrdenable>(): HiloChat<T> {
  return { mensajes: [], ultimoSondeado: null };
}

/** Lo que devuelve el sondeo: se pinta y adelanta el "desde" (nunca lo atrasa). */
export function recibirDelSondeo<T extends MensajeOrdenable>(hilo: HiloChat<T>, nuevos: readonly T[]): HiloChat<T> {
  let ultimo = hilo.ultimoSondeado;
  for (const mensaje of nuevos) {
    if (ultimo === null || Date.parse(mensaje.created_at) > Date.parse(ultimo)) ultimo = mensaje.created_at;
  }
  return { mensajes: fusionarMensajes(hilo.mensajes, nuevos), ultimoSondeado: ultimo };
}

/** Lo que el movil acaba de enviar: se pinta ya, pero no toca el "desde". */
export function recibirEnviado<T extends MensajeOrdenable>(hilo: HiloChat<T>, enviado: T): HiloChat<T> {
  return { mensajes: fusionarMensajes(hilo.mensajes, [enviado]), ultimoSondeado: hilo.ultimoSondeado };
}

/** Desde cuando pedir mensajes: lo ultimo que trajo el sondeo menos el solape; null = todos. */
export function desdeParaSondeo(hilo: HiloChat<MensajeOrdenable>): string | null {
  if (hilo.ultimoSondeado === null) return null;
  return new Date(Date.parse(hilo.ultimoSondeado) - SOLAPE_SONDEO_MS).toISOString();
}

// --- Consentimiento ---------------------------------------------------------

/**
 * Version de las condiciones de la cana que se guarda al activar (0009).
 * Se sube la fecha SOLO si cambia lo que se acepta, no con cada retoque de
 * redaccion: es lo que permite saber que acepto cada persona.
 */
export const CONSENTIMIENTO_VERSION = '2026-09-18';

// --- Bloquear y denunciar ---------------------------------------------------

/** Caracteres del detalle opcional de una denuncia (0008). */
export const DETALLE_MAX = 500;

export type MotivoDenuncia = 'foto' | 'acoso' | 'suplantacion' | 'menor' | 'otro';

/**
 * Los motivos, en el orden en que se ensenan. Son los mismos que acepta
 * match_report: si se cambia uno, cambia tambien la migracion.
 */
export const MOTIVOS_DENUNCIA: readonly { id: MotivoDenuncia; etiqueta: string; ayuda: string }[] = [
  { id: 'foto', etiqueta: 'La foto', ayuda: 'No es suya, o no deberia estar aqui' },
  { id: 'acoso', etiqueta: 'Acoso o insultos', ayuda: 'Lo que ha escrito o lo que hace en la ruta' },
  { id: 'suplantacion', etiqueta: 'Se hace pasar por otra persona', ayuda: '' },
  { id: 'menor', etiqueta: 'Creo que es menor de edad', ayuda: 'La cana es solo para mayores' },
  { id: 'otro', etiqueta: 'Otra cosa', ayuda: 'Cuentanoslo abajo' },
];

/** Problemas que el servidor rechazaria al denunciar. Vacio = se puede enviar. */
export function validarDenuncia(motivo: MotivoDenuncia | null, detalle: string): string[] {
  const errores: string[] = [];
  if (motivo === null) errores.push('Elige un motivo.');
  if (detalle.trim().length > DETALLE_MAX) errores.push(`El detalle no puede pasar de ${DETALLE_MAX} caracteres.`);
  return errores;
}

// --- La pregunta de la cerveza ---------------------------------------------

/** Tras "dentro de un rato" se puede volver a preguntar pasado este tiempo (D5). */
export const PREGUNTA_ESPERA_MS = 30 * 60_000;
/** Aplazamientos como maximo; despues ya no se pregunta mas en la pareja (D5). */
export const APLAZAMIENTOS_MAX = 2;
/** Textos que puede mandar cada persona tras el Si (D7, 0007: era 2). */
export const TEXTOS_POR_PERSONA = 1;
export const TEXTO_MAX = 120;

/**
 * Lo que se puede escribir tras el Si, dicho para que nadie gaste su unico
 * mensaje en un "hola". Con TEXTOS_POR_PERSONA = 1 es lo mas importante de la
 * pantalla: no hay segunda oportunidad.
 */
export function textoRestante(restantes: number): string {
  if (restantes === 0) {
    return TEXTOS_POR_PERSONA === 1 ? 'Ya has enviado tu mensaje.' : `Ya has enviado tus ${TEXTOS_POR_PERSONA} mensajes.`;
  }
  if (TEXTOS_POR_PERSONA === 1) return 'Solo puedes enviar 1 mensaje, y se envía entero';
  return restantes === 1 ? 'Te queda 1 mensaje' : `Te quedan ${restantes} mensajes`;
}

export type EstadoPregunta =
  /** Cualquiera de los dos puede preguntar (D4). */
  | { tipo: 'disponible'; tuvoAplazamiento: boolean }
  | { tipo: 'esperando-respuesta' }
  | { tipo: 'te-toca-responder'; ultimoAplazamiento: boolean }
  /** `teLoAplazaron`: la otra persona dijo "luego" a TU pregunta. */
  | { tipo: 'aplazada'; disponibleEnMs: number; teLoAplazaron: boolean }
  | { tipo: 'sin-mas-preguntas' }
  | { tipo: 'aceptada'; textosRestantes: number }
  | { tipo: 'rechazada' };

export function estadoPregunta(
  conexion: {
    question_state: 'none' | 'pending' | 'postponed' | 'accepted' | 'rejected';
    question_asked_by: string | null;
    question_answered_at: string | null;
    postpone_count: number;
    my_texts_sent: number;
  },
  yo: string,
  ahora: Date,
): EstadoPregunta {
  switch (conexion.question_state) {
    case 'none':
      return { tipo: 'disponible', tuvoAplazamiento: false };
    case 'pending':
      return conexion.question_asked_by === yo
        ? { tipo: 'esperando-respuesta' }
        : { tipo: 'te-toca-responder', ultimoAplazamiento: conexion.postpone_count >= APLAZAMIENTOS_MAX - 1 };
    case 'postponed': {
      if (conexion.postpone_count >= APLAZAMIENTOS_MAX) return { tipo: 'sin-mas-preguntas' };
      const respondida = conexion.question_answered_at ? Date.parse(conexion.question_answered_at) : 0;
      const falta = respondida + PREGUNTA_ESPERA_MS - ahora.getTime();
      if (falta <= 0) return { tipo: 'disponible', tuvoAplazamiento: true };
      return { tipo: 'aplazada', disponibleEnMs: falta, teLoAplazaron: conexion.question_asked_by === yo };
    }
    case 'accepted':
      return { tipo: 'aceptada', textosRestantes: Math.max(0, TEXTOS_POR_PERSONA - conexion.my_texts_sent) };
    case 'rejected':
      return { tipo: 'rechazada' };
  }
}

export type FilaBandeja = {
  question_state: 'none' | 'pending' | 'postponed' | 'accepted' | 'rejected';
  question_asked_by: string | null;
  last_kind: 'gif' | 'buzz' | 'question' | 'answer' | 'text' | null;
  last_sender_id: string | null;
  unread_count: number;
};

/** La otra persona te ha preguntado y te toca responder. */
export function teTocaResponder(fila: FilaBandeja, yo: string): boolean {
  return fila.question_state === 'pending' && fila.question_asked_by !== yo;
}

/** Conversaciones que piden atencion: para el contador de la pestana Chats. */
export function chatsPendientes(filas: readonly FilaBandeja[], yo: string): number {
  return filas.filter((fila) => teTocaResponder(fila, yo) || fila.unread_count > 0).length;
}

/** Una linea bajo el nombre en la lista de chats. */
export function vistaPreviaChat(fila: FilaBandeja, yo: string): string {
  if (teTocaResponder(fila, yo)) return 'Te ha preguntado si os tomáis una cerveza';
  if (fila.question_state === 'pending') return 'Esperando su respuesta a la cerveza';
  const mio = fila.last_sender_id === yo;
  switch (fila.last_kind) {
    case 'text':
      return mio ? 'Tú: un mensaje' : 'Te ha escrito';
    case 'answer':
      if (fila.question_state === 'accepted') return '¡Cerveza aceptada!';
      return mio ? 'Le has pedido que te pregunte luego' : 'Te ha dicho que le preguntes luego';
    case 'question':
      return mio ? 'Le has preguntado por una cerveza' : 'Te ha preguntado por una cerveza';
    default:
      return 'Nueva conexión: ofrécele una caña';
  }
}

const MENSAJES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Tu sesión ha caducado. Vuelve a entrar.',
  NOT_PARTICIPANT: 'No participas en esta ruta.',
  MATCH_NOT_ACTIVE: 'Activa Tírate una caña para ver a la gente de tu ruta.',
  MATCH_PROFILE_MISSING: 'Todavía no te has presentado.',
  ADULT_CONFIRMATION_REQUIRED: 'Confirma que eres mayor de edad para activarlo.',
  BIO_REQUIRED: 'Escribe una frase para presentarte.',
  BIO_TOO_LONG: `La frase no puede pasar de ${BIO_MAX} caracteres.`,
  TOO_MANY_TAGS: `Puedes elegir hasta ${ETIQUETAS_MAX} etiquetas.`,
  TAG_NOT_FOUND: 'Alguna etiqueta ya no existe. Vuelve a elegirlas.',
  INVALID_VOTE: 'Ese voto no es válido.',
  INVALID_TARGET: 'No puedes votarte a ti.',
  TARGET_UNAVAILABLE: 'Esta persona ha pausado Tírate una caña.',
  CONNECTION_NOT_FOUND: 'Esta conversación no existe.',
  CONNECTION_CLOSED: 'Esta conexión se ha cerrado.',
  CONNECTION_UNAVAILABLE: 'La otra persona ha pausado Tírate una caña.',
  BLOCKED: 'Ya no podéis veros: hay un bloqueo entre vosotros.',
  REPORT_ALREADY_PENDING: 'Ya has denunciado a esta persona y lo estamos revisando.',
  INVALID_REASON: 'Elige un motivo de la lista.',
  DETAIL_TOO_LONG: `El detalle no puede pasar de ${DETALLE_MAX} caracteres.`,
  NOT_ADMIN: 'Esto solo lo puede hacer quien organiza la ruta.',
  TEXT_LOCKED: 'Podréis escribir cuando se acepte la cerveza.',
  TEXT_EMPTY: 'Escribe algo antes de enviar.',
  TEXT_TOO_LONG: 'El mensaje no puede pasar de 120 caracteres.',
  TEXT_LIMIT_REACHED: 'Ya has enviado tu mensaje.',
  QUESTION_ALREADY_PENDING: 'Ya hay una pregunta esperando respuesta.',
  QUESTION_ALREADY_ANSWERED: 'La pregunta ya tiene respuesta.',
  QUESTION_TOO_SOON: 'Todavía no puedes volver a preguntar.',
  QUESTION_LIMIT_REACHED: 'Ya no se puede volver a preguntar en esta conexión.',
  NO_PENDING_QUESTION: 'No hay ninguna pregunta que responder.',
  CANNOT_ANSWER_OWN_QUESTION: 'La pregunta la responde la otra persona.',
  INVALID_ANSWER: 'Esa respuesta no es válida.',
};

/**
 * Traduce el error de una funcion match_*. El SQL levanta codigos como
 * 'BUZZ_TOO_SOON' y PostgREST los reenvia en `message`, a veces con prefijos:
 * de ahi la busqueda por inclusion. Lo que no es un codigo pasa tal cual.
 */
export function describirErrorCana(mensaje: string): string {
  const codigo = codigoErrorCana(mensaje);
  return codigo ? MENSAJES[codigo] : mensaje;
}

/** El codigo del SQL que trae un mensaje de error, o null si no trae ninguno. */
export function codigoErrorCana(mensaje: string): string | null {
  return Object.keys(MENSAJES).find((clave) => new RegExp(`\\b${clave}\\b`).test(mensaje)) ?? null;
}

/** Errores tras los que un chat ya no se puede usar: se deja de preguntar y se explica. */
export const CONEXION_PERDIDA: ReadonlySet<string> = new Set([
  'CONNECTION_NOT_FOUND',
  'CONNECTION_CLOSED',
  'CONNECTION_UNAVAILABLE',
  'MATCH_NOT_ACTIVE',
  'NOT_PARTICIPANT',
  // Tras bloquear (o que te bloqueen) el chat deja de existir para los dos.
  'BLOCKED',
]);
