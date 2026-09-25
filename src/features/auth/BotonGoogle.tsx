import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { colors, space, typography } from '../../lib/theme';
import { useAuth } from './AuthProvider';

/**
 * "Continuar con Google", con su separador. Sirve igual en registro y en inicio
 * de sesion: con Google no hay distincion, la primera vez crea la cuenta.
 * Crear la cuenta asi no da acceso a nada: sigue haciendo falta una invitacion.
 */
export function BotonGoogle({ deshabilitado = false }: { deshabilitado?: boolean }) {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onPress() {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Sin navegar: AuthGate reacciona a la sesion (en web la pagina se va a Google).
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo entrar con Google.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.caja}>
      <View style={styles.separador}>
        <View style={styles.linea} />
        <Text style={typography.muted}>o</Text>
        <View style={styles.linea} />
      </View>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Button
        title="Continuar con Google"
        variant="secondary"
        icon="logo-google"
        onPress={onPress}
        loading={enviando}
        disabled={deshabilitado}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { gap: space.md },
  separador: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  linea: { flex: 1, height: 1, backgroundColor: colors.border },
});
