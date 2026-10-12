// GENERADO por scripts/generar-sprites-tapon.py. No editar a mano: regenerar.
//
// Donde cae cada dibujo de assets/tapon/ respecto a su punto de referencia, en
// metros: x0..x1 a lo ancho, y0..y1 a lo alto (y hacia arriba). Lo que va en la
// barra (vaso, jarra, caja, camarero, base) tiene la referencia EN la barra (y = 0)
// bajo el centro de su boca, de la oreja o de la cuchara. El brazo, en su eje; la
// chapa, en su centro.

export type Caja = { x0: number; x1: number; y0: number; y1: number; px: [number, number] };

export const SPRITES = {
  vaso: { x0: -0.19, x1: 0.19, y0: -0.02, y1: 0.47, px: [167, 216] },
  jarra: { x0: -0.17, x1: 0.28, y0: -0.02, y1: 0.41, px: [198, 189] },
  caja: { x0: -0.23, x1: 0.23, y0: -0.02, y1: 0.35, px: [202, 163] },
  camarero: { x0: -0.12, x1: 0.47, y0: 0.0, y1: 1.122, px: [260, 494] },
  base: { x0: -0.34, x1: 0.2, y0: 0.0, y1: 0.3, px: [238, 132] },
  chapa: { x0: -0.055, x1: 0.055, y0: -0.055, y1: 0.055, px: [48, 48] },
  brazo: { x0: -0.310416, x1: 0.310416, y0: -0.07, y1: 0.07, px: [273, 62] },
} as const satisfies Record<string, Caja>;

/** Eje del brazo de la catapulta, respecto al punto de la barra bajo la cuchara (m). */
export const PIVOTE = { x: -0.07, y: 0.12 };
/** Del eje al centro de la cuchara (m). */
export const LARGO_BRAZO = 0.240416;
/** Medidas con las que se dibujo, para que el test las compare con modelo.ts. */
export const DIBUJADO_CON = { alturaSalida: 0.35, vaso: {boca: 0.3, ancho: 0.33, alto: 0.42}, jarra: {boca: 0.24, ancho: 0.27, alto: 0.36}, caja: {boca: 0.2, ancho: 0.4, alto: 0.3}, oreja: {boca: 0.12, alto: 0.9}, cabeza: {dx: 0.17, dy: 0.04, r: 0.085} };
