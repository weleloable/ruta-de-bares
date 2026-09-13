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
import MapView, { Marker, type MapPressEvent } from 'react-native-maps';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { adminCreateBar, adminDeleteBar, adminListBars } from '../../lib/api/bars';
import { formatSchedule } from '../../lib/format';
import type { AdminStackParamList } from '../../navigation/types';
import type { AdminBar } from '../../types/domain';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminBars'>;

const DEFAULT_REGION = { latitude: 40.4168, longitude: -3.7038, latitudeDelta: 0.05, longitudeDelta: 0.05 };

export default function AdminBarsScreen({ route, navigation }: Props) {
  const { routeId, routeName } = route.params;
  const [bars, setBars] = useState<AdminBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:00');
  const [coord, setCoord] = useState<{ latitude: number; longitude: number } | null>(null);

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

  function handleMapPress(e: MapPressEvent) {
    setCoord(e.nativeEvent.coordinate);
  }

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

  function handleDelete(bar: AdminBar) {
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
          <Text style={styles.sectionTitle}>Añadir bar</Text>
          <TextInput style={styles.input} placeholder="Nombre del bar" value={name} onChangeText={setName} />
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
          <Text style={styles.mapHint}>Toca el mapa para marcar dónde está el bar</Text>
          <MapView
            style={styles.map}
            initialRegion={coord ? { ...coord, latitudeDelta: 0.02, longitudeDelta: 0.02 } : DEFAULT_REGION}
            onPress={handleMapPress}
          >
            {coord && <Marker coordinate={coord} />}
          </MapView>
          <Pressable style={styles.addButton} onPress={handleAdd} disabled={saving}>
            <Text style={styles.addButtonText}>{saving ? 'Guardando…' : 'Añadir bar'}</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.sectionTitle}>Bares de la ruta ({bars.length})</Text>
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
          <Pressable
            style={styles.qrButton}
            onPress={() => navigation.navigate('AdminBarQr', { barId: item.id, barName: item.name })}
          >
            <Text style={styles.qrButtonText}>QR</Text>
          </Pressable>
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
  mapHint: { color: '#888', fontSize: 12, marginBottom: 6 },
  map: { height: 180, borderRadius: 10, marginBottom: 10 },
  addButton: { backgroundColor: '#b8860b', borderRadius: 8, padding: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#c00', marginTop: 8 },
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
  qrButton: { backgroundColor: '#eee', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  qrButtonText: { fontWeight: '700', color: '#333' },
  deleteButton: { padding: 8 },
  deleteButtonText: { color: '#c00', fontWeight: '700', fontSize: 16 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 20 },
});
