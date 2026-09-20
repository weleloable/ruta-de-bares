import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field, Loading } from '../src/components/ui';
import { enviarMensaje, misMensajes } from '../src/features/contacto/api';
import {
  CUERPO_MAX,
  cuerpoValido,
  estadoMensaje,
  pieDeMiMensaje,
  tituloMensaje,
  traducirErrorMensaje,
} from '../src/features/contacto/reglas';
import { cuando } from '../src/features/notices/avisos';
import { colors, radius, space, typography } from '../src/lib/theme';
import type { MiMensajeRow } from '../src/types/database';

/**
 * Escribir a la organizacion, y reclamar una decision (0026).
 *
 * Dos entradas al mismo sitio:
 *  - desde Mi perfil, sin mas: es el punto de contacto del art. 12 del DSA, que
 *    tiene que estar SIEMPRE disponible, sin condiciones;
 *  - desde un aviso de Avisos, con `?aviso=<id>`: es la reclamacion del art. 20,
 *    que si va atada a una decision y caduca a los seis meses.
 *
 * Esta pantalla NO comprueba sanciones ni pertenencia a ninguna ruta, y es lo
 * importante: quien mas la necesita es justo la cuenta suspendida o expulsada.
 * Lo mismo hace el servidor (`send_admin_message`), que es quien manda.
 */
export default function ContactoScreen() {
  const { aviso, accion } = useLocalSearchParams<{ aviso?: string; accion?: string }>();
  const esReclamacion = typeof aviso === 'string' && aviso !== '';

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [mios, setMios] = useState<MiMensajeRow[] | null>(null);

  const recargar = useCallback(async () => {
    try {
      setMios(await misMensajes());
    } catch (e) {
      // El historial es un extra: si falla, se puede escribir igual.
      setMios([]);
      void e;
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  async function onEnviar() {
    if (enviando || !cuerpoValido(texto)) return;
    setEnviando(true);
    setError(null);
    setExito(null);
    try {
      await enviarMensaje(esReclamacion ? 'reclamacion' : 'contacto', texto, esReclamacion ? aviso : null);
      setTexto('');
      setExito('Enviado. Te responderán en Avisos.');
      await recargar();
    } catch (e) {
      setError(traducirErrorMensaje(e instanceof Error ? e.message : 'No se pudo enviar.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: esReclamacion ? 'Reclamar' : 'Escribir' }} />
      <KeyboardAvoidingView style={styles.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {exito ? <Banner tone="success">{exito}</Banner> : null}

          <Card style={styles.tarjeta}>
            <Text style={typography.sectionTitle}>
              {esReclamacion ? 'No estás de acuerdo con una decisión' : 'Escribir a la organización'}
            </Text>
            {esReclamacion ? (
              <Text style={typography.muted}>
                Cuenta por qué crees que la decisión no es correcta. Quien organiza la ruta la volverá a mirar y te
                responderá aquí y en Avisos.
                {typeof accion === 'string' && accion !== '' ? ` Reclamas: ${accion}.` : ''}
              </Text>
            ) : (
              <Text style={typography.muted}>
                Para cualquier cosa: una duda, un problema con la app, o algo que creas que deberíamos saber. Lo lee
                quien organiza la ruta.
              </Text>
            )}

            <Field
              label="Tu mensaje"
              value={texto}
              onChangeText={setTexto}
              multiline
              numberOfLines={6}
              maxLength={CUERPO_MAX}
              placeholder="Cuéntanos qué pasa"
              style={styles.campo}
              hint={`${texto.trim().length}/${CUERPO_MAX}`}
            />
            <Button
              title={esReclamacion ? 'Enviar la reclamación' : 'Enviar'}
              onPress={() => void onEnviar()}
              loading={enviando}
              disabled={!cuerpoValido(texto)}
            />
          </Card>

          <Card style={styles.tarjeta}>
            <Text style={typography.sectionTitle}>Lo que has enviado</Text>
            {mios === null ? (
              <Loading label="Cargando..." />
            ) : mios.length === 0 ? (
              <Text style={typography.muted}>Todavía no has escrito nada.</Text>
            ) : (
              mios.map((m) => (
                <View key={m.id} style={styles.mensaje}>
                  <View style={styles.cabecera}>
                    <Text style={typography.overline}>{tituloMensaje(m.kind)}</Text>
                    <Text style={styles.estado}>{estadoMensaje(m.status)}</Text>
                  </View>
                  <Text style={styles.fecha}>{cuando(m.created_at)}</Text>
                  <Text style={styles.texto}>{m.body}</Text>
                  <View style={styles.respuesta}>
                    <Text style={typography.overline}>Respuesta</Text>
                    <Text style={styles.textoRespuesta}>{pieDeMiMensaje(m)}</Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  tarjeta: { gap: space.sm },
  campo: { minHeight: 120, textAlignVertical: 'top' },
  mensaje: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paperDeep,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  estado: { fontSize: 11, fontWeight: '800', color: colors.inkSoft, letterSpacing: 0.5 },
  fecha: { fontSize: 12, color: colors.inkFaint },
  texto: { fontSize: 15, color: colors.ink },
  respuesta: { gap: 2, marginTop: space.xs },
  textoRespuesta: { fontSize: 14, color: colors.inkSoft },
});
