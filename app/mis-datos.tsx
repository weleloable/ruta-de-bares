import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card } from '../src/components/ui';
import { deleteMyMatchData } from '../src/features/match/api';
import { exportMyData } from '../src/features/profile/api';
import { DialogoConfirmar } from '../src/features/profile/DialogoConfirmar';
import { colors, radius, space, typography } from '../src/lib/theme';

/**
 * Tus datos: verlos, copiarlos y borrarlos (0010).
 *
 * Vivia en `app/cana/mis-datos.tsx` y se entraba solo desde la pestana Cana.
 * Se movio aqui porque ahi no la alcanzaba justo quien mas la necesita: a una
 * cuenta suspendida, o a quien tiene la cana desactivada por un admin, esa
 * pestana le ensena una pantalla vacia, y su aviso de sancion le promete que
 * puede llevarse o borrar sus datos. No es una pantalla de la cana: descarga un
 * JSON y borra datos.
 *
 * Lo que descarga es TODO (`export_my_data`, 0025): cuenta y correo, rutas,
 * sellos con hora y coordenadas, fotos enviadas a revision, avisos de
 * moderacion, sanciones con el HMAC del correo, y lo de la cana. Antes solo
 * sacaba el trozo de la cana, que no cumplia el art. 15 del RGPD.
 *
 * Lo de BORRAR sigue siendo solo de la cana: borrar la cuenta entera esta en
 * Mi perfil (0021). Son dos cosas distintas a proposito, y por eso las dos
 * tarjetas lo dicen.
 *
 * Borrar NO es desactivar: desactivar es una pausa y lo guarda todo (D8), esto
 * no deja perfil, ni votos, ni conexiones, ni mensajes. Lo que no se lleva son
 * los bloqueos que otras personas te pusieron y las denuncias sobre ti, y la
 * pantalla lo dice antes de que alguien confirme.
 */
export default function MisDatos() {
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
      setDatos(JSON.stringify(await exportMyData(), null, 2));
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
            Todo: tu cuenta y tu correo, las rutas en las que estás, tus sellos con la hora y el sitio, las fotos que
            enviaste a revisión, lo que se ha decidido sobre tu cuenta y por qué, y lo de la caña (perfil, Me gusta y
            Vistos, conexiones y los mensajes que escribiste tú).
          </Text>
          <Text style={typography.muted}>
            No salen los mensajes de la otra persona, que son suyos, ni el texto de una denuncia sobre ti que siga sin
            resolver: eso llevaría el nombre de quien la puso. Lo que se decidió sí sale, y es lo que necesitas para
            reclamar.
          </Text>
          <Button title={datos ? 'Actualizar' : 'Ver mis datos'} onPress={() => void descargar()} loading={cargando} />
          {datos ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => void copiar()}>
                <Text style={styles.enlace}>{copiado ? 'Copiado' : 'Copiar todo'}</Text>
              </Pressable>
              {/* Dos ScrollView anidados, uno por eje: el JSON es largo Y ancho.
                  Antes solo estaba el horizontal, asi que la caja se cortaba por
                  abajo a los 280 px y no habia forma de leer el resto.
                  `nestedScrollEnabled` hace falta por estar dentro del ScrollView
                  de la pantalla: sin el, en Android el de dentro no scrollea. */}
              <ScrollView style={styles.caja} nestedScrollEnabled>
                <ScrollView horizontal>
                  <Text style={styles.json} selectable>
                    {datos}
                  </Text>
                </ScrollView>
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
