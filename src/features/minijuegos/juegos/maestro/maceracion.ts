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

// ---------------------------------------------------------------------------
// La olla (OllaMaceracion.tsx).
// ---------------------------------------------------------------------------

/**
 * Lo que la olla de maceracion ENSENA segun la temperatura: nieve si se ha
 * enfriado, vapor si se ha pasado, burbujas suaves si esta en su punto. Logica
 * pura; OllaMaceracion.tsx solo la pinta. Vive aqui y no en un fichero
 * aparte porque los tests cargan esto en Node, que no resuelve imports entre
 * hermanos sin extension.
 *
 * Usa las mismas ZONA y TOLERANCIA que puntuan: la olla dice lo
 * mismo que el termometro, y a la distancia a la que ya no se puntua nada la
 * senal esta al maximo.
 */

export type Clima = {
  modo: 'frio' | 'justo' | 'caliente';
  /** 0 a 1. Fuera de la zona nunca baja de INTENSIDAD_MINIMA: medio grado ya se tiene que notar. */
  intensidad: number;
};

/** Lo minimo que se ve nada mas salir de la zona. Por debajo, una mota sola no se distingue. */
export const INTENSIDAD_MINIMA = 0.25;

export function climaOlla(temp: number): Clima {
  if (temp >= ZONA.min && temp <= ZONA.max) return { modo: 'justo', intensidad: 0 };
  const distancia = temp < ZONA.min ? ZONA.min - temp : temp - ZONA.max;
  const intensidad = limitar(INTENSIDAD_MINIMA + (1 - INTENSIDAD_MINIMA) * (distancia / TOLERANCIA), 0, 1);
  return { modo: temp < ZONA.min ? 'frio' : 'caliente', intensidad };
}

/** Cuantas de `total` particulas se ven con esta intensidad (0 en la zona, al menos 1 fuera). */
export function particulasVisibles(clima: Clima, total: number): number {
  if (clima.modo === 'justo') return 0;
  return limitar(Math.ceil(clima.intensidad * total), 1, total);
}

/**
 * Si la particula `indice` de `total` se ve cuando tocan `visibles`. Las que se
 * ven quedan REPARTIDAS por la olla (con 2 de 7, no salen las dos pegadas a la
 * izquierda) y son exactamente `visibles`.
 */
export function particulaVisible(indice: number, visibles: number, total: number): boolean {
  return (indice * visibles) % total < visibles;
}

// Mosto frio (palido, casi gris), en su punto (dorado) y pasado (tostado rojizo).
const MOSTO_FRIO: Rgb = [200, 186, 150];
const MOSTO_JUSTO: Rgb = [214, 150, 58];
const MOSTO_CALIENTE: Rgb = [190, 82, 38];

type Rgb = [number, number, number];

const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const mezclar = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

/** Color de la superficie del mosto: dorado en la zona, se apaga al enfriarse y se tuesta al pasarse. */
export function colorMosto(temp: number): string {
  const { modo, intensidad } = climaOlla(temp);
  if (modo === 'justo') return hex(MOSTO_JUSTO);
  return hex(mezclar(MOSTO_JUSTO, modo === 'frio' ? MOSTO_FRIO : MOSTO_CALIENTE, intensidad));
}

// --- Que quepa en la pantalla ------------------------------------------------

/**
 * Alto de la ventana que se lleva TODO lo que no es el paso: la barra de
 * arriba y las pestanas de abajo (~120), el margen de la pantalla, la cabecera
 * del juego, "Paso 3 de 4" y su titulo, y los botones Siguiente y Atras (~280).
 * Es una medida, no un calculo: si cambia la pantalla de los juegos, se
 * recalcula midiendo en Chrome (ver el PR). Lo usan los dos pasos que llevan
 * olla: la maceracion y el hervido.
 */
export const ALTO_APP_RESERVADO = 412;
/** La olla no se encoge mas de esto: por debajo ya no se distinguen la nieve ni las bolsas. */
export const ESCALA_OLLA_MIN = 0.35;

/**
 * Que escala (de ESCALA_OLLA_MIN a 1) tiene que tener la olla para que el paso
 * entero quepa SIN scroll. `altoResto` es lo que ocupa el paso sin la olla
 * (texto, barra, boton...) y `altoOlla` lo que mide la olla a tamano
 * natural. En una pantalla grande la olla va entera; en una pequena se encoge
 * hasta el minimo y, si ni asi cabe, es el unico caso en que habra scroll.
 */
export function escalaOlla(altoVentana: number, altoResto: number, altoOlla: number): number {
  const hueco = altoVentana - ALTO_APP_RESERVADO - altoResto;
  const escala = hueco / altoOlla;
  if (!Number.isFinite(escala)) return ESCALA_OLLA_MIN;
  return Math.min(Math.max(escala, ESCALA_OLLA_MIN), 1);
}

