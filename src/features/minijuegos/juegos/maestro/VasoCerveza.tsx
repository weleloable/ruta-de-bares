import { Image, type ImageSourcePropType } from 'react-native';

import type { MaltaId } from './datos';

/**
 * Los `require` van con ruta literal porque Metro los resuelve al empaquetar:
 * no admite rutas calculadas. Un fichero por malta, en assets/vasos/, generado
 * por scripts/generar-vasos-cerveza.py. tests/vasos-cerveza.test.ts vigila que
 * cada malta de datos.ts tenga el suyo.
 */
const VASOS: Readonly<Record<MaltaId, ImageSourcePropType>> = {
  palida: require('../../../../../assets/vasos/palida.png'),
  caramelo: require('../../../../../assets/vasos/caramelo.png'),
  tostada: require('../../../../../assets/vasos/tostada.png'),
  negra: require('../../../../../assets/vasos/negra.png'),
};

/**
 * Vaso de la cerveza, segun su malta (es lo que decide el color y la forma).
 * `malta` llega como string desde la base de datos (`maestro_beers.malta`): una
 * que no se conoce, por un dato roto o una malta futura, pinta la palida en vez
 * de dejar un hueco.
 *
 * `ancho` x `alto` es la caja; la imagen se ajusta dentro sin deformarse, asi
 * que cada vaso conserva su forma aunque las cajas sean iguales.
 */
export function VasoCerveza({
  malta,
  alto = 130,
  ancho = 80,
}: {
  malta: MaltaId | string | null;
  alto?: number;
  ancho?: number;
}) {
  const fuente = VASOS[malta as MaltaId] ?? VASOS.palida;
  return (
    <Image
      source={fuente}
      resizeMode="contain"
      style={{ width: ancho, height: alto }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
