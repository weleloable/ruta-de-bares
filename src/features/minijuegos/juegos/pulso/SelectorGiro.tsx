import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { colors, radius, typography } from '../../../../lib/theme';

/** Hasta donde llega el deslizador a cada lado (grados). Mas que esto no hace falta para enderezar la bandeja. */
export const GIRO_MAX_DESLIZADOR = 45;

/**
 * El deslizador de respaldo cuando no hay sensor (PC, web sin https, permiso
 * denegado). A diferencia del de La Caña (SelectorAngulo, que solo da un lado),
 * este tiene el CERO en el CENTRO: a la izquierda inclina el movil a la
 * izquierda (-) y a la derecha, a la derecha (+). El hijo no recibe toques para
 * que `locationX` sea siempre el del carril y no el de la bolita.
 */
export function SelectorGiro({ valor, onChange }: { valor: number; onChange: (grados: number) => void }) {
  const [ancho, setAncho] = useState(0);

  const mover = (e: GestureResponderEvent) => {
    if (ancho <= 0) return;
    const fraccion = Math.min(Math.max(e.nativeEvent.locationX / ancho, 0), 1);
    onChange((fraccion * 2 - 1) * GIRO_MAX_DESLIZADOR);
  };

  const fraccion = Math.min(Math.max((valor / GIRO_MAX_DESLIZADOR + 1) / 2, 0), 1);

  return (
    <View style={styles.raiz}>
      <Text style={typography.muted}>
        Móvil: {valor > 0.5 ? 'a la derecha' : valor < -0.5 ? 'a la izquierda' : 'recto'} · {Math.round(Math.abs(valor))}°
      </Text>
      <View
        testID="pulso-selector"
        accessibilityRole="adjustable"
        accessibilityLabel="Inclinación del móvil"
        accessibilityValue={{ min: -GIRO_MAX_DESLIZADOR, max: GIRO_MAX_DESLIZADOR, now: Math.round(valor) }}
        onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={mover}
        onResponderMove={mover}
        onResponderTerminationRequest={() => false}
        style={styles.zona}
      >
        <View pointerEvents="none" style={styles.carril}>
          <View style={styles.centro} />
        </View>
        <View pointerEvents="none" style={[styles.bolita, { left: fraccion * Math.max(ancho - BOLITA, 0) }]} />
      </View>
    </View>
  );
}

const BOLITA = 40;

const styles = StyleSheet.create({
  raiz: { gap: 2 },
  zona: { height: 52, justifyContent: 'center' },
  carril: { height: 10, borderRadius: radius.pill, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  centro: { width: 3, height: 18, backgroundColor: colors.inkSoft, borderRadius: 2 },
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
