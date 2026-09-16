/**
 * Reglas de "Tirate una cana". Espejo de supabase/migrations/0003_tirate_una_cana.sql.
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
 */
export type EstadoTarjeta = 'nuevo' | 'me-gusta' | 'no-me-gusta' | 'conexion';

export function estadoTarjeta(tarjeta: {
  my_vote: 'like' | 'dislike' | null;
  connection_id: string | null;
}): EstadoTarjeta {
  if (tarjeta.connection_id !== null) return 'conexion';
  if (tarjeta.my_vote === 'like') return 'me-gusta';
  if (tarjeta.my_vote === 'dislike') return 'no-me-gusta';
  return 'nuevo';
}

export type Filtro = 'todos' | 'me-gusta' | 'no-me-gusta' | 'conexiones' | 'nuevos';

/** En el orden en que se ensenan. */
export const FILTROS: readonly { id: Filtro; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'me-gusta', etiqueta: 'Me gusta' },
  { id: 'no-me-gusta', etiqueta: 'No me gusta' },
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
    case 'no-me-gusta':
      return estado === 'no-me-gusta';
    case 'conexiones':
      return estado === 'conexion';
    case 'nuevos':
      return estado === 'nuevo';
  }
}

export function contarPorFiltro(estados: readonly EstadoTarjeta[]): Record<Filtro, number> {
  const cuenta = { todos: 0, 'me-gusta': 0, 'no-me-gusta': 0, conexiones: 0, nuevos: 0 };
  for (const estado of estados) {
    for (const { id } of FILTROS) if (pasaFiltro(id, estado)) cuenta[id] += 1;
  }
  return cuenta;
}

/**
 * Cambiar a No me gusta a alguien con quien hay conexion la cierra y borra el
 * chat: es lo unico irreversible de votar, y lo unico que se confirma.
 */
export function votoRompeConexion(estado: EstadoTarjeta, voto: 'like' | 'dislike'): boolean {
  return estado === 'conexion' && voto === 'dislike';
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
  GIF_NOT_FOUND: 'Ese GIF ya no está disponible.',
  BUZZ_TOO_SOON: 'Espera un poco antes de otro zumbido.',
  TEXT_LOCKED: 'Podréis escribir cuando se acepte la cerveza.',
  TEXT_EMPTY: 'Escribe algo antes de enviar.',
  TEXT_TOO_LONG: 'El mensaje no puede pasar de 120 caracteres.',
  TEXT_LIMIT_REACHED: 'Ya has enviado tus dos mensajes.',
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
  const codigo = Object.keys(MENSAJES).find((clave) => new RegExp(`\\b${clave}\\b`).test(mensaje));
  return codigo ? MENSAJES[codigo] : mensaje;
}
