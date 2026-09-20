import type { AdminMessageRow, MensajeKind, MensajeStatus, MiMensajeRow } from '../../types/database';

/**
 * Reglas puras del canal de contacto y reclamacion (0026).
 *
 * Por que existe este canal, en corto: cada aviso de sancion decia "habla con
 * quien organiza la ruta" y no habia ningun sitio donde hacerlo. El art. 12 del
 * DSA pide un punto de contacto siempre disponible, y el art. 20 que quien fue
 * sancionado pueda reclamar la decision durante seis meses.
 *
 * Lo que NO cubre, y hay que recordarlo al escribir la politica: el art. 16
 * exige poder avisar de contenido ilicito TENGA O NO cuenta quien avisa, y eso
 * desde dentro de la app es imposible. Lo cubre el correo publicado.
 *
 * Nada de esto es autoridad: quien decide es `send_admin_message` y
 * `match_admin_require()` en Postgres.
 */

export const CUERPO_MAX = 2000;
/** El mismo tope que las fotos (0020): texto libre hacia los admins es spam facil. */
export const MENSAJES_POR_DIA = 5;

/** Un mensaje vale si dice algo y cabe. */
export function cuerpoValido(texto: string): boolean {
  const limpio = texto.trim();
  return limpio.length >= 1 && limpio.length <= CUERPO_MAX;
}

const TITULO: Record<MensajeKind, string> = {
  contacto: 'Mensaje a la organización',
  reclamacion: 'Reclamación de una decisión',
};

export function tituloMensaje(kind: MensajeKind): string {
  return TITULO[kind] ?? TITULO.contacto;
}

const ESTADO: Record<MensajeStatus, string> = {
  pendiente: 'Sin leer',
  en_revision: 'La están mirando',
  resuelta: 'Respondida',
};

export function estadoMensaje(status: MensajeStatus): string {
  return ESTADO[status] ?? '';
}

/**
 * Lo que se le dice a quien escribio, bajo su mensaje. Una reclamacion sin
 * respuesta tiene que decir que sigue viva: si no, parece que se perdio.
 */
export function pieDeMiMensaje(fila: Pick<MiMensajeRow, 'status' | 'answer'>): string {
  if (fila.status === 'resuelta') return fila.answer || 'Respondida.';
  if (fila.status === 'en_revision') return 'La organización la está revisando.';
  return 'Todavía no la han leído.';
}

/** Los errores del servidor, en lenguaje de persona. */
export function traducirErrorMensaje(mensaje: string): string {
  if (/TOO_MANY_MESSAGES/.test(mensaje)) {
    return `Has enviado ${MENSAJES_POR_DIA} mensajes hoy. Prueba mañana, o espera a que respondan.`;
  }
  if (/BODY_REQUIRED/.test(mensaje)) return 'Escribe algo antes de enviar.';
  if (/BODY_TOO_LONG/.test(mensaje)) return `El mensaje no puede pasar de ${CUERPO_MAX} caracteres.`;
  if (/NOTICE_NOT_FOUND/.test(mensaje)) return 'No encuentro esa decisión entre las tuyas.';
  if (/NOT_AUTHENTICATED/.test(mensaje)) return 'Tu sesion ha caducado. Vuelve a entrar y prueba otra vez.';
  if (/send_admin_message/.test(mensaje) && /(could not find|does not exist)/i.test(mensaje)) {
    return 'Escribir a la organización aún no está disponible: falta aplicar la migracion 0026 en Supabase.';
  }
  return mensaje;
}

/**
 * ¿Hay que avisar a quien mira el ticket de que la decision la tomo el mismo?
 *
 * El art. 20.6 del DSA pide que una reclamacion se revise con criterio, no de
 * forma automatica. Con dos admins, lo limpio es que la mire el otro. Con uno
 * solo no hay alternativa posible, asi que no se bloquea: se avisa, que es lo
 * unico honesto que se puede hacer.
 */
export function avisoDeConflicto(fila: Pick<AdminMessageRow, 'kind' | 'decidido_por_mi'>): string | null {
  if (fila.kind !== 'reclamacion' || !fila.decidido_por_mi) return null;
  return 'Esta decisión la tomaste tú. Si hay otra persona administradora, mejor que la revise ella.';
}
