import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card } from '../../src/components/ui';
import { deleteMyMatchData, exportMyMatchData } from '../../src/features/match/api';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Tus datos de la cana: verlos, copiarlos y borrarlos (0009).
 *
 * Borrar NO es desactivar: desactivar es una pausa y lo guarda todo (D8), esto
 * no deja perfil, ni votos, ni conexiones, ni mensajes. Lo que no se lleva son
 * los bloqueos que otras personas te pusieron y las denuncias sobre ti, y la
 * pantalla lo dice antes de que alguien confirme.
 */
export default function MisDatosCana() {
  const router = useRouter();
  const [datos, setDatos] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setCargando(true);
    setError(null);
    setCopiado(false);
    try {
      setDatos(JSON.stringify(await exportMyMatchData(), null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron traer tus datos.');
    } finally {
      setCargando(false);
    }
  }

  async function copiar() {
    if (!datos) return;
    await Clipboard.setStringAsync(datos);
    setCopiado(true);
  }

  async function onConfirmarBorrado() {
    setBorrando(true);
    setError(null);
    try {
      const cuentas = await deleteMyMatchData();
      setConfirmandoBorrado(false);
      setDatos(null);
      setResultado(
        `Borrado: ${cuentas.conexiones} ${cuentas.conexiones === 1 ? 'conexión' : 'conexiones'}, ` +
          `${cuentas.votos} ${cuentas.votos === 1 ? 'voto' : 'votos'} y ${cuentas.mensajes} ` +
          `${cuentas.mensajes === 1 ? 'mensaje' : 'mensajes'}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.');
      setConfirmandoBorrado(false);
    } finally {
      setBorrando(false);
    }
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Mis datos' }} />
      <ScrollView contentContainerStyle={styles.cuerpo}>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {resultado ? <Banner tone="success">{resultado}</Banner> : null}

        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>Ver lo que guardamos</Text>
          <Text style={typography.muted}>
            Tu perfil de la caña, tus Me gusta y Vistos, tus conexiones y los mensajes que has escrito tú. Los de la
            otra persona son suyos y no salen aquí.
          </Text>
          <Button title={datos ? 'Actualizar' : 'Ver mis datos'} onPress={() => void descargar()} loading={cargando} />
          {datos ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => void copiar()}>
                <Text style={styles.enlace}>{copiado ? 'Copiado' : 'Copiar todo'}</Text>
              </Pressable>
              <ScrollView horizontal style={styles.caja}>
                <Text style={styles.json} selectable>
                  {datos}
                </Text>
              </ScrollView>
            </>
          ) : null}
        </Card>

        <Card style={styles.tarjeta}>
          <Text style={typography.sectionTitle}>Borrar mis datos de la caña</Text>
          <Text style={typography.muted}>
            Se borra tu perfil de la caña, tus Me gusta y Vistos, tus conexiones y sus chats. No se borra tu cuenta ni
            tus sellos, y podrás volver a activarla desde cero cuando quieras.
          </Text>
          <Text style={typography.muted}>
            Si alguien te ha bloqueado o denunciado, eso se queda: es su decisión y quien organiza la ruta tiene que
            poder revisarlo.
          </Text>
          <Button
            title="Borrar mis datos de la caña"
            variant="danger"
            onPress={() => setConfirmandoBorrado(true)}
            loading={borrando}
          />
        </Card>

        <Pressable accessibilityRole="button" onPress={() => router.push('/cana/condiciones')}>
          <Text style={[styles.enlace, styles.centrado]}>Cómo funciona la caña</Text>
        </Pressable>
      </ScrollView>

      <DialogoConfirmar
        visible={confirmandoBorrado}
        titulo="Borrar tus datos de la caña"
        mensaje="Se borran tu perfil, tus Me gusta, tus conexiones y los chats. No se puede deshacer."
        textoConfirmar="Borrar"
        destructivo
        ocupado={borrando}
        onConfirmar={() => void onConfirmarBorrado()}
        onCancelar={() => setConfirmandoBorrado(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  tarjeta: { gap: space.sm },
  enlace: { fontSize: 14, fontWeight: '700', color: colors.beerDark },
  centrado: { textAlign: 'center' },
  caja: {
    maxHeight: 280,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paperDeep,
  },
  json: { fontFamily: 'monospace', fontSize: 12, color: colors.inkSoft },
});
