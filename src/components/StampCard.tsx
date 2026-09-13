import { StyleSheet, Text, View } from 'react-native';
import { formatSchedule, formatSealedAt } from '../lib/format';
import type { StampEntry } from '../types/domain';

/** Una "casilla" de la compostelana: sellada (con fecha) o pendiente. */
export default function StampCard({ entry }: { entry: StampEntry }) {
  const sealed = entry.sealedAt !== null;
  return (
    <View style={[styles.card, sealed ? styles.sealed : styles.pending]}>
      <View style={[styles.stamp, sealed && styles.stampSealed]}>
        <Text style={[styles.stampText, sealed && styles.stampTextSealed]}>
          {sealed ? '✓' : entry.bar.orderIndex + 1}
        </Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {entry.bar.name}
      </Text>
      <Text style={styles.schedule}>
        {formatSchedule(entry.bar.startTime, entry.bar.endTime)}
      </Text>
      {sealed && entry.sealedAt && (
        <Text style={styles.sealedAt}>Sellado {formatSealedAt(entry.sealedAt)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47%',
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  sealed: { borderColor: '#b8860b', backgroundColor: '#fff8e7' },
  pending: { borderColor: '#ddd', backgroundColor: '#fafafa' },
  stamp: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  stampSealed: { borderColor: '#b8860b', backgroundColor: '#b8860b' },
  stampText: { fontSize: 18, fontWeight: '700', color: '#777' },
  stampTextSealed: { color: '#fff' },
  name: { fontWeight: '600', fontSize: 14, textAlign: 'center' },
  schedule: { fontSize: 12, color: '#888', marginTop: 2 },
  sealedAt: { fontSize: 11, color: '#b8860b', marginTop: 4, fontWeight: '600' },
});
