import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../lib/theme';
import { TIPOS_PARADA, type TipoParada } from './tipoParada';

/**
 * El tipo de una parada en el editor (0060): Bar (se sella), Parada de foto u
 * Otra parada. Las dos ultimas salen en el mapa con su horario pero no se
 * sellan ni cuentan para la credencial y las estadisticas.
 */
export function SelectorTipoParada({
  valor,
  onCambiar,
  avisoPerdida = false,
}: {
  valor: TipoParada;
  onCambiar(tipo: TipoParada): void;
  /** Se esta editando un bar que dejaria de serlo: se avisa de lo que se pierde. */
  avisoPerdida?: boolean;
}) {
  return (
    <View style={styles.bloque}>
      <Text style={typography.overline}>Tipo de parada</Text>
      {TIPOS_PARADA.map((t) => {
        const on = t.id === valor;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onCambiar(t.id)}
            style={[styles.opcion, on && styles.opcionOn]}
          >
            <Text style={styles.icono}>{t.icono}</Text>
            <View style={styles.textos}>
              <Text style={styles.nombre}>{t.nombre}</Text>
              <Text style={styles.ayuda}>{t.ayuda}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioPunto} /> : null}</View>
          </Pressable>
        );
      })}
      {avisoPerdida ? (
        <Text style={styles.aviso}>
          Si esta parada ya tenía sellos, al guardar se pierden (con sus puntos). Hazlo antes de que empiece la ruta.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { gap: space.sm },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  opcionOn: { borderColor: colors.ink, borderWidth: 2 },
  icono: { fontSize: 24, width: 32, textAlign: 'center' },
  textos: { flex: 1, gap: 1 },
  nombre: { fontSize: 15, fontWeight: '800', color: colors.ink },
  ayuda: { fontSize: 12, color: colors.inkSoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink },
  radioPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
  aviso: { fontSize: 12.5, color: colors.danger },
});
