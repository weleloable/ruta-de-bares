import type { ConfigQuiz } from './tipos';

/** Todo lo que se puede ajustar del juego, en un solo sitio. */
export const CONFIG: ConfigQuiz = {
  segundos: 30,
  suspenseMs: 1600,
  // Nivel 1 a 5: el publico acierta casi siempre al principio y casi a cara o cruz al final.
  probVotoCorrecta: [0.9, 0.8, 0.7, 0.62, 0.55],
};

export const NOMBRE_NIVEL = ['Caña', 'Doble', 'Jarra', 'Barril', 'Maestro cervecero'] as const;

export const ID_JUEGO = 'quien-quiere-ser-cervecero';
