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
};

/** Donde esta la linea de llenado: la caña bien tirada llega justo aqui. */
export const LINEA = 0.88;
/** Lo que entra por segundo con el grifo abierto (unos 4 s en llenar el vaso). */
export const CAUDAL = 0.22;
/**
 * Fraccion de la espuma que se vuelve liquido por segundo. Es PROPORCIONAL, no
 * una cantidad fija: con una fija, dos dedos de espuma se iban en 4 s y no tenia
 * sentido. Asi la corona aguanta (mitad a los ~17 s) y nunca llega a 0 del todo.
 */
export const ASENTAMIENTO = 0.04;
/** Angulo (grados) a partir del cual el vaso ya esta "bien inclinado". */
export const ANGULO_BUENO = 45;
/** Proporcion de espuma sobre el total que se considera perfecta ("dos dedos"). */
export const ESPUMA_IDEAL = { min: 0.15, max: 0.2 } as const;

export const ESTADO_VACIO: Estado = { liquido: 0, espuma: 0 };

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
  let { liquido, espuma } = e;

  if (sirviendo) {
    const entra = CAUDAL * dt;
    const parteEspuma = fraccionEspuma(anguloGrados);
    espuma += entra * parteEspuma;
    liquido += entra * (1 - parteEspuma);
  }

  // Decaimiento exponencial exacto (no `espuma * k * dt`): no depende del dt del fotograma.
  const seAsienta = espuma * (1 - Math.exp(-ASENTAMIENTO * dt));
  espuma -= seAsienta;
  liquido += seAsienta;

  return { liquido, espuma };
}

export function desbordado(e: Estado): boolean {
  return total(e) > 1;
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
 * Nota de 0 a 100: nivel respecto a la linea (40), proporcion de espuma (40) y
 * rapidez (20). Derramar es un fallo y vale 0 entero: no hay medias tintas con
 * una jarra que rebosa. `segundos` es lo que se tardo desde el primer toque.
 */
export function puntuar(e: Estado, segundos: number, seDesbordo: boolean): Desglose {
  if (seDesbordo || desbordado(e)) return { nivel: 0, espuma: 0, rapidez: 0, total: 0 };

  const t = total(e);
  // Con el vaso vacio no hay proporcion que valorar.
  if (t <= 0) return { nivel: 0, espuma: 0, rapidez: 0, total: 0 };

  // Un error de 0.3 (un 30% del vaso) ya es 0 puntos.
  const nivel = Math.round(40 * limitar(1 - Math.abs(t - LINEA) / 0.3));

  const ratio = e.espuma / t;
  const distancia =
    ratio < ESPUMA_IDEAL.min ? ESPUMA_IDEAL.min - ratio : ratio > ESPUMA_IDEAL.max ? ratio - ESPUMA_IDEAL.max : 0;
  // A 0.25 de la banda ideal (p. ej. 45% de espuma) tampoco se puntua.
  const espuma = Math.round(40 * limitar(1 - distancia / 0.25));

  const rapidez = Math.round(20 * limitar((TIEMPO_LENTO - segundos) / (TIEMPO_LENTO - TIEMPO_RAPIDO)));

  return { nivel, espuma, rapidez, total: nivel + espuma + rapidez };
}
