import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../lib/theme';

export type OpcionDesplegable<T extends string | number> = { valor: T; etiqueta: string };

/**
 * Desplegable de una sola eleccion, con la lista abierta en linea (sin Modal ni
 * picker nativo, que se comportan distinto en web, iOS y Android). Para listas
 * cortas. SelectorBar hace lo mismo para los bares porque ahi cada fila lleva
 * logo.
 */
export function Desplegable<T extends string | number>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  opciones: readonly OpcionDesplegable<T>[];
  valor: T;
  onCambiar: (nuevo: T) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const elegida = opciones.find((o) => o.valor === valor);

  return (
    <View style={styles.bloque}>
      <Text style={typography.overline}>{etiqueta}</Text>
      <View style={styles.caja}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: abierto }}
          accessibilityLabel={`${etiqueta}: ${elegida?.etiqueta ?? 'sin elegir'}. Cambiar`}
          onPress={() => setAbierto((v) => !v)}
          style={styles.cabecera}
        >
          <Text style={[typography.body, styles.valor]}>{elegida?.etiqueta ?? 'Elige una opcion'}</Text>
          <Text style={styles.flecha}>{abierto ? '▴' : '▾'}</Text>
        </Pressable>

        {abierto
          ? opciones.map((opcion) => {
              const activa = opcion.valor === valor;
              return (
                <Pressable
                  key={String(opcion.valor)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activa }}
                  onPress={() => {
                    onCambiar(opcion.valor);
                    setAbierto(false);
                  }}
                  style={({ pressed }) => [styles.opcion, activa && styles.opcionActiva, pressed && styles.opcionPulsada]}
                >
                  <Text style={[typography.body, activa && styles.textoActivo]}>{opcion.etiqueta}</Text>
                </Pressable>
              );
            })
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: { gap: space.xs },
  caja: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  valor: { flex: 1 },
  flecha: { fontSize: 16, color: colors.inkSoft },
  opcion: { padding: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  opcionActiva: { backgroundColor: colors.paperDeep },
  opcionPulsada: { backgroundColor: colors.paper },
  textoActivo: { fontWeight: '700' },
});
