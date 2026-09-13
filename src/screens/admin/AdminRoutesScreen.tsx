import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { adminCreateRoute, adminListRoutes, adminSetRouteActive } from '../../lib/api/routes';
import type { AdminStackParamList } from '../../navigation/types';
import type { Route } from '../../types/domain';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminRoutes'>;

export default function AdminRoutesScreen({ navigation }: Props) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [name, setName] = useState(`Ruta de bares ${currentYear}`);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRoutes(await adminListRoutes());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear) || !name.trim()) return;
    setSaving(true);
    try {
      await adminCreateRoute({ year: parsedYear, name: name.trim() });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(route: Route) {
    try {
      await adminSetRouteActive(route.id, !route.isActive);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={routes}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.sectionTitle}>Nueva ruta anual</Text>
          <View style={styles.form}>
            <TextInput
              style={[styles.input, styles.yearInput]}
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              placeholder="Año"
            />
            <TextInput
              style={[styles.input, styles.nameInput]}
              value={name}
              onChangeText={setName}
              placeholder="Nombre"
            />
          </View>
          <Pressable style={styles.createButton} onPress={handleCreate} disabled={saving}>
            <Text style={styles.createButtonText}>{saving ? 'Creando…' : 'Crear ruta'}</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.sectionTitle}>Rutas</Text>
          {loading && <ActivityIndicator style={{ marginVertical: 12 }} />}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.routeRow}
          onPress={() => navigation.navigate('AdminBars', { routeId: item.id, routeName: item.name })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.routeName}>
              {item.year} — {item.name}
            </Text>
            <Text style={styles.routeHint}>Toca para gestionar bares</Text>
          </View>
          <View style={styles.activeToggle}>
            <Text style={styles.activeLabel}>Activa</Text>
            <Switch value={item.isActive} onValueChange={() => toggleActive(item)} />
          </View>
        </Pressable>
      )}
      ListEmptyComponent={!loading ? <Text style={styles.emptyText}>Sin rutas todavía.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  form: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15 },
  yearInput: { width: 90 },
  nameInput: { flex: 1 },
  createButton: { backgroundColor: '#b8860b', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 10 },
  createButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#c00', marginTop: 8 },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    marginBottom: 8,
  },
  routeName: { fontWeight: '700', fontSize: 15 },
  routeHint: { color: '#888', fontSize: 12, marginTop: 2 },
  activeToggle: { alignItems: 'center' },
  activeLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 20 },
});
