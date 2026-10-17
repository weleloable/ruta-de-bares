import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../lib/theme';
import { useAuth } from '../auth/AuthProvider';
import { marcarLeido, useLeidos, useVigentes } from './almacenDemo';
import { hace, minutosRestantes } from './reglas';

/**
 * PROTOTIPO. Tira de anuncios de los admins, arriba de la pestana Ruta.
 * Sin anuncios vigentes no pinta nada (ni hueco). Solo lectura para la gente.
 * Uno nuevo sale grande y con punto rojo; al pulsar "Entendido" se queda en una
 * linea fina hasta que caduca.
 */
export function TablonAnuncios({ ruta }: { ruta: string | undefined }) {
  const { isAdmin } = useAuth();
  const { visibles, ahora } = useVigentes(ruta, isAdmin);
  const leidos = useLeidos();
  if (visibles.length === 0) return null;

  return (
    <View style={styles.caja}>
      {visibles.slice(0, 3).map((a) => {
        const nuevo = !leidos.has(a.id);
        return (
          <View key={a.id} style={[styles.anuncio, nuevo && styles.nuevo]} accessibilityRole="alert">
            <View style={styles.fila}>
              <View style={styles.icono}>
                <Ionicons name="megaphone" size={16} color={colors.white} />
                {nuevo ? <View style={styles.punto} /> : null}
              </View>
              <View style={styles.texto}>
                <Text style={styles.etiqueta}>
                  {a.soloAdmins ? 'Solo admins' : 'Aviso de la organización'} · {hace(a, ahora)}
                </Text>
                <Text style={[typography.body, styles.mensaje]} numberOfLines={nuevo ? undefined : 2}>
                  {a.texto}
                </Text>
                <Text style={typography.muted}>Se quita solo en {minutosRestantes(a, ahora)} min</Text>
              </View>
            </View>
            {nuevo ? (
              <Pressable style={styles.entendido} onPress={() => marcarLeido(a.id)} accessibilityRole="button">
                <Text style={styles.entendidoTexto}>Entendido</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { marginHorizontal: space.lg, gap: space.sm },
  anuncio: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  nuevo: { borderColor: colors.beer, borderWidth: 2, backgroundColor: '#FFF6E5' },
  fila: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  icono: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.beer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  punto: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.stamp,
    borderWidth: 2,
    borderColor: colors.white,
  },
  texto: { flex: 1, gap: 2 },
  etiqueta: { fontSize: 12, fontWeight: '700', color: colors.beerDark },
  mensaje: { fontWeight: '600' },
  entendido: {
    alignSelf: 'flex-end',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.beer,
  },
  entendidoTexto: { color: colors.white, fontWeight: '700' },
});
