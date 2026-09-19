import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../lib/theme';
import { BarLogo } from './BarLogo';
import { direccionVisible, type BarCatalogo } from './catalogo';

type Elegido = { name: string; address: string };

/**
 * Desplegable de bares del catalogo. React Native no tiene <select>, y un
 * Modal o un picker nativo se comportan distinto en web, iOS y Android; una
 * lista que se abre en linea se ve y se toca igual en los tres.
 *
 * `elegido` es lo que se pinta en la cabecera y puede no estar en `opciones`
 * (un bar creado antes del catalogo): por eso no se deduce de `seleccionadoId`.
 * `ocupados` son ids ya usados en la ruta: se ven pero no se pueden elegir.
 */
export function SelectorBar({
  opciones,
  elegido,
  seleccionadoId,
  ocupados,
  onElegir,
}: {
  opciones: readonly BarCatalogo[];
  elegido: Elegido | null;
  seleccionadoId: string | null;
  ocupados: ReadonlySet<string>;
  onElegir: (bar: BarCatalogo) => void;
}) {
  const [abierto, setAbierto] = useState(elegido === null);

  return (
    <View style={styles.caja}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel={elegido ? `Bar elegido: ${elegido.name}. Cambiar` : 'Elegir un bar'}
        onPress={() => setAbierto((v) => !v)}
        style={styles.cabecera}
      >
        {elegido ? (
          <>
            <BarLogo nombre={elegido.name} />
            <View style={styles.texto}>
              <Text style={typography.cardTitle}>{elegido.name}</Text>
              {direccionVisible(elegido.address).length > 0 ? (
                <Text style={typography.muted} numberOfLines={1}>
                  {direccionVisible(elegido.address)}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={[typography.body, styles.placeholder]}>Elige un bar de la lista</Text>
        )}
        <Text style={styles.flecha}>{abierto ? '▴' : '▾'}</Text>
      </Pressable>

      {abierto ? (
        <ScrollView style={styles.lista} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {opciones.map((bar) => {
            const ocupado = ocupados.has(bar.id);
            const activo = bar.id === seleccionadoId;
            return (
              <Pressable
                key={bar.id}
                accessibilityRole="button"
                accessibilityState={{ selected: activo, disabled: ocupado }}
                disabled={ocupado}
                onPress={() => {
                  onElegir(bar);
                  setAbierto(false);
                }}
                style={({ pressed }) => [
                  styles.opcion,
                  activo && styles.opcionActiva,
                  pressed && styles.opcionPulsada,
                  ocupado && styles.opcionOcupada,
                ]}
              >
                <BarLogo nombre={bar.name} tamano={36} />
                <View style={styles.texto}>
                  <Text style={typography.cardTitle}>{bar.name}</Text>
                  {ocupado ? <Text style={typography.muted}>Ya esta en la ruta</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  texto: { flex: 1, gap: 2 },
  placeholder: { flex: 1, color: colors.inkFaint },
  flecha: { fontSize: 16, color: colors.inkSoft },
  lista: { maxHeight: 300, borderTopWidth: 1, borderTopColor: colors.border },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  opcionActiva: { backgroundColor: colors.paperDeep },
  opcionPulsada: { backgroundColor: colors.paper },
  opcionOcupada: { opacity: 0.4 },
});
