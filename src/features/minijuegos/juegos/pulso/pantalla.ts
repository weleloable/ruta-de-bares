/**
 * Como se reparte la pantalla de Pulso de Camarero (vertical, a pantalla
 * completa). Puro y con tests: cabe sin scroll a 740, 808 y 915 px de alto y a
 * 360 de ancho, y no se pasa de grande en una tablet o un PC.
 *
 * De arriba abajo: cabecera (ronda, liquido, salir), el bar visto desde los ojos
 * del camarero y la bandeja. El bar se queda con ~47 % de lo que queda tras la
 * cabecera y la bandeja con el resto; la bandeja se dibuja lo bastante pequena
 * para que, girada hasta `INCLINACION_DIBUJO`, no se salga por los lados.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

export const MARGEN = 16;
export const ANCHO_MAXIMO = 480;
export const ALTO_CABECERA = 44;
/** La bandeja se dibuja hasta este angulo (grados): mas alla se queda quieta aunque el modelo siga inclinando. */
export const INCLINACION_DIBUJO = 35;
/** Proporcion alto / ancho del dibujo de la bandeja (560 x 380, con las manos): un test comprueba que es la de spritesGeometria.ts. */
export const RELACION_BANDEJA = 380 / 560;
const FRACCION_BAR = 0.47;
const ALTO_BAR_MINIMO = 150;
const ALTO_BAR_MAXIMO = 420;

/** Proporcion ancho / alto de los dibujos de las bebidas (spritesGeometria.ts: un test comprueba que es la misma). */
export const PROPORCION_BEBIDA = 160 / 220;
/** Cuanto mide cada bebida respecto a la referencia (la jarra): el chupito es bajito, la botella alta. */
export const TAMANO_BEBIDA: Readonly<Record<string, number>> = {
  chupito: 0.7,
  cana: 0.95,
  jarra: 1,
  balon: 0.95,
  cocktel: 1,
  botella: 1.12,
};

/** Lo que mas pequena se ve una bebida de la fila de atras (esta mas lejos del camarero). */
export const ESCALA_ATRAS = 0.84;

export type Hueco = { x: number; y: number; ancho: number; alto: number; fila: 0 | 1 };

/**
 * Donde va cada bebida sobre la bandeja (px dentro de ella), VISTA POR EL CAMARERO que la
 * lleva: dos filas en perspectiva. La de atras queda mas arriba, mas pequena (`ESCALA_ATRAS`) y en
 * un tramo mas estrecho, porque esta mas lejos; la de delante, mas abajo y grande, y la tapa un
 * poco. Las primeras `n / 2` van detras y las demas delante, centradas. Cada una se ancla por su
 * BASE y es tan alta como deja la fila, sin salirse de la bandeja ni pisar a la de al lado.
 */
export function colocarBebidas(tipos: readonly string[], anchoBandeja: number, altoBandeja: number): Hueco[] {
  const n = tipos.length;
  const atras = Math.floor(n / 2);
  const filas: number[][] = [[], []];
  tipos.forEach((_, i) => (filas[i < atras ? 0 : 1] as number[]).push(i));
  const huecos: Hueco[] = new Array(n);
  const maxFila = Math.max(filas[0]?.length ?? 0, filas[1]?.length ?? 0, 1);
  // El tramo de cada fila: la de atras esta mas lejos, asi que la bandeja es mas estrecha ahi.
  const tramo = (f: number) => (f === 0 ? [0.17, 0.83] : [0.08, 0.92]) as [number, number];
  const celdaFrente = (anchoBandeja * (tramo(1)[1] - tramo(1)[0])) / maxFila;
  const altoRef = Math.min(altoBandeja * 0.46, (celdaFrente / PROPORCION_BEBIDA) * 1.05);
  filas.forEach((indices, f) => {
    const base = altoBandeja * (f === 0 ? 0.42 : 0.745);
    const escala = f === 0 ? ESCALA_ATRAS : 1;
    const celda = (anchoBandeja * (tramo(f)[1] - tramo(f)[0])) / maxFila;
    const total = indices.length * celda;
    const inicio = anchoBandeja / 2 - total / 2;
    indices.forEach((i, k) => {
      const t = TAMANO_BEBIDA[tipos[i] as string] ?? 1;
      const alto = altoRef * t * escala;
      const ancho = Math.min(alto * PROPORCION_BEBIDA, celda * 0.98);
      huecos[i] = { x: inicio + k * celda + (celda - ancho) / 2, y: base - ancho / PROPORCION_BEBIDA, ancho, alto: ancho / PROPORCION_BEBIDA, fila: f as 0 | 1 };
    });
  });
  return huecos;
}

export type Reparto = {
  ancho: number;
  alturaBar: number;
  /** Lo que mide la zona de la bandeja entera (el alto que queda). */
  alturaBandeja: number;
  /** Ancho al que se dibuja la bandeja: el mayor que, inclinada `INCLINACION_DIBUJO`, cabe en `ancho` y en `alturaBandeja`. */
  bandejaAncho: number;
  bandejaAlto: number;
  total: number;
  cabe: boolean;
};

/**
 * @param anchoVentana ancho disponible (px)
 * @param altoVentana alto disponible, ya sin los margenes del sistema (px)
 */
export function repartir(anchoVentana: number, altoVentana: number): Reparto {
  const ancho = Math.min(anchoVentana, ANCHO_MAXIMO);
  const resto = Math.max(altoVentana - ALTO_CABECERA, 0);
  const alturaBar = Math.round(Math.min(ALTO_BAR_MAXIMO, Math.max(ALTO_BAR_MINIMO, resto * FRACCION_BAR)));
  const alturaBandeja = resto - alturaBar;
  const a = (INCLINACION_DIBUJO * Math.PI) / 180;
  // Girada `a`: ancho' = w (cos a + r sin a) y alto' = w (sin a + r cos a), con r = alto / ancho.
  const factorAncho = Math.cos(a) + RELACION_BANDEJA * Math.sin(a);
  const factorAlto = Math.sin(a) + RELACION_BANDEJA * Math.cos(a);
  const bandejaAncho = Math.floor(Math.min((ancho - 2 * MARGEN) / factorAncho, (alturaBandeja - 8) / factorAlto));
  const total = ALTO_CABECERA + alturaBar + alturaBandeja;
  return {
    ancho,
    alturaBar,
    alturaBandeja,
    bandejaAncho,
    bandejaAlto: Math.round(bandejaAncho * RELACION_BANDEJA),
    total,
    cabe: bandejaAncho >= 180 && total <= altoVentana,
  };
}
