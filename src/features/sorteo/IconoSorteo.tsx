import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';

/**
 * El icono del sorteo, como un sello de la credencial: circulo de cerveza
 * clara con borde punteado de tinta y la camiseta dentro. Si has ganado, el
 * sello va en rojo con un trofeo. Sustituye al emoji 🎽, que no pegaba.
 */
export function IconoSorteo({ tamano = 22, ganaste = false }: { tamano?: number; ganaste?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.sello,
        {
          width: tamano,
          height: tamano,
          borderRadius: tamano / 2,
          borderWidth: Math.max(1, Math.round(tamano / 18)),
        },
        ganaste ? styles.selloGanaste : null,
      ]}
    >
      <Ionicons name={ganaste ? 'trophy' : 'shirt'} size={Math.round(tamano * 0.56)} color={ganaste ? colors.white : colors.beerDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  sello: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.beerSoft,
    borderColor: colors.beerDark,
    borderStyle: 'dashed',
  },
  selloGanaste: { backgroundColor: colors.stamp, borderColor: colors.white },
});
