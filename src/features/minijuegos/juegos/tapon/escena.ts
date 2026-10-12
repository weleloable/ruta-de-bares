/**
 * De metros a pixeles para Tapon al Vuelo. Puro: lo prueba escena.test.ts.
 *
 * El campo se ANCLA ABAJO: la barra va pegada al borde inferior de la zona y
 * todo el alto que sobre es cielo para la parabola. Asi la misma partida cabe
 * en 740 y en 915 px de alto sin cambiar nada mas que cuanto cielo se ve.
 *
 * No importa nada en tiempo de ejecucion (node --test no resuelve rutas sin
 * extension): el campo llega como argumento (`CAMPO` de modelo.ts).
 */

/** Alto minimo de campo que tiene que verse (m): la oreja esta a 0,9 y la cabeza encima. */
export const ALTO_MINIMO = 1.25;
/** Grosor de la barra dibujada bajo y = 0 (px). */
export const BARRA_PX = 14;
/** Pixeles de arrastre que dan la fuerza maxima. */
export const ALCANCE_PX = 110;
/** A cuanto de la chapa hay que empezar a arrastrar (px): un dedo no es preciso. */
export const RADIO_AGARRE_PX = 56;

export type Escala = {
  /** px por metro. */
  e: number;
  ancho: number;
  alto: number;
  px: (x: number) => number;
  py: (y: number) => number;
};

export type Campo = { xMin: number; xMax: number };

export function crearEscala(ancho: number, alto: number, campo: Campo): Escala | null {
  if (!(ancho > 0) || !(alto > BARRA_PX)) return null;
  const anchoCampo = campo.xMax - campo.xMin;
  const e = Math.min(ancho / anchoCampo, (alto - BARRA_PX) / ALTO_MINIMO);
  const ox = (ancho - anchoCampo * e) / 2;
  return {
    e,
    ancho,
    alto,
    px: (x) => ox + (x - campo.xMin) * e,
    py: (y) => alto - BARRA_PX - y * e,
  };
}

/** Si un toque en (x, y) px esta lo bastante cerca de la chapa para agarrarla. */
export function agarraChapa(esc: Escala, chapaX: number, chapaY: number, x: number, y: number): boolean {
  return Math.hypot(x - esc.px(chapaX), y - esc.py(chapaY)) <= RADIO_AGARRE_PX;
}
