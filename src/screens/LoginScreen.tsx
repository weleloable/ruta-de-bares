import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const action = mode === 'signIn' ? signInWithPassword : signUpWithPassword;
    const { error: err } = await action(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    if (mode === 'signUp') setSignedUp(true);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>🍻 Ruta de Bares</Text>
      <Text style={styles.subtitle}>
        {mode === 'signIn' ? 'Inicia sesión' : 'Crea tu cuenta'}
      </Text>

      {signedUp ? (
        <Text style={styles.info}>
          Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.
        </Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading || !email || !password}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'signIn' ? 'Entrar' : 'Registrarme'}
              </Text>
            )}
          </Pressable>
        </>
      )}

      <Pressable
        onPress={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setError(null);
          setSignedUp(false);
        }}
      >
        <Text style={styles.link}>
          {mode === 'signIn' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#b8860b',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#c00', marginBottom: 12, textAlign: 'center' },
  info: { textAlign: 'center', color: '#333', marginBottom: 12 },
  link: { textAlign: 'center', color: '#b8860b', marginTop: 20 },
});
