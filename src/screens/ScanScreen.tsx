import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { decodeStampPayload } from '../lib/qr';
import { redeemStamp } from '../lib/api/stamps';

type Feedback =
  | { kind: 'success'; barName: string; alreadySealed: boolean }
  | { kind: 'error'; message: string };

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  // Evita procesar el mismo frame dos veces mientras la petición está en vuelo.
  const lockedRef = useRef(false);

  async function handleScan({ data }: BarcodeScanningResult) {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setBusy(true);
    setFeedback(null);

    const decoded = decodeStampPayload(data);
    if (!decoded.ok) {
      setFeedback({ kind: 'error', message: 'Este código no es un sello válido de Ruta de Bares.' });
      setBusy(false);
      lockedRef.current = false;
      return;
    }

    try {
      const result = await redeemStamp(decoded.payload);
      if (result.ok) {
        setFeedback({ kind: 'success', barName: result.barName, alreadySealed: result.alreadySealed });
      } else {
        const message =
          result.error === 'invalid_secret'
            ? 'El código no coincide con este bar. ¿Es un QR falso?'
            : 'Este bar no pertenece a la ruta activa.';
        setFeedback({ kind: 'error', message });
      }
    } catch (e) {
      setFeedback({ kind: 'error', message: e instanceof Error ? e.message : 'Error al sellar.' });
    } finally {
      setBusy(false);
    }
  }

  function scanAgain() {
    setFeedback(null);
    lockedRef.current = false;
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          Necesitamos la cámara para escanear el QR del bar.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Dar permiso</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {feedback ? (
        <View style={styles.center}>
          {feedback.kind === 'success' ? (
            <>
              <Text style={styles.successEmoji}>{feedback.alreadySealed ? '📖' : '🎉'}</Text>
              <Text style={styles.successTitle}>
                {feedback.alreadySealed ? 'Ya tenías este sello' : '¡Sello conseguido!'}
              </Text>
              <Text style={styles.successBar}>{feedback.barName}</Text>
            </>
          ) : (
            <>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>{feedback.message}</Text>
            </>
          )}
          <Pressable style={styles.button} onPress={scanAgain}>
            <Text style={styles.buttonText}>Escanear otro</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : handleScan}
          />
          <View style={styles.overlay}>
            <View style={styles.scanBox} />
            <Text style={styles.hint}>Apunta al QR del bar</Text>
            {busy && <ActivityIndicator style={{ marginTop: 12 }} color="#fff" />}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionText: { textAlign: 'center', marginBottom: 16, fontSize: 16 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanBox: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: { color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' },
  button: { backgroundColor: '#b8860b', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24, marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  successEmoji: { fontSize: 56, marginBottom: 12 },
  successTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  successBar: { fontSize: 16, color: '#555' },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { textAlign: 'center', color: '#c00', fontSize: 16 },
});
