/**
 * Maceracion: un termometro cuya aguja se desvia sola. Logica pura; el
 * componente pone el `dt` de cada fotograma y el `ruido` (aleatorio) para que
 * aqui todo sea determinista y se pueda probar.
 */

/** Zona verde: la maceracion de una cerveza normal se hace hacia los 63-68 grados. */
export const ZONA = { min: 63, max: 68 } as const;
/** Segundos que hay que aguantar. */
export const DURACION = 15;
export const TEMP_INICIAL = 57;
/** Rango que dibuja el termometro. */
export const TEMP_MIN = 40;
export const TEMP_MAX = 85;
/** A cuantos grados de la zona ya no se puntua nada. */
export const TOLERANCIA = 6;

/** Lo que la olla se enfria sola, en grados por segundo. Obliga a tocar de vez en cuando. */
const ENFRIAMIENTO = 0.9;
/** Lo que la aguja se puede escapar hacia un lado u otro, en grados por segundo. */
const DERIVA_MAX = 2.2;
/** Cuanto cambia la deriva por segundo cuando el ruido vale 1. */
const AGITACION = 5;
export const CALOR_POR_TOQUE = 1.8;

export type Estado = {
  temp: number;
  /** Empujon actual (grados/s), positivo = sube. Cambia poco a poco. */
  deriva: number;
  /** Segundos jugados. */
  t: number;
  /** Suma de acierto x segundos: entre 0 y DURACION. */
  acumulado: number;
};

export const INICIO: Estado = { temp: TEMP_INICIAL, deriva: 0, t: 0, acumulado: 0 };

const limitar = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

/** 1 dentro de la zona y baja en recta hasta 0 a `TOLERANCIA` grados de ella. */
export function acierto(temp: number): number {
  const distancia = temp < ZONA.min ? ZONA.min - temp : temp > ZONA.max ? temp - ZONA.max : 0;
  return limitar(1 - distancia / TOLERANCIA, 0, 1);
}

/** Un paso de `dt` segundos. `ruido` en [-1, 1] empuja la deriva. */
export function avanzar(e: Estado, dt: number, ruido: number): Estado {
  if (terminado(e)) return e;
  const deriva = limitar(e.deriva + limitar(ruido, -1, 1) * AGITACION * dt, -DERIVA_MAX, DERIVA_MAX);
  const temp = limitar(e.temp + (deriva - ENFRIAMIENTO) * dt, TEMP_MIN, TEMP_MAX);
  // Ultimo fotograma: no cuenta mas tiempo del que queda.
  const util = Math.min(dt, DURACION - e.t);
  return { temp, deriva, t: e.t + util, acumulado: e.acumulado + acierto(temp) * util };
}

/** Un toque en el boton de calentar. */
export function calentar(e: Estado): Estado {
  if (terminado(e)) return e;
  return { ...e, temp: limitar(e.temp + CALOR_POR_TOQUE, TEMP_MIN, TEMP_MAX) };
}

export function terminado(e: Estado): boolean {
  return e.t >= DURACION - 1e-9;
}

/** De 0 a 1: la parte del tiempo que se ha estado en la zona (con credito parcial cerca de ella). */
export function precision(e: Estado): number {
  return limitar(e.acumulado / DURACION, 0, 1);
}
