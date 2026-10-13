import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { CASAS, type IdCasa } from './casas';

// Versiones oficiales locales y fondos para sus originales en blanco.
const MARCAS = {
  mahou: { archivo: require('../../../assets/casas/mahou.png'), fondo: '#B71932', ancho: 54, alto: 24 },
  estrella: { archivo: require('../../../assets/casas/estrella.svg'), fondo: 'transparent', ancho: 58, alto: 58 },
  alhambra: { archivo: require('../../../assets/casas/alhambra.svg'), fondo: '#18583D', ancho: 54, alto: 38 },
  cruzcampo: { archivo: require('../../../assets/casas/cruzcampo.svg'), fondo: '#A14D20', ancho: 56, alto: 20 },
} as const;

export function LogoCasa({ casa }: { casa: IdCasa }) {
  const marca = MARCAS[casa];
  return (
    <View style={[styles.marco, { backgroundColor: marca.fondo }]}>
      <Image
        source={marca.archivo}
        contentFit="contain"
        accessibilityLabel={`Logo de ${CASAS[casa].nombre}`}
        style={{ width: marca.ancho, height: marca.alto }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  marco: { width: 64, height: 54, borderRadius: 3, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
