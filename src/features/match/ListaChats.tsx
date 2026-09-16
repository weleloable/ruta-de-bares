import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../../components/ui';
import { colors, radius, space, typography } from '../../lib/theme';
import type { MatchInboxRow } from '../../types/database';
import { AvatarCana } from './piezas';
import { teTocaResponder, vistaPreviaChat } from './reglas';

/**
 * Lista de chats de Tirate una cana. Una conversacion puede esperar algo de ti
 * (una pregunta sin responder) y eso no cabe en una tarjeta de la grilla: aqui
 * se ve de un vistazo. El orden lo pone el servidor (match_inbox).
 */
export function ListaChats({
  filas,
  yo,
  onAbrir,
}: {
  filas: readonly MatchInboxRow[];
  yo: string;
  onAbrir(connectionId: string): void;
}) {
  if (filas.length === 0) {
    return (
      <EmptyState
        title="Sin chats todavía"
        body="Cuando alguien a quien has dado Me gusta te lo devuelva, podréis hablar aquí con GIFs y zumbidos."
      />
    );
  }

  return (
    <View style={styles.lista}>
      {filas.map((fila) => {
        const pendiente = teTocaResponder(fila, yo);
        const vista = vistaPreviaChat(fila, yo);
        const destacada = pendiente || fila.unread_count > 0;
        return (
          <Pressable
            key={fila.connection_id}
            accessibilityRole="button"
            accessibilityLabel={`Chat con ${fila.display_name}. ${vista}${
              fila.unread_count > 0 ? `. ${fila.unread_count} sin leer` : ''
            }`}
            onPress={() => onAbrir(fila.connection_id)}
            style={({ pressed }) => [styles.fila, pendiente && styles.filaPendiente, pressed && styles.pulsada]}
          >
            <AvatarCana nombre={fila.display_name} foto={fila.avatar_url} tamano={52} />
            <View style={styles.textos}>
              <Text style={typography.cardTitle} numberOfLines={1}>
                {fila.display_name}
              </Text>
              <Text style={[typography.muted, destacada && styles.vistaDestacada]} numberOfLines={1}>
                {vista}
              </Text>
            </View>
            {fila.unread_count > 0 ? (
              <View style={styles.contador}>
                <Text style={styles.contadorTexto}>{fila.unread_count}</Text>
              </View>
            ) : pendiente ? (
              <Ionicons name="beer" size={22} color={colors.beerDark} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { gap: space.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filaPendiente: { borderColor: colors.beer, borderWidth: 2 },
  pulsada: { opacity: 0.8 },
  textos: { flex: 1, gap: 2 },
  vistaDestacada: { color: colors.ink, fontWeight: '700' },
  contador: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorTexto: { color: colors.white, fontWeight: '800', fontSize: 12 },
});
