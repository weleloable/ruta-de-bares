import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '../lib/theme';

/**
 * Medalla de credencial completa: disco dorado con una caña en el centro y dos
 * cintas rojas colgando por detras. Solo Views y un icono, sin imagenes.
 * Ocupa `ANCHO` x `ALTO` (las cintas sobresalen por debajo del disco).
 */
export const MEDALLA_ANCHO = 68;
export const MEDALLA_ALTO = 86;
const DISCO = 62;

export function Medalla() {
  return (
    <View
      accessible
      accessibilityLabel="Medalla: ruta completa"
      style={styles.caja}
    >
      <View style={[styles.cinta, { left: 14, transform: [{ rotate: '14deg' }], backgroundColor: colors.stamp }]} />
      <View style={[styles.cinta, { right: 14, transform: [{ rotate: '-14deg' }], backgroundColor: '#7F1F1A' }]} />
      <View style={styles.disco}>
        <View style={styles.aro}>
          <Ionicons name="beer" size={28} color="#6B4310" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { width: MEDALLA_ANCHO, height: MEDALLA_ALTO, alignItems: 'center' },
  cinta: {
    position: 'absolute',
    bottom: 0,
    width: 16,
    height: 34,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  disco: {
    width: DISCO,
    height: DISCO,
    borderRadius: DISCO / 2,
    backgroundColor: '#E2B53B',
    borderWidth: 3,
    borderColor: '#A87B12',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  aro: {
    width: DISCO - 16,
    height: DISCO - 16,
    borderRadius: (DISCO - 16) / 2,
    borderWidth: 1.5,
    borderColor: '#F6DE8B',
    backgroundColor: '#EBC55A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
