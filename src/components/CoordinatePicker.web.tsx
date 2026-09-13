// Variante web: sin mapa interactivo (react-native-maps no tiene build
// web), así que la posición se introduce a mano. Sirve para probar el
// flujo de "añadir bar" desde el navegador; para tocar el mapa de verdad
// usa Expo Go en el móvil.
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Coordinate } from './CoordinatePicker';

export default function CoordinatePicker({
  value,
  onChange,
}: {
  value: Coordinate | null;
  onChange: (coord: Coordinate) => void;
}) {
  function update(field: 'latitude' | 'longitude', text: string) {
    const n = Number(text.replace(',', '.'));
    if (Number.isNaN(n)) return;
    onChange({
      latitude: field === 'latitude' ? n : (value?.latitude ?? 0),
      longitude: field === 'longitude' ? n : (value?.longitude ?? 0),
    });
  }

  return (
    <View>
      <Text style={styles.hint}>
        El mapa interactivo solo está disponible en móvil. Introduce la latitud/longitud a mano
        (por ejemplo, copiadas de Google Maps).
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Latitud (ej. 40.4168)"
          keyboardType="numeric"
          defaultValue={value ? String(value.latitude) : ''}
          onChangeText={(t) => update('latitude', t)}
        />
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Longitud (ej. -3.7038)"
          keyboardType="numeric"
          defaultValue={value ? String(value.longitude) : ''}
          onChangeText={(t) => update('longitude', t)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: '#888', fontSize: 12, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  half: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15 },
});
