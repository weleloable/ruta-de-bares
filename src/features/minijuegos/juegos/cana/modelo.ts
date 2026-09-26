/**
 * Modelo de "La Caña Perfecta". Logica pura, sin React ni tiempo real: el
 * componente solo llama a `avanzar` con el `dt` de cada fotograma.
 *
 * Todo son fracciones de la altura del vaso (0 = vacio, 1 = borde). Dos
 * variables, a proposito: `liquido` y `espuma`. No es fisica, es lo que se
 * siente bien.
 */

export type Estado = {
  liquido: number;
  espuma: number;
  /**
   * Memoria de COMO se tiro: total vertido y espuma que se hizo al verterlo, sin
   * descontar lo que luego se asiente. Sin esto, esperar unos segundos arreglaba
   * una espuma mal tirada, y la tecnica (inclinar y enderezar) no valia nada.
   */
  vertido: number;
  espumaHecha: number;
};

/** Un estado "recien tirado": lo vertido es lo que hay, sin asentar. Para tests y para partir de cero. */
export function vaso(liquido: number, espuma: number): Estado {
  return { liquido, espuma, vertido: liquido + espuma, espumaHecha: espuma };
}

/** A que altura esta el borde del vaso: la caña se sirve llena, y pasarse es derramar. */
export const LLENO = 1;
/** Margen para que el redondeo de decimales no cuente como derrame. */
const EPSILON = 1e-9;
/** Lo que entra por segundo con el grifo abierto (unos 4 s en llenar el vaso). */
export const CAUDAL = 0.22;
/**
 * Fraccion de la espuma que se vuelve liquido por segundo. Es PROPORCIONAL, no
 * una cantidad fija (con una fija, dos dedos de espuma se iban en 4 s). Con
 * 0.015 la mitad tarda ~46 s en irse: la partida dura menos de 2 minutos, asi
 * que lo tirado mal se queda mal.
 */
export const ASENTAMIENTO = 0.015;
/**
 * Cuanto pesa en la nota de espuma COMO se tiro (0..1) frente a como ha quedado
 * el vaso. Alto a proposito: lo que cuenta es la tecnica, no esperar.
 */
export const PESO_VERTIDO = 0.7;
/** Angulo (grados) a partir del cual el vaso ya esta "bien inclinado". */
export const ANGULO_BUENO = 45;
/** Proporcion de espuma sobre el total que se considera perfecta ("dos dedos"). */
export const ESPUMA_IDEAL = { min: 0.15, max: 0.2 } as const;

export const ESTADO_VACIO: Estado = vaso(0, 0);

export function total(e: Estado): number {
  return e.liquido + e.espuma;
}

/**
 * Que parte de lo que cae se vuelve espuma segun la inclinacion: recto = mucha,
 * inclinado = poca. Lineal entre 0 grados (70%) y 45 grados (10%), con suelo en
 * 8% para que nunca sea imposible dejar algo de corona.
 */
export function fraccionEspuma(anguloGrados: number): number {
  const a = Math.min(Math.max(anguloGrados, 0), 90);
  return Math.max(0.08, 0.7 - (0.6 * a) / ANGULO_BUENO);
}

/** Un paso de `dt` segundos. `sirviendo` = grifo abierto. */
export function avanzar(e: Estado, dt: number, sirviendo: boolean, anguloGrados: number): Estado {
  let { liquido, espuma, vertido, espumaHecha } = e;

  if (sirviendo) {
    const entra = CAUDAL * dt;
    const parteEspuma = fraccionEspuma(anguloGrados);
    espuma += entra * parteEspuma;
    liquido += entra * (1 - parteEspuma);
    vertido += entra;
    espumaHecha += entra * parteEspuma;
  }

  // Decaimiento exponencial exacto (no `espuma * k * dt`): no depende del dt del fotograma.
  const seAsienta = espuma * (1 - Math.exp(-ASENTAMIENTO * dt));
  espuma -= seAsienta;
  liquido += seAsienta;

  return { liquido, espuma, vertido, espumaHecha };
}

export function desbordado(e: Estado): boolean {
  return total(e) > LLENO + EPSILON;
}

export type Desglose = {
  nivel: number;
  espuma: number;
  rapidez: number;
  total: number;
};

/** Segundos por debajo de los cuales la rapidez da el maximo, y por encima de los cuales da 0. */
export const TIEMPO_RAPIDO = 6;
export const TIEMPO_LENTO = 20;

const limitar = (x: number) => Math.min(Math.max(x, 0), 1);

/**
 * Nota de 0 a 100: nivel respecto al borde (40), proporcion de espuma (40) y
 * rapidez (20). Derramar es un fallo y vale 0 entero: no hay medias tintas con
 * una jarra que rebosa. `segundos` es lo que se tardo desde el primer toque.
 */
export function puntuar(e: Estado, segundos: number, seDesbordo: boolean): Desglose {
  if (seDesbordo || desbordado(e)) return { nivel: 0, espuma: 0, rapidez: 0, total: 0 };

  const t = total(e);
  // Con el vaso vacio no hay proporcion que valorar.
  if (t <= 0) return { nivel: 0, espuma: 0, rapidez: 0, total: 0 };

  // Un error de 0.3 (un 30% del vaso) ya es 0 puntos.
  const nivel = Math.round(40 * limitar(1 - Math.abs(t - LLENO) / 0.3));

  // Mezcla lo que se hizo al servir con lo que queda: si solo contara lo que
  // queda, esperar a que se asiente arreglaria cualquier tirada.
  const ratioActual = e.espuma / t;
  const ratioVertido = e.vertido > 0 ? e.espumaHecha / e.vertido : ratioActual;
  const ratio = PESO_VERTIDO * ratioVertido + (1 - PESO_VERTIDO) * ratioActual;
  const distancia =
    ratio < ESPUMA_IDEAL.min ? ESPUMA_IDEAL.min - ratio : ratio > ESPUMA_IDEAL.max ? ratio - ESPUMA_IDEAL.max : 0;
  // A 0.25 de la banda ideal (p. ej. 45% de espuma) tampoco se puntua.
  const espuma = Math.round(40 * limitar(1 - distancia / 0.25));

  const rapidez = Math.round(20 * limitar((TIEMPO_LENTO - segundos) / (TIEMPO_LENTO - TIEMPO_RAPIDO)));

  return { nivel, espuma, rapidez, total: nivel + espuma + rapidez };
}
