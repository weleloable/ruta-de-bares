import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BarLogo } from '../features/routes/BarLogo';
import { diaCorto, hora } from '../lib/fechas';
import { colors, space, typography } from '../lib/theme';
import { ChapaSellado } from './ChapaSellado';
import { sobresaleChapa } from './chapa';

/** Opacidad del sello de un bar sin sellar: 0.5 = 50 % transparente. */
export const OPACIDAD_SELLO_PENDIENTE = 0.5;

/**
 * Hueco de sello de la compostelana.
 *
 * Pendiente: el logo del bar, transparente, como el hueco de un sello que aun no
 * se ha estampado. Sellado: el logo con toda su tinta y, alrededor, una chapa de
 * botellin verde (ChapaSellado). La fecha y la hora del sellado no se pintan
 * aqui; salen al tocar el sello (StampSheet) y en la etiqueta de accesibilidad.
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
      <View style={styles.sello}>
        <View style={{ opacity: sellado ? 1 : OPACIDAD_SELLO_PENDIENTE }}>
          <BarLogo nombre={name} tamano={TAMANO} />
        </View>
        {sellado ? <ChapaSellado tamanoLogo={TAMANO} /> : null}
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
  sello: { width: TAMANO, height: TAMANO },
  // La chapa sobresale ~10 px por debajo del logo: el margen deja sitio al
  // nombre. Va en TODOS los huecos y no solo en los sellados, o la fila se
  // desalinea.
  nombre: { textAlign: 'center', fontSize: 12, marginTop: Math.max(0, Math.round(sobresaleChapa(TAMANO)) - 4) },
  nombreSellado: { color: colors.ink, fontWeight: '600' },
});
