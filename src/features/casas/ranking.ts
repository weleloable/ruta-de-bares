import type { IdCasa } from './casas';

/**
 * El ranking de las casas en una ruta, listo para pintar: puestos (los empates
 * comparten puesto), barra de progreso respecto al lider y cuanto le falta a
 * cada una. Sin importaciones salvo tipos.
 */

export type FilaServidor = { house: IdCasa; puntos: number; miembros: number };

export type FilaRanking = FilaServidor & {
  puesto: number;
  /** 0..1: sus puntos respecto a los del lider. */
  progreso: number;
  /** Puntos que le faltan para alcanzar al lider (0 si es lider). */
  aLider: number;
  /** Puntos que saca a la siguiente (0 si es la ultima o empata). */
  sobreSiguiente: number;
  lider: boolean;
};

/** Orden fijo para desempatar la pintura (no el puesto: los empates comparten). */
const ORDEN: IdCasa[] = ['mahou', 'cruzcampo', 'estrella', 'alhambra'];

export function ordenarRanking(filas: readonly FilaServidor[]): FilaRanking[] {
  const ordenadas = [...filas].sort((a, b) => b.puntos - a.puntos || ORDEN.indexOf(a.house) - ORDEN.indexOf(b.house));
  const maximo = ordenadas[0]?.puntos ?? 0;
  return ordenadas.map((f, i) => {
    const puesto = 1 + ordenadas.filter((o) => o.puntos > f.puntos).length;
    const siguiente = ordenadas[i + 1];
    return {
      ...f,
      puesto,
      progreso: maximo > 0 ? Math.max(0, f.puntos) / maximo : 0,
      aLider: Math.max(0, maximo - f.puntos),
      sobreSiguiente: siguiente ? Math.max(0, f.puntos - siguiente.puntos) : 0,
      // Lider solo si va por delante de verdad (con todo a 0 no hay lider).
      lider: puesto === 1 && maximo > 0 && ordenadas.filter((o) => o.puntos === maximo).length === 1,
    };
  });
}

/** Quien lidera en solitario, o null (nadie con puntos, o empate arriba). */
export function lider(filas: readonly FilaRanking[]): IdCasa | null {
  return filas.find((f) => f.lider)?.house ?? null;
}

/** Cuanto ha subido cada casa entre dos lecturas (solo subidas). */
export function subidas(antes: readonly FilaServidor[], ahora: readonly FilaServidor[]): Partial<Record<IdCasa, number>> {
  const previos = new Map(antes.map((f) => [f.house, f.puntos]));
  const r: Partial<Record<IdCasa, number>> = {};
  for (const f of ahora) {
    const d = f.puntos - (previos.get(f.house) ?? f.puntos);
    if (d > 0) r[f.house] = d;
  }
  return r;
}
