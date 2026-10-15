/**
 * Como se escribe, se redondea y se envia la nota de cada juego. Un solo sitio
 * para que ninguna pantalla decida por su cuenta cuantos decimales lleva.
 *
 * La Caña Perfecta puntua con DOS decimales (99,03): con enteros, un jugador
 * bueno empataba una y otra vez en el mismo 99. El resto de los juegos siguen
 * en enteros. Sin importaciones: los tests lo cargan tal cual.
 */

/** Juegos cuya nota lleva decimales. Tiene que coincidir con la 0069 (numeric(7,2)). */
export const JUEGOS_CON_DECIMALES: ReadonlySet<string> = new Set(['cana-perfecta']);

/** Lo que se guarda y se envia: 2 decimales en La Caña Perfecta, entero en los demas. */
export function redondearNota(juego: string, nota: number): number {
  return JUEGOS_CON_DECIMALES.has(juego) ? Math.round(nota * 100) / 100 : Math.round(nota);
}

/** Lo que se ve en pantalla: "99,03" (coma decimal, siempre dos cifras) o "1250". */
export function formatearNota(juego: string, nota: number): string {
  if (!Number.isFinite(nota)) return '0';
  const valor = redondearNota(juego, nota);
  return JUEGOS_CON_DECIMALES.has(juego) ? valor.toFixed(2).replace('.', ',') : String(valor);
}
