import type { Dir } from './modelo';

/** Pixeles que hay que arrastrar el dedo para que cuente como un giro. */
export const UMBRAL_DESLIZAR = 18;

/**
 * Hacia donde apunta un arrastre. Manda el eje en que se ha movido mas; si no
 * llega al umbral (un toque, un temblor) no es un giro.
 */
export function direccionDeGesto(dx: number, dy: number, umbral = UMBRAL_DESLIZAR): Dir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < umbral) return null;
  if (ax > ay) return dx > 0 ? 'derecha' : 'izquierda';
  return dy > 0 ? 'abajo' : 'arriba';
}
