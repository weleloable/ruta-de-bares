import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { encodeStampPayload } from '../../lib/qr';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminBarQr'>;

/** QR listo para imprimir y dejar en el bar. Codifica routeId+barId+secreto;
 * el secreto lo valida el servidor en redeem_stamp, nunca aquí. */
export default function AdminBarQrScreen({ route, navigation }: Props) {
  const { barId, barName } = route.params;
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: `QR — ${barName}` });
    let cancelled = false;
    supabase
      .from('bars')
      .select('id, route_id, qr_secret')
      .eq('id', barId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError(err?.message ?? 'Bar no encontrado');
          return;
        }
        setValue(
          encodeStampPayload({ routeId: data.route_id, barId: data.id, secret: data.qr_secret })
        );
      });
    return () => {
      cancelled = true;
    };
  }, [barId, barName, navigation]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!value) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <View style={styles.card}>
        <QRCode value={value} size={260} />
      </View>
      <Text style={styles.barName}>{barName}</Text>
      <Text style={styles.hint}>
        Imprime este QR y déjalo visible en el bar. Cada usuario lo escanea con la app para sellar
        su compostelana.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  card: { padding: 20, borderRadius: 16, borderWidth: 2, borderColor: '#eee', marginBottom: 16 },
  barName: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  hint: { color: '#888', textAlign: 'center', fontSize: 13 },
  error: { color: '#c00' },
});
