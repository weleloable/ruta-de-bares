/**
 * Anuncios de los admins a la gente de una ruta (PROTOTIPO: aun sin servidor).
 * Reglas puras y con tests: cuanto dura, a quien llega, cuanto cabe y como se
 * cuenta el tiempo.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

/** Lo que cabe en un anuncio. */
export const MAX_CARACTERES = 200;
/** Cuanto puede durar a la vista, a elegir al enviarlo. */
export const DURACIONES_MIN = [5, 15, 60] as const;
export type DuracionMin = (typeof DURACIONES_MIN)[number];
/** La que sale marcada por defecto. */
export const DURACION_POR_DEFECTO: DuracionMin = 15;

export type AnuncioBase = {
  creadoMs: number;
  retirado: boolean;
  duracionMin: number;
  /** true: lo ven solo los admins de la ruta (un aviso interno de la organizacion). */
  soloAdmins: boolean;
};

const MS_MINUTO = 60_000;

const caducaMs = (a: AnuncioBase) => a.creadoMs + a.duracionMin * MS_MINUTO;

/** Un anuncio se ve mientras no lo retiren y no pase su tiempo. */
export function vigente(a: AnuncioBase, ahoraMs: number): boolean {
  return !a.retirado && ahoraMs < caducaMs(a);
}

/** A quien le toca verlo: los de "solo admins" no llegan a los demas. */
export function leCorresponde(a: AnuncioBase, esAdmin: boolean): boolean {
  return !a.soloAdmins || esAdmin;
}

/** Minutos que le quedan (redondeado hacia arriba: "1 min" hasta el ultimo segundo). */
export function minutosRestantes(a: AnuncioBase, ahoraMs: number): number {
  return Math.max(0, Math.ceil((caducaMs(a) - ahoraMs) / MS_MINUTO));
}

/** "5 min", "1 h", "1 h 5 min". */
export function textoDuracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "ahora mismo", "hace 1 min", "hace 7 min". */
export function hace(a: AnuncioBase, ahoraMs: number): string {
  const min = Math.floor((ahoraMs - a.creadoMs) / MS_MINUTO);
  return min < 1 ? 'ahora mismo' : `hace ${min} min`;
}

/** Espacios y saltos de linea sobrantes fuera: un anuncio es una frase, no un parrafo. */
export function limpiarTexto(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

export type ResultadoTexto = { ok: true; texto: string } | { ok: false; motivo: string };

export function validarTexto(crudo: string): ResultadoTexto {
  const texto = limpiarTexto(crudo);
  if (texto.length === 0) return { ok: false, motivo: 'Escribe el mensaje.' };
  if (texto.length > MAX_CARACTERES) return { ok: false, motivo: `Máximo ${MAX_CARACTERES} caracteres.` };
  return { ok: true, texto };
}

/** Solo valen las duraciones de la lista (el servidor tendra el mismo check). */
export function duracionValida(min: number): min is DuracionMin {
  return (DURACIONES_MIN as readonly number[]).includes(min);
}

/** Un anuncio tal y como lo devuelve `anuncios_vigentes` (0074). */
export type FilaVigente = {
  id: string;
  texto: string;
  solo_admins: boolean;
  duracion_min: number;
  hace_s: number;
  restan_s: number;
};

export type Anuncio = AnuncioBase & { id: string; texto: string };

/**
 * El servidor manda cuanto QUEDA (con SU reloj), no una hora: el reloj del
 * movil puede ir adelantado o atrasado y un anuncio de 5 minutos se veria 10 o
 * ninguno. La app apunta cuando recibio la respuesta y cuenta desde ahi, asi
 * que `creadoMs` sale de lo que queda, no de la hora del servidor.
 */
export function anuncioDeFila(f: FilaVigente, recibidoMs: number): Anuncio {
  return {
    id: f.id,
    texto: f.texto,
    soloAdmins: f.solo_admins,
    duracionMin: f.duracion_min,
    retirado: false,
    creadoMs: recibidoMs + f.restan_s * 1000 - f.duracion_min * MS_MINUTO,
  };
}

/** Traduce los codigos que lanza Postgres (0074) a algo que se pueda leer. */
export function traducirErrorAnuncios(mensaje: string): string {
  if (/RATE_LIMIT/.test(mensaje)) return 'Has enviado muchos anuncios a esta ruta en la última hora (máximo 6). Espera un rato.';
  if (/TEXT_INVALID/.test(mensaje)) return `El mensaje debe tener entre 1 y ${MAX_CARACTERES} caracteres.`;
  if (/DURATION_INVALID/.test(mensaje)) return 'Elige 5 minutos, 15 minutos o 1 hora.';
  if (/ROUTE_NOT_FOUND/.test(mensaje)) return 'Esa ruta ya no existe.';
  if (/FORBIDDEN/.test(mensaje)) return 'Solo los admins pueden mandar anuncios.';
  if (/NOT_AUTHENTICATED/.test(mensaje)) return 'Inicia sesión para continuar.';
  // PostgREST cuando la funcion no existe: falta la migracion.
  if (/PGRST202|Could not find the function|schema cache/i.test(mensaje)) {
    return 'Falta aplicar la migración 0074 (anuncios) en Supabase. Mira docs/SETUP.md.';
  }
  return mensaje || 'No se pudo completar.';
}
