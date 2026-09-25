import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../lib/theme';

/**
 * Medalla de credencial completa: disco dorado con una cana en el centro y dos
 * cintas rojas colgando por detras. Solo Views y un icono, sin imagenes.
 * Ocupa `MEDALLA_ANCHO` x `MEDALLA_ALTO` (las cintas sobresalen por debajo).
 *
 * Esta viva: se balancea despacio colgada de arriba y un destello blanco la
 * cruza cada pocos segundos. Todo con transform y opacidad (useNativeDriver),
 * asi que no pesa. Con "reducir movimiento" activado en el sistema se queda
 * quieta. Al pulsarla llama a `onPress` (abre el diploma).
 */
export const MEDALLA_ANCHO = 68;
export const MEDALLA_ALTO = 86;
const DISCO = 62;
/** Cuanto dura un balanceo completo de ida y vuelta y cada pausa entre destellos (ms). */
export const PERIODO_BALANCEO = 3200;
export const PAUSA_DESTELLO = 2600;

export function Medalla({ onPress }: { onPress?: () => void }) {
  const balanceo = useRef(new Animated.Value(0)).current;
  const destello = useRef(new Animated.Value(0)).current;
  const [quieta, setQuieta] = useState(false);

  useEffect(() => {
    let vivo = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => vivo && setQuieta(v));
    const suscripcion = AccessibilityInfo.addEventListener('reduceMotionChanged', setQuieta);
    return () => {
      vivo = false;
      suscripcion.remove();
    };
  }, []);

  useEffect(() => {
    if (quieta) {
      balanceo.setValue(0);
      destello.setValue(0);
      return undefined;
    }
    const animacionBalanceo = Animated.loop(
      Animated.sequence([
        Animated.timing(balanceo, {
          toValue: 1,
          duration: PERIODO_BALANCEO / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(balanceo, {
          toValue: -1,
          duration: PERIODO_BALANCEO,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(balanceo, {
          toValue: 0,
          duration: PERIODO_BALANCEO / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const animacionDestello = Animated.loop(
      Animated.sequence([
        Animated.delay(PAUSA_DESTELLO),
        Animated.timing(destello, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(destello, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    animacionBalanceo.start();
    animacionDestello.start();
    return () => {
      animacionBalanceo.stop();
      animacionDestello.stop();
    };
  }, [quieta, balanceo, destello]);

  const giro = balanceo.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] });
  const recorridoDestello = destello.interpolate({ inputRange: [0, 1], outputRange: [-DISCO, DISCO] });
  const brilloDestello = destello.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.75, 0.75, 0] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Medalla: ruta completa. Toca para ver tu diploma"
      onPress={onPress}
      style={({ pressed }) => [styles.caja, pressed && styles.pulsada]}
    >
      <Animated.View style={[styles.colgante, { transform: [{ rotate: giro }] }]}>
        <View style={[styles.cinta, { left: 14, transform: [{ rotate: '14deg' }], backgroundColor: colors.stamp }]} />
        <View style={[styles.cinta, { right: 14, transform: [{ rotate: '-14deg' }], backgroundColor: '#7F1F1A' }]} />
        <View style={styles.disco}>
          <View style={styles.aro}>
            <Ionicons name="beer" size={28} color="#6B4310" />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[styles.destello, { opacity: brilloDestello, transform: [{ translateX: recorridoDestello }, { rotate: '20deg' }] }]}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caja: { width: MEDALLA_ANCHO, height: MEDALLA_ALTO },
  pulsada: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  // Cuelga de arriba: el balanceo gira sobre el centro de su borde superior.
  colgante: { width: MEDALLA_ANCHO, height: MEDALLA_ALTO, alignItems: 'center', transformOrigin: 'center top' },
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
    overflow: 'hidden',
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
  // Una franja blanca inclinada que cruza el disco de lado a lado.
  destello: { position: 'absolute', top: -20, width: 14, height: DISCO + 40, backgroundColor: '#FFFFFF' },
});
