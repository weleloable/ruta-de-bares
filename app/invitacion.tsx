import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Screen } from '../src/components/ui';
import { useAuth } from '../src/features/auth/AuthProvider';
import { redeemRouteInvite } from '../src/features/invites/api';
import {
  isValidTokenShape,
  parseInviteParam,
  parseInviteToken,
} from '../src/features/invites/link';
import {
  guardarInvitacionPendiente,
  olvidarInvitacionPendiente,
} from '../src/features/invites/pendiente';
import { useActiveRoute } from '../src/features/routes/ActiveRouteProvider';
import { getRouteWithBars } from '../src/features/routes/api';
import { space, typography } from '../src/lib/theme';

/**
 * Canje de una invitacion a una ruta.
 *
 * Se llega de dos formas: abriendo el enlace que reparte el admin
 * (https://weleloable.github.io/ruta-de-bares/invitacion?token=..., ver
 * buildInviteUrl; expo-router rellena el parametro solo, tambien en arranque en
 * frio y desde la PWA instalada), o pegando el codigo a mano en Mi perfil. El
 * deep link rutadebares://invitacion?token= sigue funcionando en nativo.
 *
 * Es publica a proposito (ver AuthGate en app/_layout.tsx): si exigiera sesion,
 * abrir el enlace sin haberla iniciado acabaria en /login con el token perdido.
 * Sin sesion, guarda el token y manda a crear cuenta; AuthGate vuelve aqui en
 * cuanto la hay.
 */
export default function InvitacionScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { refresh, selectRoute } = useActiveRoute();
  const params = useLocalSearchParams<{ token?: string | string[] }>();

  // Puede llegar como array (?token=a&token=b) y es la entrada publica de la
  // pantalla: parseInviteParam lo traga sin lanzar.
  const tokenDelEnlace = useMemo(() => parseInviteParam(params.token), [params.token]);

  const [token, setToken] = useState(tokenDelEnlace ?? '');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  // Se puede entrar en una ruta que aun es borrador: la membresia es real pero
  // la ruta no se ve hasta que la publican. Sin distinguirlo, la pantalla diria
  // "ya puedes verla" y el usuario abriria Sellos vacio sin entender nada.
  const [rutaVisible, setRutaVisible] = useState(true);

  const tokenLimpio = parseInviteToken(token) ?? token.trim();
  const tokenValido = isValidTokenShape(tokenLimpio);

  // Sin sesion no se puede canjear, pero el token no se puede perder: se guarda
  // antes de mandar a identificarse, y AuthGate devuelve aqui despues.
  useEffect(() => {
    if (!loading && !session && tokenValido) guardarInvitacionPendiente(tokenLimpio);
  }, [loading, session, tokenValido, tokenLimpio]);

  // Con sesion la invitacion ya esta delante del usuario (viene en la URL): el
  // pendiente cumplio su funcion. AuthGate solo lo lee, asi que se borra aqui,
  // y no reaparece si luego cierra sesion y vuelve a entrar sin haber canjeado.
  useEffect(() => {
    if (!loading && session) olvidarInvitacionPendiente();
  }, [loading, session]);

  async function onCanjear() {
    if (!tokenValido || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const rutaId = await redeemRouteInvite(tokenLimpio);
      // Si la RLS no la devuelve, la ruta sigue siendo un borrador: ya eres
      // miembro, pero todavia no se ve. Se pregunta al servidor en vez de
      // suponerlo, que es quien decide lo que ve cada uno.
      const detalle = await getRouteWithBars(rutaId);
      setRutaVisible(detalle !== null);
      // Recarga y deja la ruta recien estrenada como la activa: el usuario
      // acaba de decir que le interesa esa, no la que hubiera antes.
      await refresh();
      if (detalle !== null) selectRoute(rutaId);
      setHecho(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo canjear la invitacion.');
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <Screen scroll>
        <View style={styles.cabecera}>
          <Text style={typography.screenTitle}>Ya estas dentro</Text>
          <Text style={typography.muted}>
            {rutaVisible
              ? 'Ya puedes ver la ruta y sellar sus bares cuando llegues.'
              : 'Esa ruta todavia es un borrador: te avisaran cuando la publiquen y entonces te saldra en Sellos.'}
          </Text>
        </View>
        <Button title="Ver mis sellos" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!loading && !session) {
    return (
      <Screen scroll>
        <View style={styles.cabecera}>
          <Text style={typography.screenTitle}>Te han invitado a una ruta</Text>
          <Text style={typography.muted}>
            {tokenValido
              ? 'Crea tu cuenta o inicia sesion y te metemos en la ruta.'
              : 'Ese enlace no tiene buena pinta. Pide que te lo manden otra vez.'}
          </Text>
        </View>
        <View style={styles.formulario}>
          <Button title="Crear cuenta" onPress={() => router.replace('/registro')} />
          <Button
            title="Ya tengo cuenta"
            variant="secondary"
            onPress={() => router.replace('/login')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.cabecera}>
        <Text style={typography.screenTitle}>Entrar en una ruta</Text>
        <Text style={typography.muted}>
          {tokenDelEnlace
            ? 'Enlace reconocido. Confirma para entrar en la ruta.'
            : 'Pega el enlace o el codigo que te han pasado.'}
        </Text>
      </View>

      <View style={styles.formulario}>
        <Field
          label="Enlace o codigo de invitacion"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Pega aqui el enlace"
          editable={!enviando && tokenDelEnlace === null}
          error={token.length > 0 && !tokenValido ? 'Este enlace o codigo no tiene el formato correcto.' : null}
          hint={tokenDelEnlace ? 'Viene del enlace que has abierto.' : undefined}
        />

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button
          title="Entrar en la ruta"
          onPress={onCanjear}
          disabled={!tokenValido || enviando}
          loading={enviando}
        />
        <Button
          title="Ahora no"
          variant="ghost"
          onPress={() => router.replace('/')}
          disabled={enviando}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cabecera: { gap: space.xs, paddingTop: space.xl, paddingBottom: space.md },
  formulario: { gap: space.lg },
});
