/**
 * De metros a pixeles para Tapon al Vuelo. Puro: lo prueba escena.test.ts.
 *
 * El campo se ANCLA ABAJO: el frente de la barra va pegado al borde inferior y
 * todo el alto que sobre es pared del bar. Se juega en horizontal, pero la
 * misma cuenta vale para cualquier proporcion.
 *
 * No importa nada en tiempo de ejecucion (node --test no resuelve rutas sin
 * extension): el campo y las cajas de los dibujos llegan como argumento.
 */

/** Alto minimo de campo que tiene que verse (m): la cabeza del camarero llega a ~1,05. */
export const ALTO_MINIMO = 1.15;
/** Frente de la barra que se ve bajo y = 0 (m). */
export const BARRA_M = 0.16;

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
  if (!(ancho > 0) || !(alto > 0)) return null;
  const anchoCampo = campo.xMax - campo.xMin;
  const e = Math.min(ancho / anchoCampo, alto / (ALTO_MINIMO + BARRA_M));
  const ox = (ancho - anchoCampo * e) / 2;
  return {
    e,
    ancho,
    alto,
    px: (x) => ox + (x - campo.xMin) * e,
    py: (y) => alto - BARRA_M * e - y * e,
  };
}

/**
 * Pixeles de arrastre que dan la fuerza maxima. Depende del hueco: en un movil
 * en horizontal hay ~350 px de alto y el dedo tiene que poder llegar a tope sin
 * salirse de la pantalla.
 */
export function alcancePx(esc: Escala): number {
  return Math.max(70, Math.min(170, Math.min(esc.ancho, esc.alto) * 0.38));
}

/** Por debajo de esto el dedo no ha arrastrado: es un toque (px). */
export const ARRASTRE_MINIMO_PX = 12;

export type CajaDibujo = { x0: number; x1: number; y0: number; y1: number };

/** Donde va un dibujo (left/top/width/height en px) cuyo punto de referencia esta en (x, y) metros. */
export function colocar(esc: Escala, c: CajaDibujo, x: number, y: number) {
  return {
    left: esc.px(x + c.x0),
    top: esc.py(y + c.y1),
    width: (c.x1 - c.x0) * esc.e,
    height: (c.y1 - c.y0) * esc.e,
  };
}

/**
 * De un punto de la pantalla a la zona del juego cuando esta se pinta GIRADA 90
 * grados en el sentido de las agujas del reloj (movil en vertical: el juego se
 * pinta tumbado para jugarlo con el movil girado). `caja` es el rectangulo que
 * ocupa en pantalla, ya girado.
 */
export function desdePantallaGirada(
  caja: { left: number; top: number; right: number },
  clienteX: number,
  clienteY: number,
): [number, number] {
  return [clienteY - caja.top, caja.right - clienteX];
}

/** Cuanto se echa atras el brazo de la catapulta con el arrastre a tope (grados). */
export const TIRON_MAXIMO = 55;

/**
 * Angulo del brazo (grados, contra las agujas del reloj desde la horizontal).
 * Apuntando se echa atras con la fuerza; al soltar da un latigazo hacia delante
 * (golpea el tope) y vuelve al reposo en ~0,35 s.
 */
export function anguloBrazo(reposo: number, fuerza: number, trasSoltar: number | null): number {
  if (trasSoltar === null) return reposo + Math.min(1, Math.max(0, fuerza)) * TIRON_MAXIMO;
  if (trasSoltar < 0.08) return reposo - 25 * (trasSoltar / 0.08);
  if (trasSoltar < 0.35) return reposo - 25 + 25 * ((trasSoltar - 0.08) / 0.27);
  return reposo;
}

/** Se pinta tumbado si la ventana es mas alta que ancha. */
export const hayQueGirar = (ancho: number, alto: number) => alto > ancho;
