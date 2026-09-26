import { Vibration } from 'react-native';

/**
 * Vibracion ligera. En web solo funciona en Android (iPhone no la expone), y
 * ahi no pasa nada: el juego no puede depender de ella para entenderse.
 * El sonido queda para mas adelante: hoy no hay libreria de audio instalada.
 */
function vibrar(patron: number | number[]): void {
  try {
    Vibration.vibrate(patron);
  } catch {
    // Sin vibrador o sin permiso: es solo un extra.
  }
}

export const feedback = {
  toque: () => vibrar(15),
  acierto: () => vibrar(35),
  fallo: () => vibrar([0, 60, 40, 60]),
  record: () => vibrar([0, 40, 60, 40, 60, 90]),
};
