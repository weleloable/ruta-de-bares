/**
 * Segundos que han pasado entre dos fotogramas, para los bucles de los
 * minijuegos. Dos limites, y los dos han hecho falta:
 *
 *  - por ARRIBA (`max`): si la pestana se queda en segundo plano o el movil se
 *    atasca, el siguiente fotograma llega tarde; sin tope, el juego daria un
 *    salto de varios segundos de golpe (la aguja atravesaria la zona);
 *  - por ABAJO (0): `Date.now()` no es monotono. Si el reloj del sistema se
 *    ajusta hacia atras, la resta sale negativa y el juego correria al reves
 *    (la cuenta atras subiendo, la temperatura saltando al limite).
 */
export function pasoDeTiempo(ahoraMs: number, ultimoMs: number, maxSegundos: number): number {
  const segundos = (ahoraMs - ultimoMs) / 1000;
  if (!Number.isFinite(segundos) || segundos <= 0) return 0;
  return Math.min(segundos, maxSegundos);
}
