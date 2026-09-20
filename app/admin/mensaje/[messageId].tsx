import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Field, Loading } from '../../../src/components/ui';
import { hace, MOTIVO_MAX, motivoValido } from '../../../src/features/admin/alertas';
import { listarMensajes, reclamarMensaje, responderMensaje } from '../../../src/features/contacto/api';
import { avisoDeConflicto, estadoMensaje, tituloMensaje } from '../../../src/features/contacto/reglas';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import type { AdminMessageRow } from '../../../src/types/database';

/**
 * Un mensaje a la organizacion, solo administradores (0026).
 *
 * Se RECLAMA al abrirlo, como una denuncia (0013): con dos admins en la misma
 * bandeja, si no, los dos se ponen con lo mismo.
 *
 * Responder cierra el mensaje Y genera un aviso, asi que la respuesta le llega
 * a la persona donde ya sabe mirar. El art. 20 del DSA pide comunicar la
 * decision, no solo tomarla.
 *
 * Si la reclamacion es de una decision que tomo quien esta mirando, sale un
 * aviso: el art. 20.6 pide que se revise con criterio. No se bloquea porque con
 * un solo admin no habria alternativa posible.
 *
 * Quien protege esto de verdad es `match_admin_require()` en Postgres.
 */
export default function MensajeScreen() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const router = useRouter();

  const [fila, setFila] = useState<AdminMessageRow | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    if (!messageId) return;
    try {
      // No hay funcion de "uno solo": se pide la lista con historico y se
      // busca, igual que la pantalla de una foto (0020).
      const todos = await listarMensajes(true);
      setFila(todos.find((m) => m.id === messageId) ?? null);
      setError(null);
    } catch (e) {
      setFila(null);
      setError(e instanceof Error ? e.message : 'No se pudo leer el mensaje.');
    } finally {
      setCargando(false);
    }
  }, [messageId]);

  useEffect(() => {
    void (async () => {
      // Reclamarlo ANTES de leerlo, para que la lista ya venga con el estado
      // nuevo y no haya que recargar.
      if (messageId) await reclamarMensaje(messageId).catch(() => false);
      await cargar();
    })();
  }, [messageId, cargar]);

  async function onResponder() {
    if (!fila || enviando || !motivoValido(respuesta)) return;
    setEnviando(true);
    setError(null);
    try {
      await responderMensaje(fila.id, respuesta);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo responder.');
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <Loading label="Cargando el mensaje..." />;

  if (!fila) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState title="Mensaje no encontrado" body={error ?? 'Puede que ya no exista.'} />
      </SafeAreaView>
    );
  }

  const conflicto = avisoDeConflicto(fila);
  const abierto = fila.status !== 'resuelta';

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <KeyboardAvoidingView style={styles.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {conflicto ? <Banner tone="info">{conflicto}</Banner> : null}

          <Card style={styles.tarjeta}>
            <Text style={typography.overline}>{tituloMensaje(fila.kind)}</Text>
            <Text style={typography.sectionTitle}>{fila.user_name}</Text>
            <Text style={typography.muted}>
              {hace(fila.created_at, new Date())} · {estadoMensaje(fila.status)}
            </Text>
            {fila.notice_action ? (
              <Text style={typography.muted}>Reclama: {fila.notice_action}</Text>
            ) : null}

            <View style={styles.texto}>
              <Text style={styles.cuerpoMensaje}>{fila.body}</Text>
            </View>
          </Card>

          {!abierto ? (
            <Card style={styles.tarjeta}>
              <Text style={typography.overline}>Respondida</Text>
              <Text style={styles.cuerpoMensaje}>{fila.answer}</Text>
              <Text style={typography.muted}>
                por {fila.handled_by_name || 'otra persona'}
                {fila.handled_at ? ` · ${hace(fila.handled_at, new Date())}` : ''}
              </Text>
            </Card>
          ) : (
            <Card style={styles.tarjeta}>
              <Text style={typography.sectionTitle}>Responder</Text>
              <Text style={typography.muted}>
                Lo que escribas se le enseña tal cual, y le llega como un aviso. Responder cierra el mensaje.
              </Text>
              <Field
                label="Respuesta"
                value={respuesta}
                onChangeText={setRespuesta}
                multiline
                numberOfLines={5}
                maxLength={MOTIVO_MAX}
                placeholder="Qué habéis decidido y por qué"
                style={styles.campo}
                hint={`${respuesta.trim().length}/${MOTIVO_MAX}`}
              />
              <Button
                title="Responder y cerrar"
                onPress={() => void onResponder()}
                loading={enviando}
                disabled={!motivoValido(respuesta)}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  tarjeta: { gap: space.sm },
  campo: { minHeight: 110, textAlignVertical: 'top' },
  texto: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paperDeep,
  },
  cuerpoMensaje: { fontSize: 15, color: colors.ink },
});
