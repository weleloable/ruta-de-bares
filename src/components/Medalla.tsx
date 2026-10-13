import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../lib/theme';
import type { NivelMedalla } from '../features/stamps/progreso';

/**
 * Medalla de la credencial: disco con una cana en el centro y dos cintas rojas
 * colgando por detras. Solo Views y un icono, sin imagenes. Tiene tres niveles
 * (bronce, plata y oro, el de siempre; ver `nivelMedalla`) que solo cambian de
 * color. Ocupa `MEDALLA_ANCHO` x `MEDALLA_ALTO` (las cintas sobresalen por
 * debajo) o, con `alto`, ese alto y el ancho que le toque en proporcion: la
 * caja que reserva en el layout ya es la reducida, no solo se dibuja pequena.
 *
 * Esta viva: se balancea despacio colgada de arriba y un destello blanco la
 * cruza cada pocos segundos. Todo con transform y opacidad (useNativeDriver),
 * asi que no pesa. Con "reducir movimiento" activado en el sistema se queda
 * quieta. Con `onPress` es un boton (el de oro abre el diploma); sin el es solo
 * una imagen, como las de bronce y plata, que no llevan a ninguna parte.
 */
export const MEDALLA_ANCHO = 68;
export const MEDALLA_ALTO = 86;
const DISCO = 62;
/** Cuanto dura un balanceo completo de ida y vuelta y cada pausa entre destellos (ms). */
export const PERIODO_BALANCEO = 3200;
export const PAUSA_DESTELLO = 2600;

const PALETAS: Record<NivelMedalla, { disco: string; borde: string; aro: string; aroBorde: string; icono: string }> = {
  oro: { disco: '#E2B53B', borde: '#A87B12', aro: '#EBC55A', aroBorde: '#F6DE8B', icono: '#6B4310' },
  plata: { disco: '#C5CBD3', borde: '#7E8794', aro: '#D6DBE1', aroBorde: '#F0F2F5', icono: '#454D5A' },
  bronce: { disco: '#C58A57', borde: '#8A5326', aro: '#D39B6C', aroBorde: '#EBBF97', icono: '#552E14' },
};

const ETIQUETAS: Record<NivelMedalla, string> = {
  oro: 'Medalla de oro: ruta completa. Toca para ver tu diploma',
  plata: 'Medalla de plata: más de dos tercios de la ruta',
  bronce: 'Medalla de bronce: más de un tercio de la ruta',
};

export function Medalla({
  onPress,
  nivel = 'oro',
  alto = MEDALLA_ALTO,
}: {
  onPress?: () => void;
  nivel?: NivelMedalla;
  alto?: number;
}) {
  const paleta = PALETAS[nivel];
  const escala = alto / MEDALLA_ALTO;
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
    // La caja reducida es la que cuenta en el layout; la medalla entera (68x86)
    // se dibuja dentro y se encoge desde su esquina de arriba a la izquierda.
    <View style={{ width: MEDALLA_ANCHO * escala, height: MEDALLA_ALTO * escala }}>
      <View style={[styles.escalada, { transform: [{ scale: escala }] }]}>
        <Pressable
          accessibilityRole={onPress ? 'button' : 'image'}
          accessibilityLabel={ETIQUETAS[nivel]}
          disabled={!onPress}
          onPress={onPress}
          style={({ pressed }) => [styles.caja, pressed && onPress ? styles.pulsada : null]}
        >
          <Animated.View style={[styles.colgante, { transform: [{ rotate: giro }] }]}>
            <View style={[styles.cinta, { left: 14, transform: [{ rotate: '14deg' }], backgroundColor: colors.stamp }]} />
            <View style={[styles.cinta, { right: 14, transform: [{ rotate: '-14deg' }], backgroundColor: '#7F1F1A' }]} />
            <View style={[styles.disco, { backgroundColor: paleta.disco, borderColor: paleta.borde }]}>
              <View style={[styles.aro, { backgroundColor: paleta.aro, borderColor: paleta.aroBorde }]}>
                <Ionicons name="beer" size={28} color={paleta.icono} />
              </View>
              <Animated.View
                pointerEvents="none"
                style={[styles.destello, { opacity: brilloDestello, transform: [{ translateX: recorridoDestello }, { rotate: '20deg' }] }]}
              />
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  escalada: { position: 'absolute', top: 0, left: 0, width: MEDALLA_ANCHO, height: MEDALLA_ALTO, transformOrigin: 'left top' },
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
    borderWidth: 3,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Una franja blanca inclinada que cruza el disco de lado a lado.
  destello: { position: 'absolute', top: -20, width: 14, height: DISCO + 40, backgroundColor: '#FFFFFF' },
});
