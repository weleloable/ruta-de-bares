import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { BotonGoogle } from '../../src/features/auth/BotonGoogle';
import { CORREO_PRIVACIDAD } from '../../src/features/legal/responsable';
import { colors, space, typography } from '../../src/lib/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verContacto, setVerContacto] = useState(false);
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
          {/* Logo de la app (el mismo que el icono), no un sello dibujado: ver
              scripts/generar-iconos.py. */}
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="Ruta de Bares"
          />
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
          <BotonGoogle deshabilitado={enviando} />

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
            {/* Esta es la portada de la app y aqui se crea la cuenta la primera
                vez que se entra con Google, asi que la politica se enlaza aqui
                tambien (art. 13 RGPD; Google lo exige para verificar el acceso). */}
            <View style={styles.enlaces}>
              <Text
                style={[typography.muted, styles.enlace]}
                accessibilityRole="link"
                onPress={() => router.push('/privacidad')}
              >
                Política de privacidad
              </Text>
              <Text
                style={[typography.muted, styles.enlace]}
                accessibilityRole="button"
                accessibilityState={{ expanded: verContacto }}
                onPress={() => setVerContacto((v) => !v)}
              >
                Contacto
              </Text>
            </View>
            {/* Se despliega aqui y no en otra pantalla: quien no puede entrar es
                justo quien necesita escribir, y la pantalla de contacto de
                dentro (Escribir a la organizacion) exige sesion. */}
            {verContacto ? (
              <Text style={[typography.muted, styles.centrado]}>
                Para contactar con la organización, escribe a{' '}
                <Text
                  style={styles.enlace}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(`mailto:${CORREO_PRIVACIDAD}`)}
                >
                  {CORREO_PRIVACIDAD}
                </Text>
                .
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  logo: { width: 96, height: 96, marginBottom: space.md },
  centrado: { textAlign: 'center' },
  formulario: { gap: space.lg },
  pie: { gap: space.xs, marginTop: space.md },
  enlaces: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  enlace: { fontWeight: '700', color: colors.beerDark, textDecorationLine: 'underline' },
});
