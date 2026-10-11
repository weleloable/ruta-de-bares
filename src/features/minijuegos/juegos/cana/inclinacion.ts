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
 * Se devuelve el VALOR ABSOLUTO (cuanto, no hacia donde): es lo que mira el
 * modelo de la espuma. El signo de `x` por si solo cambia entre iOS, Android y
 * navegador, y esta funcion lo evita; para DIBUJAR el vaso hacia el lado
 * correcto esta `inclinacionConSigno`, que si lo saca (con el producto x * y).
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

/**
 * Lo mismo que `anguloDesdeAcelerometro` pero CON SIGNO: positivo = el movil
 * inclinado hacia la DERECHA (el borde derecho baja, sentido de las agujas del
 * reloj), negativo = hacia la izquierda.
 *
 * El signo de `x` por si solo no vale: iOS y Android lo miden al reves (y `y`
 * tambien, en vertical: iOS da -g y Android +g). Pero se invierten LOS DOS A LA
 * VEZ, asi que el signo de su PRODUCTO no depende de la plataforma:
 *   Android, inclinado a la derecha: x < 0, y > 0  ->  x * y < 0
 *   iOS,     inclinado a la derecha: x > 0, y < 0  ->  x * y < 0
 * (a la izquierda, positivo en ambos). Solo vale con el movil en vertical, que
 * es como se juega; con el movil tumbado `anguloDesdeAcelerometro` ya da 0.
 */
export function inclinacionConSigno(x: number, y: number, z: number): number | null {
  const grados = anguloDesdeAcelerometro(x, y, z);
  if (grados === null) return null;
  // `0 - grados` y no `-grados`: con 0 daria -0, que se pinta igual pero no es igual a 0.
  return x * y < 0 ? grados : 0 - grados;
}

/** Tope de la inclinacion con signo: el mismo que el sin signo, a cada lado. */
export function limitarGiro(grados: number): number {
  return Math.min(Math.max(grados, -ANGULO_MAX), ANGULO_MAX);
}

/**
 * Acerca `actual` a `objetivo` segun el TIEMPO que ha pasado, no segun cuantas
 * lecturas llegaron. `tau` es la constante de tiempo (s): tras `tau` se ha
 * recorrido el 63 % del camino. Es un filtro paso bajo exponencial, y tiene dos
 * propiedades que hacen falta aqui:
 *  - da igual como se parta el tiempo: dos pasos de 8 ms == uno de 16 ms, asi que
 *    el movimiento es el mismo con un sensor a 20 Hz que a 60, y a 30 fps que a 120;
 *  - nunca se pasa del objetivo (no hay rebote).
 * El filtro anterior se aplicaba en cada lectura del sensor (`suavizar`, k fija):
 * con 20 lecturas por segundo el vaso avanzaba a saltos de 50 ms.
 */
export function suavizarEnTiempo(actual: number, objetivo: number, dt: number, tau: number): number {
  if (!(dt > 0)) return actual;
  if (!(tau > 0)) return objetivo;
  return actual + (objetivo - actual) * (1 - Math.exp(-dt / tau));
}

/** Constante de tiempo del giro del vaso (s): lo bastante lenta para quitar el temblor, lo bastante rapida para seguir la mano. */
export const TAU_GIRO = 0.12;
