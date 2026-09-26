import type { LevaduraId, MaltaId } from './datos';

/** Los cuatro microjuegos, en orden. El resultado no cuenta como paso. */
export const PASOS = ['malta', 'maceracion', 'lupulo', 'fermentacion'] as const;
export type PasoJuego = (typeof PASOS)[number];
export type Paso = PasoJuego | 'resultado';

/** Lo que el jugador ha ido decidiendo. Los microjuegos de precision se anaden en la fase 2. */
export type Receta = {
  malta: MaltaId | null;
  levadura: LevaduraId | null;
};

export const RECETA_VACIA: Receta = { malta: null, levadura: null };

/** Solo se puede avanzar cuando el paso tiene lo que necesita. */
export function puedeAvanzar(paso: Paso, receta: Receta): boolean {
  if (paso === 'malta') return receta.malta !== null;
  if (paso === 'fermentacion') return receta.levadura !== null;
  // Maceracion y lupulo son de habilidad: se pueden pasar con la nota que salga.
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
