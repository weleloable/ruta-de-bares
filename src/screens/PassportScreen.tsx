import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import StampCard from '../components/StampCard';
import { useAuth } from '../contexts/AuthContext';
import { useActiveRoute } from '../hooks/useActiveRoute';
import { buildStampEntries, computeGroupProgress, computeProgress } from '../lib/seals';

export default function PassportScreen() {
  const { profile } = useAuth();
  const { loading, error, route, bars, seals, profiles, refresh } = useActiveRoute();

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
        <Text style={styles.errorText}>No se pudo cargar tu compostelana: {error}</Text>
      </View>
    );
  }

  if (!route || bars.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Todavía no hay una ruta activa.</Text>
      </View>
    );
  }

  const mySeals = seals.filter((s) => s.userId === profile?.id);
  const entries = buildStampEntries(bars, mySeals);
  const progress = computeProgress(entries);
  const group = computeGroupProgress(bars.length, seals);
  const nameById = new Map(profiles.map((p) => [p.id, p.displayName]));

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={entries}
      keyExtractor={(e) => e.bar.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>{route.name}</Text>
          <Text style={styles.progress}>
            {progress.sealed} / {progress.total} sellos
            {progress.complete ? ' — ¡Compostelana completa! 🎉' : ''}
          </Text>

          <Text style={styles.sectionTitle}>Progreso del grupo</Text>
          {group.map((g) => (
            <Text key={g.userId} style={styles.groupRow}>
              {g.userId === profile?.id ? 'Tú' : (nameById.get(g.userId) ?? '(desconocido)')} —{' '}
              {g.sealed}/{bars.length}
            </Text>
          ))}

          <Text style={styles.sectionTitle}>Tus sellos</Text>
        </View>
      }
      renderItem={({ item }) => <StampCard entry={item} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#c00', textAlign: 'center' },
  emptyText: { color: '#555', textAlign: 'center' },
  list: { padding: 16 },
  row: { justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  progress: { fontSize: 15, color: '#b8860b', fontWeight: '600', marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 8, marginBottom: 8 },
  groupRow: { fontSize: 13, color: '#555', marginBottom: 2 },
});
