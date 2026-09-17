import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { colors, radius, space, typography } from '../../src/lib/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const puedeEnviar = email.trim().length > 0 && password.length > 0 && !enviando;

  async function onSubmit() {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      await signIn(email, password);
      // No se navega desde aqui: AuthGate reacciona al cambio de sesion.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesion.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <View style={styles.sello}>
            <Text style={styles.selloTexto}>RB</Text>
          </View>
          <Text style={typography.screenTitle}>Ruta de Bares</Text>
          <Text style={[typography.muted, styles.centrado]}>
            Tu compostelana de bares: un sello por cada parada de la ruta.
          </Text>
        </View>

        <View style={styles.formulario}>
          <Field
            label="Correo electronico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="tu@correo.com"
            editable={!enviando}
          />
          <Field
            label="Contrasena"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            placeholder="********"
            editable={!enviando}
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          {error ? <Banner tone="error">{error}</Banner> : null}

          <Button title="Entrar" onPress={onSubmit} disabled={!puedeEnviar} loading={enviando} />

          <View style={styles.pie}>
            <Text style={[typography.muted, styles.centrado]}>
              Aun no tienes cuenta? Crearla es gratis. Para ver una ruta necesitaras que te pasen
              su invitacion.
            </Text>
            <Button
              title="Crear cuenta"
              variant="ghost"
              onPress={() => router.push('/registro')}
              disabled={enviando}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  sello: {
    width: 92,
    height: 92,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
    marginBottom: space.md,
  },
  selloTexto: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.stamp,
    letterSpacing: 2,
  },
  centrado: { textAlign: 'center' },
  formulario: { gap: space.lg },
  pie: { gap: space.xs, marginTop: space.md },
});
