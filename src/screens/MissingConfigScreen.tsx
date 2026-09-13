import { ScrollView, StyleSheet, Text, View } from 'react-native';

/** Se muestra en vez de crashear cuando no hay .env: deja ver la app se
 * está montando aunque el backend todavía no esté configurado. */
export default function MissingConfigScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.emoji}>🍻</Text>
      <Text style={styles.title}>Ruta de Bares</Text>
      <Text style={styles.subtitle}>Falta configurar el backend</Text>

      <View style={styles.card}>
        <Text style={styles.step}>1. Copia el archivo de ejemplo:</Text>
        <Text style={styles.code}>cp .env.example .env</Text>

        <Text style={styles.step}>2. Rellena EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
        <Text style={styles.hint}>
          Los sacas de tu proyecto en supabase.com → Project Settings → API. Pasos completos en
          supabase/README.md.
        </Text>

        <Text style={styles.step}>3. Reinicia el servidor de Expo</Text>
        <Text style={styles.hint}>Los cambios en .env no se recargan en caliente.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  emoji: { fontSize: 48, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  subtitle: { fontSize: 15, color: '#b8860b', fontWeight: '600', textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: '#fafafa', borderRadius: 12, borderWidth: 1, borderColor: '#eee', padding: 16 },
  step: { fontWeight: '700', marginTop: 12, fontSize: 14 },
  code: {
    fontFamily: 'monospace',
    backgroundColor: '#222',
    color: '#0f0',
    padding: 10,
    borderRadius: 6,
    marginTop: 6,
    fontSize: 13,
  },
  hint: { color: '#888', fontSize: 12, marginTop: 4 },
});
