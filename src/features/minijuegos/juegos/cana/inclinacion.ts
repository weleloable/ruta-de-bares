/** Inclinacion maxima que se ofrece (grados): mas alla el vaso ya se vaciaria. */
export const ANGULO_MAX = 60;

/** De donde sale el angulo: aun no se ha empezado, del sensor o del deslizador. */
export type ModoInclinacion = 'inicio' | 'sensor' | 'manual';

/**
 * Por que se esta con el deslizador y no con el sensor. Se dice en pantalla:
 * sin explicacion, "no usa el giroscopio" parece un fallo del juego.
 */
export type MotivoManual = 'elegido' | 'https' | 'permiso' | 'sin-sensor';

/** La frase que se ensena bajo el deslizador, o null si no hace falta explicar nada. */
export function textoMotivo(motivo: MotivoManual | null): string | null {
  if (motivo === 'https') return 'El navegador solo deja usar el sensor en la web segura (https).';
  if (motivo === 'permiso') return 'Sin permiso de movimiento: inclina con el deslizador.';
  if (motivo === 'sin-sensor') return 'Este dispositivo no da la inclinación: usa el deslizador.';
  return null;
}

/**
 * Inclinacion lateral del movil en vertical, en grados, a partir de la
 * gravedad que mide el acelerometro (en g). Con el movil recto la gravedad cae
 * toda sobre el eje `y`; al inclinarlo de lado se reparte con `x`.
 *
 * Se devuelve el VALOR ABSOLUTO a proposito: el signo de `x` cambia entre iOS,
 * Android y navegador, y al modelo le da igual hacia que lado se incline. Por
 * eso el vaso siempre se dibuja inclinado hacia el mismo lado.
 *
 * Con el movil casi TUMBADO (la gravedad cae sobre `z`), `x` e `y` son ruido y
 * el atan2 de dos ruidos salta de 0 a 90 grados: el vaso temblaria entero. Si
 * la parte de la gravedad en la pantalla es menos de TUMBADO de la que cae en
 * `z`, se da 0 (vaso recto) en vez de inventar un angulo.
 * Devuelve null si el sensor da algo que no es un numero (escritorio).
 */
export function anguloDesdeAcelerometro(x: number, y: number, z: number): number | null {
  if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (Math.hypot(x, y) < TUMBADO * Math.abs(z)) return 0;
  const grados = (Math.atan2(Math.abs(x), Math.abs(y)) * 180) / Math.PI;
  return Math.min(grados, 90);
}

/** Por debajo de esta proporcion (gravedad en la pantalla / gravedad en `z`), el movil esta tumbado. */
export const TUMBADO = 0.35;

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
