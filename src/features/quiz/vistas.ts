/** Clave del almacen local con los ids de preguntas ya vistas. Versionada por si cambia la forma. */
export const CLAVE_VISTAS = 'quiz.vistas.v1';

/**
 * Lee lo guardado sin fiarse: el almacen puede estar corrupto o venir de una
 * version anterior. Se descartan ids que ya no existen en el banco, para que
 * un banco renovado no arrastre basura ni deje un nivel "agotado" por error.
 */
export function leerVistas(crudo: string | null, idsValidos: ReadonlySet<string>): string[] {
  if (!crudo) return [];
  try {
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    return [...new Set(datos.filter((x): x is string => typeof x === 'string' && idsValidos.has(x)))];
  } catch {
    return [];
  }
}
