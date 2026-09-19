import type { ImageSourcePropType } from 'react-native';

/**
 * Logo de cada bar del catalogo, por id. Los `require` van con ruta literal
 * porque Metro los resuelve al empaquetar: no admite rutas calculadas.
 *
 * Separado de catalogo.ts porque los tests cargan ese en Node, que no sabe
 * abrir un .png. logos.test.ts vigila que catalogo, este mapa y assets/bares/
 * no se desincronicen.
 */
export const LOGOS: Readonly<Record<string, ImageSourcePropType>> = {
  'quinto-tapon': require('../../../assets/bares/quinto-tapon.png'),
  'el-hidalgo': require('../../../assets/bares/el-hidalgo.png'),
  anexo: require('../../../assets/bares/anexo.png'),
  astures: require('../../../assets/bares/astures.png'),
  'la-oveja-negra': require('../../../assets/bares/la-oveja-negra.png'),
  lola: require('../../../assets/bares/lola.png'),
  wheelans: require('../../../assets/bares/wheelans.png'),
  retintas: require('../../../assets/bares/retintas.png'),
  lucrecia: require('../../../assets/bares/lucrecia.png'),
  'green-factory': require('../../../assets/bares/green-factory.png'),
  panaderia: require('../../../assets/bares/panaderia.png'),
  'la-magistral': require('../../../assets/bares/la-magistral.png'),
  'la-ruina': require('../../../assets/bares/la-ruina.png'),
  karaoke: require('../../../assets/bares/karaoke.png'),
};
