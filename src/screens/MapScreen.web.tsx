// Variante para web: Metro elige este archivo automáticamente cuando el
// bundle es "web" (por el sufijo .web.tsx), en vez de MapScreen.tsx. Es un
// archivo aparte, no una rama de Platform.OS dentro del mismo archivo, a
// propósito: así `react-native-maps` (que no tiene build web y puede
// romper solo con importarlo, aunque no se llegue a renderizar) nunca
// entra en el grafo de módulos del bundle web.
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useActiveRoute } from '../hooks/useActiveRoute';
import { formatSchedule } from '../lib/format';

export default function MapScreen() {
  const { loading, error, route, bars, refresh } = useActiveRoute();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No se pudo cargar la ruta: {error}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (!route || bars.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          Todavía no hay una ruta activa. Pídele a un admin que publique la de este año.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{route.name}</Text>
        <Text style={styles.hint}>
          El mapa interactivo solo se ve en un móvil (Expo Go) o build nativo: react-native-maps
          no tiene soporte web. Aquí tienes la ruta en orden.
        </Text>
      </View>
      <FlatList
        data={bars}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.barName}>
              {item.orderIndex + 1}. {item.name}
            </Text>
            {item.address && <Text style={styles.address}>{item.address}</Text>}
            <Text style={styles.schedule}>{formatSchedule(item.startTime, item.endTime)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  emptyText: { textAlign: 'center', color: '#555' },
  retryButton: { backgroundColor: '#b8860b', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { color: '#fff', fontWeight: '600' },
  header: { padding: 16, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerText: { fontWeight: '700', fontSize: 16 },
  hint: { color: '#888', fontSize: 12, marginTop: 4 },
  list: { padding: 16 },
  row: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    marginBottom: 8,
  },
  barName: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  address: { color: '#555', marginBottom: 4 },
  schedule: { color: '#b8860b', fontWeight: '600' },
});
