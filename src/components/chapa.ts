/**
 * Medidas de la chapa del sello (assets/marca/chapa.png), sin react-native para
 * probarlas en Node. La imagen es el dibujo del usuario tal cual, con el blanco
 * pasado a transparente: mide 350 px, el aro exterior 250 px de diametro y el
 * hueco interior 202 px. Se escala para que ese hueco encaje justo con el logo.
 */
export const LADO_IMAGEN_ORIGINAL = 350;
export const HUECO_ORIGINAL = 202;
export const ANILLO_EXTERIOR_ORIGINAL = 250;

/** Lado (px) que hay que dar a la imagen para que su hueco mida `tamanoLogo`. */
export function ladoChapa(tamanoLogo: number): number {
  return (LADO_IMAGEN_ORIGINAL * tamanoLogo) / HUECO_ORIGINAL;
}

/** Diametro (px) que ocupa lo dibujado (el aro exterior), ya escalado. */
export function diametroExteriorChapa(tamanoLogo: number): number {
  return (ANILLO_EXTERIOR_ORIGINAL * tamanoLogo) / HUECO_ORIGINAL;
}

/** Lo que la chapa sobresale del logo por cada lado (px). */
export function sobresaleChapa(tamanoLogo: number): number {
  return (diametroExteriorChapa(tamanoLogo) - tamanoLogo) / 2;
}
