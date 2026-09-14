import { Pressable, StyleSheet, Text, View } from 'react-native';

import { diaCorto, hora } from '../lib/fechas';
import { colors, radius, space, typography } from '../lib/theme';

/**
 * Hueco de sello de la compostelana.
 *
 * Sellado: tinta roja, borde doble y ligeramente torcido, como un sello de
 * caucho. Pendiente: circulo discontinuo con el numero de parada.
 * El giro es deterministico a partir del indice, no aleatorio: un Math.random()
 * aqui recolocaria los sellos en cada render.
 */
export function StampSeal({
  index,
  name,
  stampedAt,
  onPress,
}: {
  index: number;
  name: string;
  stampedAt: Date | null;
  onPress: () => void;
}) {
  const sellado = stampedAt !== null;
  const giro = [-7, 5, -3, 8, -5, 4][index % 6];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        sellado
          ? `${name}, sellado el ${diaCorto(stampedAt)} a las ${hora(stampedAt)}`
          : `${name}, parada ${index + 1}, sin sellar`
      }
      onPress={onPress}
      style={({ pressed }) => [styles.hueco, pressed && styles.huecoPulsado]}
    >
      <View
        style={[
          styles.sello,
          sellado ? styles.selloMarcado : styles.selloVacio,
          sellado && { transform: [{ rotate: `${giro}deg` }] },
        ]}
      >
        {sellado ? (
          <>
            <Text style={styles.selloDia}>{diaCorto(stampedAt)}</Text>
            <View style={styles.selloLinea} />
            <Text style={styles.selloHora}>{hora(stampedAt)}</Text>
          </>
        ) : (
          <Text style={styles.selloNumero}>{index + 1}</Text>
        )}
      </View>
      <Text numberOfLines={2} style={[typography.muted, styles.nombre, sellado && styles.nombreSellado]}>
        {name}
      </Text>
    </Pressable>
  );
}

const TAMANO = 88;

const styles = StyleSheet.create({
  hueco: {
    width: '33.33%',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
    marginBottom: space.xl,
  },
  huecoPulsado: { opacity: 0.7 },
  sello: {
    width: TAMANO,
    height: TAMANO,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selloVacio: {
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    backgroundColor: colors.paperDeep,
  },
  selloMarcado: {
    borderWidth: 3,
    borderColor: colors.stamp,
    backgroundColor: colors.stampSoft,
    gap: 2,
  },
  selloNumero: { fontSize: 26, fontWeight: '700', color: colors.inkFaint },
  selloDia: { fontSize: 13, fontWeight: '800', color: colors.stamp, textTransform: 'uppercase' },
  selloLinea: { height: 1, width: 40, backgroundColor: colors.stamp },
  selloHora: { fontSize: 12, fontWeight: '700', color: colors.stamp },
  nombre: { textAlign: 'center', fontSize: 12 },
  nombreSellado: { color: colors.ink, fontWeight: '600' },
});
