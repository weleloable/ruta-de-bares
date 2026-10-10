import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../../../../lib/theme';
import type { Zona } from './maceracion';

/**
 * Termometro vertical de Maestro Cervecero: un carril con la zona buena en
 * verde, una aguja en la temperatura y los grados al lado. Lo usan la
 * maceracion (zona 63-68) y la siembra (la ventana de la levadura).
 *
 * `alto` lo pone quien lo usa: se encoge con la olla para que el paso quepa
 * en la pantalla (ver `escalaOlla`). Los grados se salen a la DERECHA del
 * carril: quien lo coloque tiene que dejar sitio (unos 64 px).
 */
export function Termometro({
  temp,
  min,
  max,
  zona,
  alto,
}: {
  temp: number;
  /** Temperatura de abajo y de arriba del carril. */
  min: number;
  max: number;
  zona: Zona;
  alto: number;
}) {
  const pos = (t: number) => ((Math.min(Math.max(t, min), max) - min) / (max - min)) * alto;
  const enZona = temp >= zona.min && temp <= zona.max;
  return (
    <View style={[styles.carril, { height: alto }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.zona, { bottom: pos(zona.min), height: pos(zona.max) - pos(zona.min) }]} />
      <View style={[styles.aguja, { bottom: pos(temp) - AGUJA / 2 }, enZona && styles.agujaBien]} />
      <Text style={[styles.grados, { bottom: pos(temp) - 10 }]}>{Math.round(temp)} °C</Text>
    </View>
  );
}

const AGUJA = 26;

const styles = StyleSheet.create({
  carril: {
    width: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    // El texto de grados se sale a la derecha del carril.
    overflow: 'visible',
  },
  zona: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.green, opacity: 0.55, borderRadius: radius.sm },
  aguja: {
    position: 'absolute',
    left: 3,
    width: AGUJA,
    height: AGUJA,
    borderRadius: AGUJA / 2,
    backgroundColor: colors.stamp,
    borderWidth: 3,
    borderColor: colors.white,
  },
  agujaBien: { backgroundColor: colors.green },
  grados: { position: 'absolute', left: 44, fontSize: 16, fontWeight: '800', color: colors.ink, width: 70 },
});
