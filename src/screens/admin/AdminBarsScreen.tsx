import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import CoordinatePicker, { type Coordinate } from '../../components/CoordinatePicker';
import { adminCreateBar, adminDeleteBar, adminListBars } from '../../lib/api/bars';
import { formatSchedule } from '../../lib/format';
import type { AdminStackParamList } from '../../navigation/types';
import type { Bar } from '../../types/domain';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminBars'>;

const MIN_BARS = 5;
const MAX_BARS = 20;

export default function AdminBarsScreen({ route, navigation }: Props) {
  const { routeId, routeName } = route.params;
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:00');
  const [coord, setCoord] = useState<Coordinate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBars(await adminListBars(routeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    navigation.setOptions({ title: routeName });
    load();
  }, [load, navigation, routeName]);

  const atMax = bars.length >= MAX_BARS;

  async function handleAdd() {
    if (!name.trim() || !coord) {
      Alert.alert('Faltan datos', 'Ponle nombre al bar y toca el mapa para marcar dónde está.');
      return;
    }
    setSaving(true);
    try {
      await adminCreateBar({
        routeId,
        name: name.trim(),
        address: address.trim() || undefined,
        latitude: coord.latitude,
        longitude: coord.longitude,
        startTime,
        endTime,
        orderIndex: bars.length,
      });
      setName('');
      setAddress('');
      setCoord(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(bar: Bar) {
    Alert.alert('Eliminar bar', `¿Quitar "${bar.name}" de la ruta?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await adminDeleteBar(bar.id);
          await load();
        },
      },
    ]);
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={bars}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={
        <View>
          {atMax ? (
            <Text style={styles.limitNotice}>
              Esta ruta ya tiene el máximo de {MAX_BARS} bares.
            </Text>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Añadir bar</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre del bar"
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={styles.input}
                placeholder="Dirección (opcional)"
                value={address}
                onChangeText={setAddress}
              />
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  placeholder="Entrada 19:00"
                  value={startTime}
                  onChangeText={setStartTime}
                />
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  placeholder="Salida 20:00"
                  value={endTime}
                  onChangeText={setEndTime}
                />
              </View>
              <CoordinatePicker value={coord} onChange={setCoord} />
              <Pressable style={styles.addButton} onPress={handleAdd} disabled={saving}>
                <Text style={styles.addButtonText}>{saving ? 'Guardando…' : 'Añadir bar'}</Text>
              </Pressable>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.sectionTitle}>
            Bares de la ruta ({bars.length}/{MAX_BARS})
          </Text>
          {bars.length > 0 && bars.length < MIN_BARS && (
            <Text style={styles.minNotice}>
              Faltan {MIN_BARS - bars.length} para poder activar la ruta (mínimo {MIN_BARS}).
            </Text>
          )}
          {loading && <ActivityIndicator style={{ marginVertical: 12 }} />}
        </View>
      }
      renderItem={({ item, index }) => (
        <View style={styles.barRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.barName}>
              {index + 1}. {item.name}
            </Text>
            <Text style={styles.barSchedule}>{formatSchedule(item.startTime, item.endTime)}</Text>
          </View>
          <Pressable style={styles.deleteButton} onPress={() => handleDelete(item)}>
            <Text style={styles.deleteButtonText}>✕</Text>
          </Pressable>
        </View>
      )}
      ListEmptyComponent={!loading ? <Text style={styles.emptyText}>Sin bares todavía.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  timeInput: { flex: 1 },
  addButton: { backgroundColor: '#b8860b', borderRadius: 8, padding: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#c00', marginTop: 8 },
  limitNotice: { color: '#b8860b', fontWeight: '600', marginTop: 16, marginBottom: 4 },
  minNotice: { color: '#c00', fontSize: 12, marginBottom: 8 },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    marginBottom: 8,
    gap: 8,
  },
  barName: { fontWeight: '700', fontSize: 15 },
  barSchedule: { color: '#888', fontSize: 12, marginTop: 2 },
  deleteButton: { padding: 8 },
  deleteButtonText: { color: '#c00', fontWeight: '700', fontSize: 16 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 20 },
});
