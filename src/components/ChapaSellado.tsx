import { Image, StyleSheet, View } from 'react-native';

import { colors } from '../lib/theme';
import { ladoChapa } from './chapa';

/**
 * Chapa de botellin verde alrededor del logo de un bar sellado: es la marca de
 * "validado". La imagen es el dibujo del usuario tal cual (assets/marca/chapa.png,
 * el JPG con el blanco pasado a transparente) y se tine con `tintColor`, asi que
 * el color se cambia aqui sin tocar el archivo. Se centra sobre el logo y
 * sobresale unos 10 px por cada lado; el hueco de dentro es transparente y deja
 * ver el logo.
 *
 * Solo decoracion (`pointerEvents="none"`): el estado ya va en la etiqueta de
 * accesibilidad del hueco.
 */
export function ChapaSellado({ tamanoLogo }: { tamanoLogo: number }) {
  const lado = ladoChapa(tamanoLogo);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.capa,
        { width: lado, height: lado, top: (tamanoLogo - lado) / 2, left: (tamanoLogo - lado) / 2 },
      ]}
    >
      <Image
        source={require('../../assets/marca/chapa.png')}
        style={{ width: lado, height: lado, tintColor: colors.green }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  capa: { position: 'absolute' },
});
