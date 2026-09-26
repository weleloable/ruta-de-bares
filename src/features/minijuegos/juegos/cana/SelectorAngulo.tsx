import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { colors, radius, space, typography } from '../../../../lib/theme';
import { ANGULO_MAX } from './inclinacion';

/**
 * Deslizador grande para quien no tiene acelerometro. Hecho a mano (sin
 * dependencia): el hijo no recibe toques para que `locationX` sea siempre el
 * del carril y no el de la bolita.
 */
export function SelectorAngulo({ valor, onChange }: { valor: number; onChange: (grados: number) => void }) {
  const [ancho, setAncho] = useState(0);

  const mover = (e: GestureResponderEvent) => {
    if (ancho <= 0) return;
    onChange((e.nativeEvent.locationX / ancho) * ANGULO_MAX);
  };

  const fraccion = Math.min(Math.max(valor / ANGULO_MAX, 0), 1);

  return (
    <View style={styles.raiz}>
      <Text style={typography.muted}>Inclinación: {Math.round(valor)}°</Text>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Inclinación del vaso"
        accessibilityValue={{ min: 0, max: ANGULO_MAX, now: Math.round(valor) }}
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={mover}
        onResponderMove={mover}
        style={styles.zona}
      >
        <View pointerEvents="none" style={styles.carril}>
          <View style={[styles.relleno, { width: `${fraccion * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.bolita, { left: fraccion * Math.max(ancho - BOLITA, 0) }]} />
      </View>
    </View>
  );
}

const BOLITA = 40;

const styles = StyleSheet.create({
  raiz: { gap: space.xs },
  // Zona de toque alta (52) para acertar con el pulgar; el carril visible es fino.
  zona: { height: 52, justifyContent: 'center' },
  carril: { height: 10, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  relleno: { height: 10, backgroundColor: colors.beer },
  bolita: {
    position: 'absolute',
    width: BOLITA,
    height: BOLITA,
    borderRadius: BOLITA / 2,
    backgroundColor: colors.beerDark,
    borderWidth: 3,
    borderColor: colors.white,
  },
});
