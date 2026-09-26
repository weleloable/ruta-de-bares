/** Largo maximo del nombre de la cerveza. */
export const NOMBRE_MAX = 30;

/** Sitios y nombres de Alcala de Henares que dan juego para bautizar una cerveza. */
const LUGARES = ['Cervantes', 'Cisneros', 'la Magistral', 'las Cigüeñas', 'la Calle Mayor', 'la Puerta de Madrid'] as const;

/**
 * Todos los nombres posibles para este estilo y jugador que caben en el limite.
 * Mezclan el estilo con una referencia de Alcala y, si hay nombre de jugador,
 * con el suyo: "IPA Complutense", "Stout de Cervantes", "Rubia de Gonzalo".
 */
export function candidatos(estilo: string, jugador: string): string[] {
  const j = jugador.trim();
  const todos = [
    `${estilo} Complutense`,
    ...LUGARES.map((lugar) => `${estilo} de ${lugar}`),
    ...(j ? [`${estilo} de ${j}`, `${estilo} Complutense de ${j}`] : []),
  ];
  return todos.filter((n) => n.length <= NOMBRE_MAX);
}

/**
 * Propone un nombre. `aleatorio` (0..1) se pasa de fuera para poder probarlo, y
 * `evitar` es la sugerencia anterior: el boton "Otra sugerencia" nunca debe
 * devolver la misma (salvo que no haya mas opciones).
 */
export function sugerirNombre(estilo: string, jugador: string, aleatorio: () => number, evitar?: string): string {
  const todos = candidatos(estilo, jugador);
  // El estilo solo ya cabe siempre (el mas largo tiene 11 caracteres).
  if (todos.length === 0) return estilo.slice(0, NOMBRE_MAX);
  const distintos = todos.filter((n) => n !== evitar);
  const lista = distintos.length > 0 ? distintos : todos;
  return lista[Math.min(Math.floor(aleatorio() * lista.length), lista.length - 1)];
}

/**
 * El nombre que se guarda y se comparte: lo que hay en el campo, recortado, o la
 * ultima sugerencia automatica si el campo esta vacio.
 */
export function nombreFinal(campo: string, sugerencia: string): string {
  const limpio = campo.trim().slice(0, NOMBRE_MAX).trim();
  return limpio.length > 0 ? limpio : sugerencia;
}
