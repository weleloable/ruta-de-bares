/**
 * Los gestos de Don Quijote Cervecero, puros y con tests: UN DESLIZAMIENTO, UNA
 * ACCION.
 *
 * Antes, cada 20 px que recorria el dedo contaba como un gesto nuevo (un
 * arrastre largo cambiaba dos o tres carriles) y ademas un toque suelto movia un
 * carril segun el lado de la pantalla. Dos formas de mover, y una de ellas
 * impredecible: confundia. Ahora:
 *
 *  - el dedo baja y empieza a medir;
 *  - en cuanto recorre el umbral hacia un lado, ESA es la accion (izquierda o
 *    derecha: un carril; arriba: saltar; abajo: agacharse). Se dispara en el
 *    acto, sin esperar a que se levante el dedo;
 *  - el resto de ese arrastre no cuenta: hay que levantar el dedo y volver a
 *    deslizar para otra accion;
 *  - un golpe tan rapido que se suelta antes del umbral vale con un umbral menor;
 *  - un toque sin arrastrar no hace nada.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

export type DireccionGesto = 'izquierda' | 'derecha' | 'arriba' | 'abajo';

/** Pixeles de arrastre para que cuente como deslizamiento; al soltar, basta con algo menos (un golpe rapido). */
export const UMBRAL = 20;
export const UMBRAL_SOLTAR = 12;

export type Gesto = {
  /** Donde bajo el dedo. */
  x0: number;
  y0: number;
  /** Ya ha dado su accion: lo que quede de arrastre se ignora. */
  usado: boolean;
};

/** Hacia donde apunta un desplazamiento: manda el eje en que se ha movido mas. null si no llega al umbral. */
export function direccion(dx: number, dy: number, umbral: number): DireccionGesto | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < umbral) return null;
  if (ax > ay) return dx > 0 ? 'derecha' : 'izquierda';
  return dy > 0 ? 'abajo' : 'arriba';
}

export function empezarGesto(x: number, y: number): Gesto {
  return { x0: x, y0: y, usado: false };
}

/** El dedo se mueve. Devuelve la accion si este movimiento completa el deslizamiento (una sola vez por gesto). */
export function moverGesto(g: Gesto, x: number, y: number): DireccionGesto | null {
  if (g.usado) return null;
  const dir = direccion(x - g.x0, y - g.y0, UMBRAL);
  if (dir) g.usado = true;
  return dir;
}

/** El dedo se levanta. Si aun no habia dado accion, un golpe rapido puede valer con menos recorrido. */
export function soltarGesto(g: Gesto, x: number, y: number): DireccionGesto | null {
  if (g.usado) return null;
  const dir = direccion(x - g.x0, y - g.y0, UMBRAL_SOLTAR);
  if (dir) g.usado = true;
  return dir;
}
