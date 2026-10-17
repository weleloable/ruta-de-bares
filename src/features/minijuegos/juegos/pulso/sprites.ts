import type { ImageSourcePropType } from 'react-native';

import type { TipoBebida } from './modelo';

/*
 * Los dibujos de Pulso de Camarero. Los genera scripts/generar-pulso.py en
 * assets/pulso/sprites/ (no se editan a mano). Metro necesita cada require con su
 * ruta escrita, por eso estan uno a uno; tests/pulso-sprites.test.ts comprueba que
 * esta la lista entera.
 */

const r = (x: unknown) => x as ImageSourcePropType;

export const BANDEJA = r(require('../../../../../assets/pulso/sprites/bandeja.png'));
export const CHARCO = r(require('../../../../../assets/pulso/sprites/charco.png'));
export const GOTA = r(require('../../../../../assets/pulso/sprites/gota.png'));
export const FONDO = r(require('../../../../../assets/pulso/sprites/fondo.jpg'));
export const SUELO = r(require('../../../../../assets/pulso/sprites/suelo.jpg'));
export const MESA = r(require('../../../../../assets/pulso/sprites/mesa.png'));
export const TABURETE = r(require('../../../../../assets/pulso/sprites/taburete.png'));

/** Cada bebida en dos capas del mismo tamano: el liquido (que se recorta por abajo segun el nivel) y el vidrio, encima. */
export const BEBIDA: Record<TipoBebida, { vidrio: ImageSourcePropType; liquido: ImageSourcePropType }> = {
  chupito: {
    vidrio: r(require('../../../../../assets/pulso/sprites/bebidas/chupito-vidrio.png')),
    liquido: r(require('../../../../../assets/pulso/sprites/bebidas/chupito-liquido.png')),
  },
  cana: {
    vidrio: r(require('../../../../../assets/pulso/sprites/bebidas/cana-vidrio.png')),
    liquido: r(require('../../../../../assets/pulso/sprites/bebidas/cana-liquido.png')),
  },
  jarra: {
    vidrio: r(require('../../../../../assets/pulso/sprites/bebidas/jarra-vidrio.png')),
    liquido: r(require('../../../../../assets/pulso/sprites/bebidas/jarra-liquido.png')),
  },
  balon: {
    vidrio: r(require('../../../../../assets/pulso/sprites/bebidas/balon-vidrio.png')),
    liquido: r(require('../../../../../assets/pulso/sprites/bebidas/balon-liquido.png')),
  },
  cocktel: {
    vidrio: r(require('../../../../../assets/pulso/sprites/bebidas/cocktel-vidrio.png')),
    liquido: r(require('../../../../../assets/pulso/sprites/bebidas/cocktel-liquido.png')),
  },
  botella: {
    vidrio: r(require('../../../../../assets/pulso/sprites/bebidas/botella-vidrio.png')),
    liquido: r(require('../../../../../assets/pulso/sprites/bebidas/botella-liquido.png')),
  },
};

const CLIENTES_IMG: readonly ImageSourcePropType[] = [
  r(require('../../../../../assets/pulso/sprites/clientes/peep-100.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-102.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-13.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-27.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-31.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-34.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-48.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-51.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-54.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-83.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-91.png')),
  r(require('../../../../../assets/pulso/sprites/clientes/peep-93.png')),
];

/** El cliente `n` (da la vuelta: cualquier entero vale). */
export const cliente = (n: number): ImageSourcePropType => CLIENTES_IMG[((n % CLIENTES_IMG.length) + CLIENTES_IMG.length) % CLIENTES_IMG.length] as ImageSourcePropType;
