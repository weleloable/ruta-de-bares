import type { MaltaId } from './datos';
import type { RecetaCompleta } from './pasos';

/**
 * Convierte la receta en "tu cerveza". Logica pura y sin azar: la misma receta
 * da siempre la misma cerveza. Los numeros son APROXIMADOS y de juego, no de
 * laboratorio. El color del vaso no se calcula aqui: es el de la malta (datos.ts).
 */

export type Estilo = 'Pilsner' | 'Lager ámbar' | 'Dunkel' | 'Schwarzbier' | 'Rubia' | 'IPA' | 'Amber Ale' | 'Tostada' | 'Stout';
export type Cuerpo = 'ligero' | 'medio' | 'con cuerpo';

export type Cerveza = {
  estilo: Estilo;
  /** Graduacion aproximada, con un decimal. */
  abv: number;
  /** Amargor aproximado. */
  ibu: number;
  cuerpo: Cuerpo;
  /** Nota de ejecucion, 0..100. */
  puntuacion: number;
};

/** IBU a partir del cual una ale palida ya es una IPA y no una rubia. */
export const IBU_IPA = 40;

const IBU_BASE = 10;
const IBU_RANGO = 50;

const ABV_BASE = 4.2;
const ABV_POR_MACERACION = 1.8;
/** Lo que suma cada estilo por ser, de por si, mas o menos fuerte. */
const ABV_ESTILO: Record<Estilo, number> = {
  Pilsner: 0,
  'Lager ámbar': 0.2,
  Dunkel: 0.2,
  Schwarzbier: 0.3,
  Rubia: 0,
  IPA: 0.8,
  'Amber Ale': 0.3,
  Tostada: 0.2,
  Stout: 0.6,
};

const CUERPO_MALTA: Record<MaltaId, number> = { palida: 1, caramelo: 2, tostada: 2, negra: 2.5 };
const CUERPO_POR_MACERACION = 1.2;

/** Cada estilo sale de malta + levadura; en la ale palida decide ademas el amargor. */
export function calcularEstilo(malta: MaltaId, levadura: 'ale' | 'lager', ibu: number): Estilo {
  if (levadura === 'lager') {
    return { palida: 'Pilsner', caramelo: 'Lager ámbar', tostada: 'Dunkel', negra: 'Schwarzbier' }[malta] as Estilo;
  }
  if (malta === 'palida') return ibu >= IBU_IPA ? 'IPA' : 'Rubia';
  return { caramelo: 'Amber Ale', tostada: 'Tostada', negra: 'Stout' }[malta] as Estilo;
}

export function calcularCuerpo(malta: MaltaId, maceracion: number): Cuerpo {
  const v = CUERPO_MALTA[malta] + CUERPO_POR_MACERACION * maceracion;
  if (v < 2) return 'ligero';
  if (v < 3) return 'medio';
  return 'con cuerpo';
}

/** 40 % maceracion, 30 % amargor y 30 % aroma: lo que se hizo con las manos. */
export function calcularPuntuacion(r: RecetaCompleta): number {
  return Math.round(40 * r.maceracion + 30 * r.lupulo.amargor + 30 * r.lupulo.aroma);
}

export function calcularCerveza(r: RecetaCompleta): Cerveza {
  const ibu = Math.round(IBU_BASE + IBU_RANGO * r.lupulo.amargor);
  const estilo = calcularEstilo(r.malta, r.levadura, ibu);
  const abv = Math.round((ABV_BASE + ABV_POR_MACERACION * r.maceracion + ABV_ESTILO[estilo]) * 10) / 10;
  return {
    estilo,
    abv,
    ibu,
    cuerpo: calcularCuerpo(r.malta, r.maceracion),
    puntuacion: calcularPuntuacion(r),
  };
}

/** Frase segun la nota, para el resultado. Los tramos son de 20 puntos, salvo el ultimo. */
export function veredicto(puntuacion: number): string {
  if (puntuacion < 20) return 'Esto es agua con ideas';
  if (puntuacion < 40) return 'Lo has intentado con cariño';
  if (puntuacion < 60) return 'Se deja beber';
  if (puntuacion < 80) return 'Cerveza de la buena';
  if (puntuacion < 95) return 'Maestro cervecero';
  return 'Te contratan mañana';
}
