/**
 * Como se reparte la pantalla de Barman Express (vertical, a pantalla completa).
 * Puro y con tests: cabe sin scroll en 740, 808 y 915 px de alto y en 360 de
 * ancho, y no se pasa de grande en una tablet o un PC.
 *
 * De arriba abajo: cabecera, cola (2 clientes pequenos), el cliente actual con
 * su paciencia (lo que sobra es para el), la comanda, la bebida sobre la barra
 * y los 12 ingredientes en 4 x 3. Todo lo fijo se calcula; el cliente se queda
 * con el resto.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

export const MARGEN = 16;
export const HUECO = 8;
export const ANCHO_MAXIMO = 480;
export const ALTO_CABECERA = 44;
export const ALTO_COLA = 52;
export const ALTO_COMANDA = 64;
/** El boton mas pequeno que se admite (lo comodo para un dedo) y el mas grande. */
export const LADO_MINIMO_BOTON = 44;
export const BOTON_ALTO_MAXIMO = 86;
/** El cliente actual: ni tan pequeno que no se vea, ni tan grande que se coma la pantalla. */
export const CLIENTE_MINIMO = 64;
export const CLIENTE_MAXIMO = 230;

export type Reparto = {
  ancho: number;
  botonAncho: number;
  botonAlto: number;
  icono: number;
  alturaBebida: number;
  alturaCliente: number;
  /** Lo que mide todo, de arriba abajo, sin contar los margenes del sistema. */
  total: number;
  cabe: boolean;
};

/**
 * @param anchoVentana ancho disponible (px)
 * @param altoVentana alto disponible, ya sin los margenes del sistema (px)
 */
export function repartir(anchoVentana: number, altoVentana: number): Reparto {
  const ancho = Math.min(anchoVentana, ANCHO_MAXIMO) - 2 * MARGEN;
  const botonAncho = Math.floor((ancho - 3 * HUECO) / 4);
  const botonAlto = Math.max(LADO_MINIMO_BOTON, Math.min(Math.round(botonAncho * 0.84), BOTON_ALTO_MAXIMO));
  const icono = Math.floor(Math.min(botonAlto - 22, botonAncho - 14));
  const rejilla = 3 * botonAlto + 2 * HUECO;
  const alturaBebida = Math.round(Math.min(130, Math.max(90, altoVentana * 0.13)));
  // Huecos entre las 6 franjas, y un margen arriba y abajo.
  const fijo = HUECO + ALTO_CABECERA + ALTO_COLA + ALTO_COMANDA + alturaBebida + rejilla + 6 * HUECO + HUECO;
  const libre = altoVentana - fijo;
  const alturaCliente = Math.max(CLIENTE_MINIMO, Math.min(CLIENTE_MAXIMO, libre));
  const total = fijo + alturaCliente;
  return {
    ancho,
    botonAncho,
    botonAlto,
    icono,
    alturaBebida,
    alturaCliente,
    total,
    cabe: total <= altoVentana && botonAncho >= LADO_MINIMO_BOTON && botonAlto >= LADO_MINIMO_BOTON,
  };
}
