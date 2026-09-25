import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { BotonGoogle } from '../../src/features/auth/BotonGoogle';
import { colors, space, typography } from '../../src/lib/theme';

/**
 * Alta abierta.
 *
 * Hasta la migracion 0004 esta pantalla no existia: la unica via de entrada era
 * canjear una invitacion, que creaba la cuenta. Ahora la cuenta se crea sola y
 * lo que reparten las invitaciones son RUTAS, no cuentas. Crear una cuenta no
 * da acceso a nada todavia: hay que canjear una invitacion a una ruta.
 */
export default function RegistroScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const passwordValida = password.length >= 8;
  const coinciden = password === repetir;
  const puedeEnviar = email.trim().length > 0 && passwordValida && coinciden && !enviando;

  async function onSubmit() {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const conSesion = await signUp(email, password, nombre);
      // Con sesion no se navega desde aqui: AuthGate reacciona al cambio.
      // Sin ella, Supabase esta pidiendo confirmar el correo y hay que decirlo,
      // o la pantalla se queda quieta sin explicar por que.
      if (!conSesion) {
        setRevisaCorreo(true);
        setEnviando(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta.');
      setEnviando(false);
    }
  }

  if (revisaCorreo) {
    return (
      <Screen scroll>
        <View style={styles.cabecera}>
          <Text style={typography.screenTitle}>Revisa tu correo</Text>
          <Text style={typography.muted}>
            Te hemos mandado un enlace a {email.trim()}. Abrelo para confirmar la cuenta y luego
            inicia sesion.
          </Text>
        </View>
        <Button title="Ir al inicio de sesion" onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.cabecera}>
          <Text style={typography.screenTitle}>Crear cuenta</Text>
          <Text style={typography.muted}>
            Con la cuenta ya puedes entrar. Para ver una ruta necesitas que te pasen su invitacion.
          </Text>
        </View>

        <View style={styles.formulario}>
          <Field
            label="Como quieres que te llamemos"
            value={nombre}
            // Sin espacios: lo rechaza el servidor (migracion 0003), asi que
            // aqui ni se dejan escribir.
            onChangeText={(texto) => setNombre(texto.replace(/\s/g, ''))}
            maxLength={30}
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
            textContentType="emailAddress"
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
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          {error ? <Banner tone="error">{error}</Banner> : null}

          {/*
            El art. 13 del RGPD obliga a informar EN EL MOMENTO de recoger los
            datos, no despues. No es una casilla: el tratamiento aqui no se basa
            en consentimiento sino en prestar el servicio, y una casilla
            obligatoria confunde mas que informa. (La de la cana si es
            consentimiento y esa se queda.)
          */}
          <Text style={typography.muted}>
            Al crear la cuenta aceptas cómo tratamos tus datos.{' '}
            <Text style={styles.enlace} onPress={() => router.push('/privacidad')}>
              Leerlo
            </Text>
            .
          </Text>

          <Button title="Crear cuenta" onPress={onSubmit} disabled={!puedeEnviar} loading={enviando} />
          {/* Con Google se acepta lo mismo que arriba: el aviso de privacidad vale para las dos vias. */}
          <BotonGoogle deshabilitado={enviando} />
          <Button
            title="Ya tengo cuenta"
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
  enlace: { fontWeight: '700', color: colors.beerDark, textDecorationLine: 'underline' },
});
