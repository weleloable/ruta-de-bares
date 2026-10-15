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
  /** Lo que se ha salido por el borde (fraccion del vaso). Solo sube. */
  derramado: number;
};

/** Un estado "recien tirado": lo vertido es lo que hay, sin asentar. Para tests y para partir de cero. */
export function vaso(liquido: number, espuma: number, derramado = 0): Estado {
  return { liquido, espuma, vertido: liquido + espuma, espumaHecha: espuma, derramado };
}

/** A que altura esta el borde del vaso: la caña se sirve llena, y pasarse es derramar. */
export const LLENO = 1;
/** Margen para que el redondeo de decimales no cuente como derrame. */
const EPSILON = 1e-9;
/**
 * Derrame a partir del cual el vaso se da por perdido y la partida termina sola.
 * Y el derrame con el que la penalizacion llega a su maximo.
 */
export const DERRAME_MAX = 0.3;
/** Parte de la nota que se pierde con el derrame maximo. No es 1: es un castigo fuerte, no un cero. */
export const PENALIZACION_MAX = 0.8;
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
/**
 * Proporcion de espuma sobre el total que se considera perfecta ("dos dedos").
 * Es una banda ESTRECHA a proposito: con la de antes (15 a 20 %) casi todo el
 * mundo caia dentro y la espuma daba los 40 puntos sin esfuerzo.
 */
export const ESPUMA_IDEAL = { min: 0.17, max: 0.18 } as const;
/** A esta distancia de la banda ideal la espuma ya no puntua (antes 0,25). */
export const ESPUMA_TOLERANCIA = 0.12;
/** Error de nivel (fraccion del vaso, por exceso o por defecto) con el que el nivel ya no puntua (antes 0,3). */
export const NIVEL_TOLERANCIA = 0.12;

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
  let { liquido, espuma, vertido, espumaHecha, derramado } = e;

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

  // Lo que pasa del borde se sale: primero la espuma, que es lo que hay arriba.
  const exceso = liquido + espuma - LLENO;
  if (exceso > EPSILON) {
    const deEspuma = Math.min(espuma, exceso);
    espuma -= deEspuma;
    liquido -= exceso - deEspuma;
    derramado += exceso;
  }

  return { liquido, espuma, vertido, espumaHecha, derramado };
}

/** ¿Se esta saliendo cerveza ahora mismo o se ha salido ya? */
export function haDerramado(e: Estado): boolean {
  return e.derramado > EPSILON;
}

/** ¿El vaso esta hasta el borde? (con el grifo abierto, lo que entre se derrama) */
export function estaLleno(e: Estado): boolean {
  return total(e) >= LLENO - EPSILON;
}

/** El derrame ya es tan grande que no tiene sentido seguir. */
export function derrameTotal(e: Estado): boolean {
  return e.derramado >= DERRAME_MAX;
}

/**
 * Segundos por debajo de los cuales la rapidez da el maximo, y por encima de los
 * cuales da 0. Llenar el vaso lleva 4,5 s como minimo, asi que 5 s es "de un
 * tiron" (antes 6 s y hasta 20 s para perderlo todo).
 */
export const TIEMPO_RAPIDO = 5;
export const TIEMPO_LENTO = 14;

/**
 * Nota a partir de la cual cada punto cuesta mas. Por debajo, la nota es la que
 * sale de sumar. Por encima, `curvaAlta` la comprime.
 */
export const UMBRAL_CURVA = 90;
export const PUNTUACION_MAXIMA = 100;

const limitar = (x: number) => Math.min(Math.max(x, 0), 1);
/** Dos decimales: lo que se guarda y se ensena (99,03). */
const redondear2 = (x: number) => Math.round(x * 100) / 100;

/**
 * La curva de los ultimos 10 puntos: 100 - 10 * ((100 - bruta) / 10) ^ 0,5.
 * Continua en 90 (90 sigue siendo 90) y comprime lo de arriba: una nota bruta
 * de 95 vale 92,9, una de 99 vale 96,8 y para llegar a 99,0 hay que tener 99,9
 * bruto. El 100 solo sale de una partida perfecta. Cuanto mas arriba, mas duele
 * un fallo pequeño. Sin esto, con la nota redondeada a enteros, un jugador
 * normal sacaba 95 o mas nueve veces de cada diez.
 */
export function curvaAlta(bruta: number): number {
  if (bruta <= UMBRAL_CURVA) return bruta;
  const tramo = PUNTUACION_MAXIMA - UMBRAL_CURVA;
  return PUNTUACION_MAXIMA - tramo * Math.sqrt((PUNTUACION_MAXIMA - Math.min(bruta, PUNTUACION_MAXIMA)) / tramo);
}

export type Desglose = {
  nivel: number;
  espuma: number;
  rapidez: number;
  /** Puntos que se han perdido por derramar (ya descontados de `bruta`). */
  penalizacion: number;
  /** La suma menos la penalizacion, antes de la curva de arriba. */
  bruta: number;
  /** La nota final, de 0 a 100 con dos decimales. */
  total: number;
};

/**
 * Nota de 0 a 100 con dos decimales: nivel respecto al borde (40), proporcion de
 * espuma (40) y rapidez (20). Derramar penaliza fuerte pero no anula: la suma se
 * multiplica por un factor que baja hasta 0.2 con `DERRAME_MAX`. Por ultimo, por
 * encima de `UMBRAL_CURVA` se aplica `curvaAlta`. `segundos` es lo que se tardo
 * desde el primer toque.
 *
 * Nada se redondea hasta el final: con enteros, soltar el grifo 10 ms antes o
 * despues daba la misma nota, y ahora cada milesima de vaso cuenta.
 */
export function puntuar(e: Estado, segundos: number): Desglose {
  const t = total(e);
  // Con el vaso vacio no hay proporcion que valorar.
  if (t <= 0) return { nivel: 0, espuma: 0, rapidez: 0, penalizacion: 0, bruta: 0, total: 0 };

  const nivel = 40 * limitar(1 - Math.abs(t - LLENO) / NIVEL_TOLERANCIA);

  // Mezcla lo que se hizo al servir con lo que queda: si solo contara lo que
  // queda, esperar a que se asiente arreglaria cualquier tirada.
  const ratioActual = e.espuma / t;
  const ratioVertido = e.vertido > 0 ? e.espumaHecha / e.vertido : ratioActual;
  const ratio = PESO_VERTIDO * ratioVertido + (1 - PESO_VERTIDO) * ratioActual;
  const distancia =
    ratio < ESPUMA_IDEAL.min ? ESPUMA_IDEAL.min - ratio : ratio > ESPUMA_IDEAL.max ? ratio - ESPUMA_IDEAL.max : 0;
  const espuma = 40 * limitar(1 - distancia / ESPUMA_TOLERANCIA);

  // Un reloj roto (NaN) no debe dar una nota NaN: se cuenta como el tiempo mas lento.
  const seg = Number.isFinite(segundos) ? segundos : TIEMPO_LENTO;
  const rapidez = 20 * limitar((TIEMPO_LENTO - seg) / (TIEMPO_LENTO - TIEMPO_RAPIDO));

  const base = nivel + espuma + rapidez;
  const factor = 1 - PENALIZACION_MAX * limitar(e.derramado / DERRAME_MAX);
  const bruta = base * factor;
  return {
    nivel: redondear2(nivel),
    espuma: redondear2(espuma),
    rapidez: redondear2(rapidez),
    penalizacion: redondear2(base - bruta),
    bruta: redondear2(bruta),
    total: redondear2(curvaAlta(bruta)),
  };
}
