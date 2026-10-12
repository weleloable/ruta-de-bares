/**
 * Tipo de parada (0060): 'bar' (se sella), 'foto' (parada para una foto de
 * grupo) u 'otra' (parada sin sello). Salen todas en el mapa con su horario;
 * solo los bares cuentan para sellos, la credencial y las estadisticas.
 *
 * Sin importaciones de ejecucion: los tests lo cargan tal cual.
 */

export type TipoParada = 'bar' | 'foto' | 'otra';

export const TIPOS_PARADA: readonly { id: TipoParada; nombre: string; icono: string; ayuda: string }[] = [
  { id: 'bar', nombre: 'Bar', icono: '🍺', ayuda: 'Se sella y cuenta para la credencial, los puntos y las estadísticas.' },
  {
    id: 'foto',
    nombre: 'Parada de foto',
    icono: '📷',
    ayuda: 'Sale en el mapa con su horario, pero no se sella: que la gente se centre en la foto.',
  },
  { id: 'otra', nombre: 'Otra parada', icono: '📍', ayuda: 'Sale en el mapa con su horario, pero no se sella.' },
];

type ConTipo = { tipo?: string | null };

export function esTipoParada(v: unknown): v is TipoParada {
  return v === 'bar' || v === 'foto' || v === 'otra';
}

/** El tipo de una parada; las que no lo traen (rutas de antes) son bares. */
export function tipoDe(parada: ConTipo): TipoParada {
  return esTipoParada(parada.tipo) ? parada.tipo : 'bar';
}

/** Solo los bares se sellan. */
export function esSellable(parada: ConTipo): boolean {
  return tipoDe(parada) === 'bar';
}

/** Las paradas que se sellan, en su orden. */
export function sellables<T extends ConTipo>(paradas: readonly T[]): T[] {
  return paradas.filter(esSellable);
}

export function infoTipo(tipo: TipoParada) {
  return TIPOS_PARADA.find((t) => t.id === tipo) ?? TIPOS_PARADA[0]!;
}

/**
 * El numero de un bar entre los bares (1, 2, 3...), que es el que ve en Sellos;
 * null si la parada no es un bar. Asi el mapa y la credencial numeran igual
 * aunque haya paradas de foto por medio.
 */
export function numeroDeBar<T extends ConTipo & { id: string }>(paradas: readonly T[], id: string): number | null {
  const bares = sellables(paradas);
  const i = bares.findIndex((p) => p.id === id);
  return i >= 0 ? i + 1 : null;
}

/** "Parada 3", "Parada de foto"... para la tarjeta del mapa. */
export function rotuloParada<T extends ConTipo & { id: string }>(paradas: readonly T[], parada: T): string {
  const numero = numeroDeBar(paradas, parada.id);
  if (numero !== null) return `Parada ${numero}`;
  const t = infoTipo(tipoDe(parada));
  return `${t.icono} ${t.nombre}`;
}
