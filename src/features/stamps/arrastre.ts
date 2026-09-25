/**
 * Cuando un arrastre hacia abajo de la ficha del bar la cierra.
 * Sin react-native, para probarlo en Node.
 */

/** Distancia (px) a partir de la cual soltar cierra aunque el gesto sea lento. */
export const DISTANCIA_CIERRE = 90;
/** Velocidad (px/ms) a partir de la cual un gesto corto tambien cierra (un "flick"). */
export const VELOCIDAD_CIERRE = 0.7;

export function debeCerrarAlSoltar(dy: number, vy: number): boolean {
  if (dy <= 0) return false;
  return dy >= DISTANCIA_CIERRE || vy >= VELOCIDAD_CIERRE;
}
