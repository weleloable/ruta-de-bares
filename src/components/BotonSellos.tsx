import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../lib/theme';

/**
 * El boton de la pestana Sellos en la barra de abajo: un disco redondo del
 * color de marca que sobresale por encima de la barra. Sellos es la pantalla
 * importante (la que se abre en la calle) y la tercera de cinco, o sea, el
 * centro. Se enchufa con `tabBarButton` en app/(tabs)/_layout.tsx.
 *
 * Esta SIEMPRE destacado, aunque no sea la pestana activa; la activa se nota en
 * la etiqueta (en color y negrita) y en un aro alrededor del disco.
 */
export function BotonSellos({
  onPress,
  onLongPress,
  seleccionada,
  etiqueta,
  testID,
}: {
  onPress?: ComponentProps<typeof Pressable>['onPress'];
  onLongPress?: ComponentProps<typeof Pressable>['onLongPress'];
  seleccionada: boolean;
  etiqueta?: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: seleccionada }}
      accessibilityLabel={etiqueta ?? 'Sellos'}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.celda}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.disco, seleccionada && styles.discoActivo, pressed && styles.discoPulsado]}>
            <Ionicons name="ribbon" size={28} color={colors.white} />
          </View>
          <Text style={[styles.etiqueta, seleccionada && styles.etiquetaActiva]}>Sellos</Text>
        </>
      )}
    </Pressable>
  );
}

const DISCO = 56;

const styles = StyleSheet.create({
  celda: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  disco: {
    width: DISCO,
    height: DISCO,
    borderRadius: DISCO / 2,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.stamp,
    // El borde del color de la barra "recorta" el disco y lo separa de ella.
    borderWidth: 4,
    borderColor: colors.card,
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  // Pestana activa: un aro del color de marca alrededor del borde claro.
  discoActivo: { borderColor: colors.stampSoft, shadowOpacity: 0.4 },
  discoPulsado: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  etiqueta: { marginTop: 0, fontSize: 11, fontWeight: '700', color: colors.stamp },
  etiquetaActiva: { fontWeight: '900' },
});
