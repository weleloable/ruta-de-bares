import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BarLogo } from '../features/routes/BarLogo';
import { diaCorto, hora } from '../lib/fechas';
import { colors, radius, space, typography } from '../lib/theme';

/** Transparencia del sello de un bar sin sellar: 70 % transparente = 30 % de opacidad. */
export const OPACIDAD_SELLO_PENDIENTE = 0.3;
/** Giro del "APPROVED" del sello estampado. Negativo = contra las agujas, como un sello de caucho. */
export const GIRO_APPROVED_GRADOS = -30;

/**
 * Hueco de sello de la compostelana.
 *
 * Pendiente: el logo del bar, muy transparente, como el hueco de un sello que
 * aun no se ha estampado. Sellado: el logo con toda su tinta y encima un
 * "APPROVED" verde girado. La fecha y la hora del sellado ya no se pintan aqui;
 * salen al tocar el sello (StampSheet) y en la etiqueta de accesibilidad.
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
        {sellado ? (
          <View pointerEvents="none" style={styles.capaAprobado}>
            <View style={[styles.aprobado, { transform: [{ rotate: `${GIRO_APPROVED_GRADOS}deg` }] }]}>
              <Text style={styles.aprobadoTexto}>APPROVED</Text>
            </View>
          </View>
        ) : null}
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
  capaAprobado: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fondo casi opaco para que el texto verde se lea encima de cualquier logo,
  // claro u oscuro.
  aprobado: {
    borderWidth: 2,
    borderColor: colors.green,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 253, 248, 0.88)',
  },
  aprobadoTexto: { fontSize: 12, fontWeight: '900', letterSpacing: 1, color: colors.green },
  nombre: { textAlign: 'center', fontSize: 12 },
  nombreSellado: { color: colors.ink, fontWeight: '600' },
});
