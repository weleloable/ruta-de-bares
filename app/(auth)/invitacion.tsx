import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { redeemInvite } from '../../src/features/invites/api';
import { isValidTokenShape, parseInviteToken } from '../../src/features/invites/link';
import { space, typography } from '../../src/lib/theme';

/**
 * Canje de invitacion. Es la UNICA pantalla que crea cuentas: el registro
 * publico esta desactivado en Supabase Auth.
 *
 * Se llega aqui de dos formas: abriendo el deep link
 * rutadebares://invitacion?token=... (expo-router rellena el parametro solo,
 * tambien en arranque en frio), o pulsando "Tengo una invitacion" y pegando
 * el codigo a mano.
 */
export default function InvitacionScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();

  const tokenDelEnlace = useMemo(
    () => (params.token ? parseInviteToken(params.token) : null),
    [params.token],
  );

  const [token, setToken] = useState(tokenDelEnlace ?? '');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const tokenLimpio = parseInviteToken(token) ?? token.trim();
  const tokenValido = isValidTokenShape(tokenLimpio);
  const passwordValida = password.length >= 8;
  const coinciden = password === repetir;
  const puedeEnviar =
    tokenValido && email.trim().length > 0 && passwordValida && coinciden && !enviando;

  async function onSubmit() {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      await redeemInvite({
        token: tokenLimpio,
        email: email.trim(),
        password,
        displayName: nombre.trim(),
      });
      // La cuenta ya existe y esta confirmada: se entra directo, sin pedirle
      // que vuelva a teclear lo mismo en la pantalla de login.
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo canjear la invitacion.');
      setEnviando(false);
    }
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.cabecera}>
          <Text style={typography.screenTitle}>Tu invitacion</Text>
          <Text style={typography.muted}>
            {tokenDelEnlace
              ? 'Enlace reconocido. Crea tu cuenta para unirte a la ruta.'
              : 'Pega el codigo que te han pasado y crea tu cuenta.'}
          </Text>
        </View>

        <View style={styles.formulario}>
          <Field
            label="Codigo de invitacion"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="43 caracteres"
            editable={!enviando && tokenDelEnlace === null}
            error={token.length > 0 && !tokenValido ? 'Este codigo no tiene el formato correcto.' : null}
            hint={tokenDelEnlace ? 'Viene del enlace que has abierto.' : undefined}
          />
          <Field
            label="Como quieres que te llamemos"
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre"
            editable={!enviando}
            hint="Opcional. Si lo dejas vacio usamos tu correo."
          />
          <Field
            label="Correo electronico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tu@correo.com"
            editable={!enviando}
          />
          <Field
            label="Contrasena"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            editable={!enviando}
            error={password.length > 0 && !passwordValida ? 'Minimo 8 caracteres.' : null}
            hint="Minimo 8 caracteres."
          />
          <Field
            label="Repite la contrasena"
            value={repetir}
            onChangeText={setRepetir}
            secureTextEntry
            editable={!enviando}
            error={repetir.length > 0 && !coinciden ? 'Las contrasenas no coinciden.' : null}
          />

          {error ? <Banner tone="error">{error}</Banner> : null}

          <Button
            title="Crear mi cuenta"
            onPress={onSubmit}
            disabled={!puedeEnviar}
            loading={enviando}
          />
          <Button
            title="Volver al inicio de sesion"
            variant="ghost"
            onPress={() => router.replace('/login')}
            disabled={enviando}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cabecera: { gap: space.xs, paddingTop: space.xl, paddingBottom: space.md },
  formulario: { gap: space.lg },
});
