/**
 * Los textos de "¿Conduces tú?": el nombre de cada nivel y el mensaje del
 * final. Con humor, pero el cierre es siempre el mismo y va en serio.
 */

/** El mensaje que cierra SIEMPRE la partida. */
export const MENSAJE_SEGURIDAD = 'En la vida real, ni una caña: pilla un taxi o que conduzca quien no beba.';

export function nombreNivel(nivel: number): string {
  return nivel === 1 ? '1 caña' : `${nivel} cañas`;
}

/** Una frase corta para el selector: lo que se siente con ese nivel. */
export function comoVas(nivel: number, maximo: number): string {
  const n = maximo <= 1 ? 0 : (nivel - 1) / (maximo - 1);
  if (n <= 0.15) return 'Casi ni se nota… casi.';
  if (n <= 0.4) return 'Ya vas contento.';
  if (n <= 0.7) return 'El volante tiene vida propia.';
  if (n < 1) return 'Ves dos calles y eliges la mala.';
  return 'Imposible. Literalmente.';
}

/**
 * La frase del resultado segun lo borracho que ibas y lo lejos que llegaste.
 * `metros` es la distancia de la partida.
 */
export function mensajeFinal(nivel: number, maximo: number, metros: number): string {
  const n = maximo <= 1 ? 0 : (nivel - 1) / (maximo - 1);
  const corto = metros < 300;
  if (n >= 0.7) return corto ? 'Has durado menos que la primera ronda.' : 'Has llegado lejos… de milagro. Mañana no te acuerdas.';
  if (n >= 0.35) return corto ? 'El coche se ha enterado antes que tú.' : '"Yo controlo", dijiste. Las farolas opinan distinto.';
  return corto ? 'Ni con poco: los reflejos ya no son los mismos.' : 'Sobrio parecía más fácil, ¿eh?';
}

/** "1.234 m", con el punto de miles de aquí. */
export function metrosTexto(metros: number): string {
  return `${Math.round(metros).toLocaleString('es-ES')} m`;
}
