import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { Banner, Button, EmptyState, Loading } from '../../src/components/ui';
import { getBlockedList, unblockMatch } from '../../src/features/match/api';
import { AvatarCana } from '../../src/features/match/piezas';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { colors, radius, space, typography } from '../../src/lib/theme';
import type { MatchBlockedRow } from '../../src/types/database';

/**
 * Personas que has bloqueado, con la opcion de deshacerlo.
 *
 * Desbloquear NO devuelve la conexion ni el Me gusta (0008): si quieres volver
 * a hablar con alguien, tienes que dar Me gusta otra vez desde su ficha. Se
 * avisa aqui para que nadie desbloquee esperando recuperar el chat.
 */
export default function BloqueadosCana() {
  const router = useRouter();
  const [filas, setFilas] = useState<MatchBlockedRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aDesbloquear, setADesbloquear] = useState<MatchBlockedRow | null>(null);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setFilas(await getBlockedList());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la lista.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  async function onConfirmarDesbloqueo() {
    if (!aDesbloquear) return;
    setQuitando(true);
    try {
      await unblockMatch(aDesbloquear.user_id);
      setADesbloquear(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desbloquear.');
      setADesbloquear(null);
    } finally {
      setQuitando(false);
    }
  }

  if (cargando && filas.length === 0) return <Loading label="Cargando..." />;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Personas bloqueadas' }} />

      {error ? (
        <View style={styles.aviso}>
          <Banner tone="error">{error}</Banner>
        </View>
      ) : null}

      {filas.length === 0 ? (
        <View style={styles.vacio}>
          <EmptyState
            title="No has bloqueado a nadie"
            body="Si alguien te molesta, puedes bloquearlo desde su ficha o desde el chat."
          />
          <Button title="Volver" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={(fila) => fila.user_id}
          contentContainerStyle={styles.lista}
          ListHeaderComponent={
            <Text style={[typography.muted, styles.explicacion]}>
              No os veis en la ruta ni podéis escribiros. Al desbloquear no vuelve la conexión: tendrías que darle
              Me gusta otra vez.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.fila}>
              <AvatarCana nombre={item.display_name} foto={item.avatar_url} tamano={44} />
              <Text style={[typography.cardTitle, styles.nombre]} numberOfLines={1}>
                {item.display_name}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Desbloquear a ${item.display_name}`}
                onPress={() => setADesbloquear(item)}
                style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
              >
                <Text style={styles.botonTexto}>Desbloquear</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <DialogoConfirmar
        visible={aDesbloquear !== null}
        titulo={`Desbloquear a ${aDesbloquear?.display_name ?? ''}`}
        mensaje="Volveréis a veros en la ruta. La conexión y el chat no vuelven: tendrías que darle Me gusta otra vez."
        textoConfirmar="Desbloquear"
        ocupado={quitando}
        onConfirmar={() => void onConfirmarDesbloqueo()}
        onCancelar={() => setADesbloquear(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  aviso: { padding: space.lg, paddingBottom: 0 },
  vacio: { padding: space.lg, gap: space.lg },
  lista: { padding: space.lg, gap: space.sm },
  explicacion: { marginBottom: space.sm },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  nombre: { flex: 1 },
  boton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  botonTexto: { fontSize: 13, fontWeight: '700', color: colors.ink },
  pulsado: { opacity: 0.7 },
});
