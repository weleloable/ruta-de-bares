import type { LevaduraId, MaltaId } from './datos';

/** Los cuatro microjuegos, en orden. El resultado no cuenta como paso. */
export const PASOS = ['malta', 'maceracion', 'lupulo', 'fermentacion'] as const;
export type PasoJuego = (typeof PASOS)[number];
export type Paso = PasoJuego | 'resultado';

/** Lo que salio del hervido: cuanto se acerco el toque a cada momento, de 0 a 1. */
export type ResultadoLupulo = {
  amargor: number;
  aroma: number;
};

/**
 * Lo que el jugador ha ido decidiendo o consiguiendo. `null` = todavia no se ha
 * jugado ese paso. `maceracion` es la precision (0..1, tiempo en la zona verde).
 */
export type Receta = {
  malta: MaltaId | null;
  maceracion: number | null;
  lupulo: ResultadoLupulo | null;
  levadura: LevaduraId | null;
};

export type RecetaCompleta = {
  malta: MaltaId;
  maceracion: number;
  lupulo: ResultadoLupulo;
  levadura: LevaduraId;
};

export const RECETA_VACIA: Receta = { malta: null, maceracion: null, lupulo: null, levadura: null };

/** La receta con todo relleno, o null si aun falta algo (no se puede calcular la cerveza). */
export function recetaCompleta(r: Receta): RecetaCompleta | null {
  if (r.malta === null || r.maceracion === null || r.lupulo === null || r.levadura === null) return null;
  return { malta: r.malta, maceracion: r.maceracion, lupulo: r.lupulo, levadura: r.levadura };
}

/** Solo se puede avanzar cuando el paso tiene lo que necesita. */
export function puedeAvanzar(paso: Paso, receta: Receta): boolean {
  if (paso === 'malta') return receta.malta !== null;
  if (paso === 'maceracion') return receta.maceracion !== null;
  if (paso === 'lupulo') return receta.lupulo !== null;
  if (paso === 'fermentacion') return receta.levadura !== null;
  return true;
}

export function siguiente(paso: Paso): Paso {
  if (paso === 'resultado') return 'resultado';
  const i = PASOS.indexOf(paso);
  return i === PASOS.length - 1 ? 'resultado' : PASOS[i + 1];
}

export function anterior(paso: Paso): Paso | null {
  if (paso === 'resultado') return PASOS[PASOS.length - 1];
  const i = PASOS.indexOf(paso);
  return i <= 0 ? null : PASOS[i - 1];
}

/** 1..4 para los microjuegos, null en el resultado. */
export function numeroPaso(paso: Paso): number | null {
  return paso === 'resultado' ? null : PASOS.indexOf(paso) + 1;
}
