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

/** Graduacion en MILESIMAS de grado: parte de 4,2 % y cada punto de maceracion suma 0,018. */
const ABV_BASE = 4200;
const ABV_POR_PUNTO_MACERACION = 18;

/** Lo que suma cada estilo por ser, de por si, mas o menos fuerte, en DECIMAS de grado. */
const ABV_ESTILO_DECIMAS: Record<Estilo, number> = {
  Pilsner: 0,
  'Lager ámbar': 2,
  Dunkel: 2,
  Schwarzbier: 3,
  Rubia: 0,
  IPA: 8,
  'Amber Ale': 3,
  Tostada: 2,
  Stout: 6,
};

/** Cuerpo de cada malta, en MILESIMAS (la negra, 2,5). Y lo que suma cada punto de maceracion (0,012). */
const CUERPO_MALTA_MILESIMAS: Record<MaltaId, number> = { palida: 1000, caramelo: 2000, tostada: 2000, negra: 2500 };
const CUERPO_POR_PUNTO_MACERACION = 12;

/**
 * TODO el calculo se hace con enteros sobre PORCENTAJES (0..100), no con las
 * fracciones que devuelven los microjuegos. Es un espejo de
 * `maestro_calcular_cerveza` (migracion 0034), que hace lo mismo en el
 * servidor: con decimales, un 0,1 + 0,2 de coma flotante bastaria para que el
 * cliente y el servidor no coincidieran en un redondeo de medio punto.
 */
export function aPorcentaje(fraccion: number): number {
  return Math.round(Math.min(Math.max(fraccion, 0), 1) * 100);
}

/** n / d redondeado a la mitad hacia arriba (como round() de Postgres con positivos). d ha de ser par. */
const dividir = (n: number, d: number) => Math.floor((n + d / 2) / d);

/** Cada estilo sale de malta + levadura; en la ale palida decide ademas el amargor. */
export function calcularEstilo(malta: MaltaId, levadura: 'ale' | 'lager', ibu: number): Estilo {
  if (levadura === 'lager') {
    return { palida: 'Pilsner', caramelo: 'Lager ámbar', tostada: 'Dunkel', negra: 'Schwarzbier' }[malta] as Estilo;
  }
  if (malta === 'palida') return ibu >= IBU_IPA ? 'IPA' : 'Rubia';
  return { caramelo: 'Amber Ale', tostada: 'Tostada', negra: 'Stout' }[malta] as Estilo;
}

/** `maceracion` en fraccion (0..1), como la entrega el microjuego. */
export function calcularCuerpo(malta: MaltaId, maceracion: number): Cuerpo {
  const v = CUERPO_MALTA_MILESIMAS[malta] + CUERPO_POR_PUNTO_MACERACION * aPorcentaje(maceracion);
  if (v < 2000) return 'ligero';
  if (v < 3000) return 'medio';
  return 'con cuerpo';
}

/** 40 % maceracion, 30 % amargor y 30 % aroma: lo que se hizo con las manos. */
export function calcularPuntuacion(r: RecetaCompleta): number {
  const suma = 40 * aPorcentaje(r.maceracion) + 30 * aPorcentaje(r.lupulo.amargor) + 30 * aPorcentaje(r.lupulo.aroma);
  return dividir(suma, 100);
}

export function calcularCerveza(r: RecetaCompleta): Cerveza {
  const maceracion = aPorcentaje(r.maceracion);
  const ibu = IBU_BASE + dividir(IBU_RANGO * aPorcentaje(r.lupulo.amargor), 100);
  const estilo = calcularEstilo(r.malta, r.levadura, ibu);
  const milesimas = ABV_BASE + ABV_POR_PUNTO_MACERACION * maceracion + 100 * ABV_ESTILO_DECIMAS[estilo];
  return {
    estilo,
    abv: dividir(milesimas, 100) / 10,
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
