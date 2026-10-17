import type { ImageSourcePropType } from 'react-native';

import type { Bebida, Ingrediente } from './modelo';
import { CLIENTES } from './spritesGeometria';

/*
 * Los dibujos de Barman Express. Los genera scripts/generar-barman.py en
 * assets/barman/sprites/ (no se editan a mano). Metro necesita cada require con
 * su ruta escrita, por eso estan uno a uno.
 */

const r = (x: unknown) => x as ImageSourcePropType;

export const FONDO = r(require('../../../../../assets/barman/sprites/fondo.jpg'));
export const BARRA = r(require('../../../../../assets/barman/sprites/barra.png'));

export const INGREDIENTE: Record<Ingrediente, ImageSourcePropType> = {
  vaso: r(require('../../../../../assets/barman/sprites/ingredientes/vaso.png')),
  'vaso-grande': r(require('../../../../../assets/barman/sprites/ingredientes/vaso-grande.png')),
  copa: r(require('../../../../../assets/barman/sprites/ingredientes/copa.png')),
  vasito: r(require('../../../../../assets/barman/sprites/ingredientes/vasito.png')),
  grifo: r(require('../../../../../assets/barman/sprites/ingredientes/grifo.png')),
  vino: r(require('../../../../../assets/barman/sprites/ingredientes/vino.png')),
  gaseosa: r(require('../../../../../assets/barman/sprites/ingredientes/gaseosa.png')),
  vermut: r(require('../../../../../assets/barman/sprites/ingredientes/vermut.png')),
  casa: r(require('../../../../../assets/barman/sprites/ingredientes/casa.png')),
  hielo: r(require('../../../../../assets/barman/sprites/ingredientes/hielo.png')),
  'refresco-limon': r(require('../../../../../assets/barman/sprites/ingredientes/refresco-limon.png')),
  naranja: r(require('../../../../../assets/barman/sprites/ingredientes/naranja.png')),
};

/** La bebida despues de `pasos` pasos (1..receta). */
export const BEBIDA: Record<Bebida, readonly ImageSourcePropType[]> = {
  cana: [
    r(require('../../../../../assets/barman/sprites/bebidas/cana-1.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/cana-2.png')),
  ],
  canon: [
    r(require('../../../../../assets/barman/sprites/bebidas/canon-1.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/canon-2.png')),
  ],
  clara: [
    r(require('../../../../../assets/barman/sprites/bebidas/clara-1.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/clara-2.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/clara-3.png')),
  ],
  tinto: [
    r(require('../../../../../assets/barman/sprites/bebidas/tinto-1.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/tinto-2.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/tinto-3.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/tinto-4.png')),
  ],
  vermut: [
    r(require('../../../../../assets/barman/sprites/bebidas/vermut-1.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/vermut-2.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/vermut-3.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/vermut-4.png')),
  ],
  chupito: [
    r(require('../../../../../assets/barman/sprites/bebidas/chupito-1.png')),
    r(require('../../../../../assets/barman/sprites/bebidas/chupito-2.png')),
  ],
};

const CLIENTE_POR_NOMBRE: Record<(typeof CLIENTES)[number], ImageSourcePropType> = {
  'peep-100': r(require('../../../../../assets/barman/sprites/clientes/peep-100.png')),
  'peep-102': r(require('../../../../../assets/barman/sprites/clientes/peep-102.png')),
  'peep-13': r(require('../../../../../assets/barman/sprites/clientes/peep-13.png')),
  'peep-27': r(require('../../../../../assets/barman/sprites/clientes/peep-27.png')),
  'peep-31': r(require('../../../../../assets/barman/sprites/clientes/peep-31.png')),
  'peep-34': r(require('../../../../../assets/barman/sprites/clientes/peep-34.png')),
  'peep-48': r(require('../../../../../assets/barman/sprites/clientes/peep-48.png')),
  'peep-51': r(require('../../../../../assets/barman/sprites/clientes/peep-51.png')),
  'peep-54': r(require('../../../../../assets/barman/sprites/clientes/peep-54.png')),
  'peep-83': r(require('../../../../../assets/barman/sprites/clientes/peep-83.png')),
  'peep-91': r(require('../../../../../assets/barman/sprites/clientes/peep-91.png')),
  'peep-93': r(require('../../../../../assets/barman/sprites/clientes/peep-93.png')),
};

/** El cliente numero `i` de la partida (modelo.ts: 0..11). */
export function cliente(i: number): ImageSourcePropType {
  const nombre = CLIENTES[((i % CLIENTES.length) + CLIENTES.length) % CLIENTES.length] as (typeof CLIENTES)[number];
  return CLIENTE_POR_NOMBRE[nombre];
}
