/** Inclinacion maxima que se ofrece (grados): mas alla el vaso ya se vaciaria. */
export const ANGULO_MAX = 60;

/**
 * Inclinacion lateral del movil en vertical, en grados, a partir de la
 * gravedad que mide el acelerometro (en g). Con el movil recto la gravedad cae
 * toda sobre el eje `y`; al inclinarlo de lado se reparte con `x`.
 *
 * Se devuelve el VALOR ABSOLUTO a proposito: el signo de `x` cambia entre iOS,
 * Android y navegador, y al modelo le da igual hacia que lado se incline. Por
 * eso el vaso siempre se dibuja inclinado hacia el mismo lado. `z` no se usa:
 * con el movil tumbado (`x` e `y` casi 0) sale 0 y no se inventa un angulo.
 * Devuelve null si el sensor da algo que no es un numero (escritorio).
 */
export function anguloDesdeAcelerometro(x: number, y: number, z: number): number | null {
  if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const grados = (Math.atan2(Math.abs(x), Math.abs(y)) * 180) / Math.PI;
  return Math.min(grados, 90);
}

/**
 * Filtro paso bajo: el acelerometro tiembla y un vaso que vibra se ve mal y
 * hace saltar la espuma. `k` = cuanto se fia de la lectura nueva (0..1).
 */
export function suavizar(anterior: number, nuevo: number, k = 0.3): number {
  return anterior + (nuevo - anterior) * k;
}

export function limitarAngulo(grados: number): number {
  return Math.min(Math.max(grados, 0), ANGULO_MAX);
}
