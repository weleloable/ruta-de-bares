/**
 * Como se escribe, se redondea y se envia la nota de cada juego. Un solo sitio
 * para que ninguna pantalla decida por su cuenta cuantos decimales lleva.
 *
 * La Caña Perfecta puntua con DOS decimales (99,03): con enteros, un jugador
 * bueno empataba una y otra vez en el mismo 99. Parejas de Barra puntua con su
 * TIEMPO en segundos, tambien con dos decimales. El resto, en enteros.
 *
 * Y aqui vive tambien el SENTIDO de la nota (`JUEGOS_MENOS_ES_MEJOR`): en casi
 * todos los juegos mas es mejor, en Parejas de Barra gana quien MENOS tarda.
 * Es lo primero que se rompe al anadir un juego: un sitio que compare notas por
 * su cuenta hace que gane quien mas tarda, sin dar error. Toda comparacion pasa
 * por `esMejorNota`. En SQL, el espejo es `minijuego_menos_es_mejor()` (0070).
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

/** Juegos cuya nota lleva decimales. Tiene que coincidir con el check de best_score (0069, 0070). */
export const JUEGOS_CON_DECIMALES: ReadonlySet<string> = new Set(['cana-perfecta', 'parejas-de-barra']);

/**
 * Juegos en los que MENOS es mejor (la nota es un tiempo). El UNICO sitio del
 * cliente que lo dice; tiene que coincidir con `minijuego_menos_es_mejor()` (0070).
 */
export const JUEGOS_MENOS_ES_MEJOR: ReadonlySet<string> = new Set(['parejas-de-barra']);

/** Si `nueva` mejora a `anterior` en ese juego. Sin anterior, siempre. Empatar no es mejorar. */
export function esMejorNota(juego: string, nueva: number, anterior: number | undefined): boolean {
  if (anterior === undefined) return true;
  return JUEGOS_MENOS_ES_MEJOR.has(juego) ? nueva < anterior : nueva > anterior;
}

/** Lo que se guarda y se envia: 2 decimales en los de JUEGOS_CON_DECIMALES, entero en los demas. */
export function redondearNota(juego: string, nota: number): number {
  return JUEGOS_CON_DECIMALES.has(juego) ? Math.round(nota * 100) / 100 : Math.round(nota);
}

/** Lo que se ve en pantalla: "99,03" (coma decimal, siempre dos cifras), "1250" o, si es un tiempo, "23,47 s". */
export function formatearNota(juego: string, nota: number): string {
  if (!Number.isFinite(nota)) return '0';
  const valor = redondearNota(juego, nota);
  const texto = JUEGOS_CON_DECIMALES.has(juego) ? valor.toFixed(2).replace('.', ',') : String(valor);
  return JUEGOS_MENOS_ES_MEJOR.has(juego) ? `${texto} s` : texto;
}
