import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useActiveRoute } from '../hooks/useActiveRoute';
import { formatSchedule } from '../lib/format';
import type { Bar } from '../types/domain';

export default function MapScreen() {
  const { loading, error, route, bars, refresh } = useActiveRoute();
  const [selected, setSelected] = useState<Bar | null>(null);

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

  const initialRegion = {
    latitude: bars[0].latitude,
    longitude: bars[0].longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
        <Polyline
          coordinates={bars.map((b) => ({ latitude: b.latitude, longitude: b.longitude }))}
          strokeColor="#b8860b"
          strokeWidth={3}
        />
        {bars.map((bar, i) => (
          <Marker
            key={bar.id}
            coordinate={{ latitude: bar.latitude, longitude: bar.longitude }}
            title={`${i + 1}. ${bar.name}`}
            description={formatSchedule(bar.startTime, bar.endTime)}
            onPress={() => setSelected(bar)}
          />
        ))}
      </MapView>

      <View style={styles.header}>
        <Text style={styles.headerText}>{route.name}</Text>
      </View>

      <Modal visible={selected !== null} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          {selected && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {selected.orderIndex + 1}. {selected.name}
              </Text>
              {selected.address && <Text style={styles.cardAddress}>{selected.address}</Text>}
              <Text style={styles.cardSchedule}>
                {formatSchedule(selected.startTime, selected.endTime)}
              </Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#c00', textAlign: 'center', marginBottom: 12 },
  emptyText: { textAlign: 'center', color: '#555' },
  retryButton: { backgroundColor: '#b8860b', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { color: '#fff', fontWeight: '600' },
  header: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  headerText: { fontWeight: '700', fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  cardAddress: { color: '#555', marginBottom: 4 },
  cardSchedule: { color: '#b8860b', fontWeight: '600' },
});
