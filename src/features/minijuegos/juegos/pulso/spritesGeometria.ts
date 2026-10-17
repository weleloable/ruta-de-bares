// GENERADO por scripts/generar-pulso.py. No editar a mano.
/** Proporciones (ancho / alto) de los dibujos, para reservar su hueco sin medirlos. */
export const PROPORCION_BEBIDA = 160 / 220;
export const PROPORCION_BANDEJA = 560 / 380;
export const PROPORCION_CLIENTE = 159 / 306;
export const PROPORCION_MESA = 360 / 300;
export const PROPORCION_TABURETE = 220 / 320;
export const PROPORCION_ESCENA = 1100 / 330;
export const ESCENA_ANCHO = 1100;
export const FONDO_ALTO = 330;
export const SUELO_ALTO = 330;
/** Entre que alturas (fraccion del dibujo, 0 = arriba) esta el hueco del vaso donde va el liquido. */
export const INTERIOR = {
  chupito: { arriba: 0.5091, abajo: 0.8909 },
  cana: { arriba: 0.2091, abajo: 0.8818 },
  jarra: { arriba: 0.1909, abajo: 0.8818 },
  balon: { arriba: 0.4273, abajo: 0.6727 },
  cocktel: { arriba: 0.2182, abajo: 0.5455 },
  botella: { arriba: 0.5091, abajo: 0.9364 },
} as const;
export const CLIENTES = ['peep-100', 'peep-102', 'peep-13', 'peep-27', 'peep-31', 'peep-34', 'peep-48', 'peep-51', 'peep-54', 'peep-83', 'peep-91', 'peep-93'] as const;
