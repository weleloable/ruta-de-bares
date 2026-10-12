import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Field, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import {
  codigoValido,
  correoValido,
  LARGO_CODIGO,
  limpiarCodigo,
  MIN_PASSWORD,
  passwordValida,
  segundosParaReenviar,
} from '../../src/features/auth/password';
import { space, typography } from '../../src/lib/theme';

/**
 * "He olvidado mi contrasena", con un codigo de 6 digitos y no con un enlace.
 *
 * El enlace de recuperacion de Supabase con PKCE solo funciona en el MISMO
 * navegador desde el que se pidio: pedirlo en la app instalada y abrir el
 * correo en Chrome falla sin decir por que. El codigo se escribe aqui mismo, asi
 * que sirve igual en la web, la PWA y el movil nativo, y ademas no hace falta
 * abrir rutas publicas nuevas en AuthGate.
 *
 * Dos pasos en una pantalla: el correo, y despues el codigo con la contrasena
 * nueva JUNTOS. Juntos porque canjear el codigo abre sesion y AuthGate saca de
 * este grupo en cuanto la hay: una pantalla en dos pasos (codigo, luego
 * contrasena) se desmontaria entre medias y dejaria entrar sin cambiarla.
 */
export default function OlvidoScreen() {
  const router = useRouter();
  const { requestPasswordReset, resetPasswordWithCode } = useAuth();

  const [paso, setPaso] = useState<'correo' | 'codigo'>('correo');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadoEn, setEnviadoEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  // Cuenta atras del boton de reenviar.
  useEffect(() => {
    if (enviadoEn === null) return;
    const id = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(id);
  }, [enviadoEn]);
  const espera = segundosParaReenviar(ahora, enviadoEn);

  async function pedirCodigo() {
    if (!correoValido(email) || enviando) return;
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      await requestPasswordReset(email);
      const t = Date.now();
      setEnviadoEn(t);
      setAhora(t);
      setPaso('codigo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el codigo.');
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar() {
    if (espera > 0 || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      const t = Date.now();
      setEnviadoEn(t);
      setAhora(t);
      setAviso('Te hemos mandado un código nuevo. El anterior ya no vale.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el codigo.');
    } finally {
      setEnviando(false);
    }
  }

  const coinciden = password === repetir;
  const puedeCambiar = codigoValido(codigo) && passwordValida(password) && coinciden && !enviando;

  async function cambiar() {
    if (!puedeCambiar) return;
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      await resetPasswordWithCode(email, codigo, password);
      // No se navega desde aqui: AuthGate reacciona al cambio de sesion.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.');
      setEnviando(false);
    }
  }

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.cabecera}>
          <Text style={typography.screenTitle}>He olvidado mi contraseña</Text>
          <Text style={typography.muted}>
            {paso === 'correo'
              ? 'Escribe el correo de tu cuenta y te mandamos un código de 6 dígitos.'
              : `Si ${email.trim()} tiene cuenta, te ha llegado un código de ${LARGO_CODIGO} dígitos. Mira también en spam.`}
          </Text>
        </View>

        <View style={styles.formulario}>
          {paso === 'correo' ? (
            <>
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
                returnKeyType="go"
                onSubmitEditing={pedirCodigo}
              />
              {error ? <Banner tone="error">{error}</Banner> : null}
              <Button
                title="Enviarme el código"
                onPress={pedirCodigo}
                disabled={!correoValido(email) || enviando}
                loading={enviando}
              />
            </>
          ) : (
            <>
              <Field
                label="Código del correo"
                value={codigo}
                onChangeText={(t) => setCodigo(limpiarCodigo(t))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                placeholder="123456"
                maxLength={LARGO_CODIGO}
                editable={!enviando}
              />
              <Field
                label="Contraseña nueva"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="********"
                editable={!enviando}
                error={password.length > 0 && !passwordValida(password) ? `Minimo ${MIN_PASSWORD} caracteres.` : null}
                hint={`Minimo ${MIN_PASSWORD} caracteres.`}
              />
              <Field
                label="Repite la contraseña"
                value={repetir}
                onChangeText={setRepetir}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="********"
                editable={!enviando}
                error={repetir.length > 0 && !coinciden ? 'No coinciden.' : null}
                returnKeyType="go"
                onSubmitEditing={cambiar}
              />
              {aviso ? <Banner tone="success">{aviso}</Banner> : null}
              {error ? <Banner tone="error">{error}</Banner> : null}
              <Button title="Cambiar contraseña y entrar" onPress={cambiar} disabled={!puedeCambiar} loading={enviando} />
              <Button
                title={espera > 0 ? `Reenviar el código (${espera} s)` : 'Reenviar el código'}
                variant="secondary"
                onPress={reenviar}
                disabled={espera > 0 || enviando}
              />
              <Button
                title="Cambiar de correo"
                variant="ghost"
                onPress={() => {
                  setPaso('correo');
                  setError(null);
                  setAviso(null);
                  setCodigo('');
                }}
                disabled={enviando}
              />
            </>
          )}
          <Button title="Volver a iniciar sesión" variant="ghost" onPress={() => router.back()} disabled={enviando} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cabecera: { gap: space.sm, paddingVertical: space.xl },
  formulario: { gap: space.lg },
});
