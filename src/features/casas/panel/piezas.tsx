import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius, space } from '../../../lib/theme';

/** Fila de opciones (una marcada), con desplazamiento horizontal si no cabe. */
export function Chips<T extends string>({
  opciones,
  elegida,
  onElegir,
}: {
  opciones: readonly { id: T; texto: string }[];
  elegida: T | null;
  onElegir(id: T): void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
      {opciones.map((o) => {
        const on = o.id === elegida;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onElegir(o.id)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.texto, on && styles.textoOn]}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  fila: { gap: space.xs, paddingVertical: 2 },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  texto: { fontSize: 13, fontWeight: '600', color: colors.ink },
  textoOn: { color: colors.white },
});
