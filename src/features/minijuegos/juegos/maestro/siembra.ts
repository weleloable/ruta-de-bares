import type { LevaduraId } from './datos';

/**
 * Enfriar y sembrar (paso 4 de Maestro Cervecero). Logica pura: el componente
 * pone el `dt` de cada fotograma y si el grifo esta abierto.
 *
 * Lo que pasa de verdad: el mosto sale del hervido casi a 100 grados y, si se
 * echa la levadura asi, se muere. Hay que enfriarlo hasta la temperatura de
 * esa levadura (una ale, templada; una lager, fria) y entonces "sembrarla".
 *
 * La mecanica: mientras se MANTIENE pulsado el grifo de agua fria, el mosto se
 * enfria cada vez mas deprisa; al soltar, todavia baja un rato por la INERCIA
 * (el agua del serpentin sigue fria). Hay que soltar antes de llegar y echar la
 * levadura cuando la temperatura entra en su ventana. Un solo disparo: echarla
 * es definitivo. Si se agota el tiempo, se echa sola con lo que haya.
 */

export const TEMP_INICIAL = 96;
/** El agua del grifo no enfria por debajo de esto. */
export const TEMP_GRIFO = 4;
/** Rango que dibuja el termometro. */
export const TEMP_MIN = 0;
export const TEMP_MAX = 100;
/** Por encima de esto la levadura no sobrevive: echarla ahi es perderla (se dice asi en pantalla). */
export const TEMP_MUERTE = 40;

/**
 * Temperatura a la que se siembra cada levadura. Son las habituales: una ale
 * fermenta templada (unos 18-22 grados) y una lager fria (unos 8-12).
 */
export const VENTANAS: Record<LevaduraId, { min: number; max: number }> = {
  ale: { min: 18, max: 22 },
  lager: { min: 8, max: 12 },
};

/** A cuantos grados de la ventana ya no se puntua nada (como en la maceracion). */
export const TOLERANCIA = 6;
/** Segundos desde el primer toque hasta que la levadura se echa sola. */
export const TIEMPO_MAX = 20;

/** Lo mas rapido que enfria el serpentin a tope, en grados por segundo. */
export const VELOCIDAD_MAX = 12;
/** Lo que se enfria solo con el grifo cerrado, en grados por segundo. */
const ENFRIAMIENTO_SOLO = 0.3;
/** Con que rapidez se pone el serpentin a tope al abrir (por segundo). Mas = menos arranque perezoso. */
const ARRANQUE = 2.5;
/** Con que rapidez se para al cerrar (por segundo). Menos = mas inercia, mas dificil. */
const FRENADA = 1.6;

export type Estado = {
  temp: number;
  /** Grados por segundo, NEGATIVO = enfriando. */
  velocidad: number;
  /** Segundos jugados desde el primer toque. */
  t: number;
  /** null mientras no se ha sembrado; la temperatura a la que se sembro. */
  sembradaA: number | null;
  /** Si se echo sola porque se acabo el tiempo. */
  sola: boolean;
};

export const INICIO: Estado = { temp: TEMP_INICIAL, velocidad: 0, t: 0, sembradaA: null, sola: false };

const limitar = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

export function terminado(e: Estado): boolean {
  return e.sembradaA !== null;
}

/**
 * Un paso de `dt` segundos. `grifo` = se esta manteniendo pulsado.
 * La velocidad tiende a -VELOCIDAD_MAX con el grifo abierto y a casi 0 con el
 * grifo cerrado, siempre poco a poco: esa es la inercia que hay que dominar.
 */
export function avanzar(e: Estado, dt: number, grifo: boolean): Estado {
  if (terminado(e)) return e;
  const objetivo = grifo ? -VELOCIDAD_MAX : -ENFRIAMIENTO_SOLO;
  const rapidez = grifo ? ARRANQUE : FRENADA;
  // Acercamiento exponencial: con un dt grande no se pasa del objetivo.
  const velocidad = e.velocidad + (objetivo - e.velocidad) * Math.min(rapidez * dt, 1);
  const temp = limitar(e.temp + velocidad * dt, TEMP_GRIFO, TEMP_MAX);
  const t = e.t + dt;
  const siguiente: Estado = { ...e, temp, velocidad: temp === TEMP_GRIFO ? 0 : velocidad, t };
  // Se acabo el tiempo: la levadura se echa sola, con la temperatura que haya.
  if (t >= TIEMPO_MAX) return { ...siguiente, t: TIEMPO_MAX, sembradaA: temp, sola: true };
  return siguiente;
}

/** Echar la levadura ahora. Es definitivo: un segundo toque no cambia nada. */
export function sembrar(e: Estado): Estado {
  if (terminado(e)) return e;
  return { ...e, sembradaA: e.temp, velocidad: 0 };
}

/** 1 dentro de la ventana y baja en recta hasta 0 a TOLERANCIA grados de ella. Por encima de TEMP_MUERTE, 0. */
export function acierto(temp: number, levadura: LevaduraId): number {
  if (temp >= TEMP_MUERTE) return 0;
  const { min, max } = VENTANAS[levadura];
  const distancia = temp < min ? min - temp : temp > max ? temp - max : 0;
  return limitar(1 - distancia / TOLERANCIA, 0, 1);
}

/** De 0 a 1, lo que se lleva la receta. Sin sembrar, 0. */
export function precision(e: Estado, levadura: LevaduraId): number {
  return e.sembradaA === null ? 0 : acierto(e.sembradaA, levadura);
}

/**
 * Como le fue a la levadura, para decirlo en pantalla:
 *  - `muerta`: se echo con el mosto demasiado caliente (> TEMP_MUERTE);
 *  - `estresada`: caliente para ella, pero viva (sabores raros);
 *  - `perfecta`: dentro de su ventana;
 *  - `dormida`: demasiado fria, arranca tarde y a medias.
 */
export type Suerte = 'muerta' | 'estresada' | 'perfecta' | 'dormida';

export function suerte(temp: number, levadura: LevaduraId): Suerte {
  const { min, max } = VENTANAS[levadura];
  if (temp >= TEMP_MUERTE) return 'muerta';
  if (temp > max) return 'estresada';
  if (temp < min) return 'dormida';
  return 'perfecta';
}

/** Cuantos grados se seguira enfriando si se cierra el grifo ahora (lo que "frena" la inercia). Para la ayuda visual. */
export function inerciaRestante(e: Estado): number {
  // Con el grifo cerrado, la velocidad decae exponencialmente hacia -ENFRIAMIENTO_SOLO
  // con constante FRENADA: la integral del exceso es exceso / FRENADA.
  const exceso = Math.max(-e.velocidad - ENFRIAMIENTO_SOLO, 0);
  return exceso / FRENADA;
}

/**
 * Como salio la fermentacion, en una palabra, para la tarjeta del resultado.
 * Sale de la precision (lo que cuenta en la nota), no de la `suerte`, que ya no
 * se guarda: la tarjeta tiene que poder pintarse solo con la receta.
 */
export function fermentacion(precisionSiembra: number): 'limpia' | 'buena' | 'con defectos' | 'fallida' {
  if (precisionSiembra >= 0.9) return 'limpia';
  if (precisionSiembra >= 0.5) return 'buena';
  if (precisionSiembra > 0) return 'con defectos';
  return 'fallida';
}
