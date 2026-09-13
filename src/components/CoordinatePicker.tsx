// Versión nativa: tocar el mapa marca la posición del bar. En web, Metro
// usa CoordinatePicker.web.tsx en su lugar (react-native-maps no tiene
// build web). Mantenerlo en un componente aparte, en vez de dentro de
// AdminBarsScreen, es lo que evita que react-native-maps entre en el
// bundle web: React Navigation importa todas las screens del stack de
// admin de forma estática, se abra o no esa pestaña.
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type MapPressEvent } from 'react-native-maps';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

const DEFAULT_REGION = { latitude: 40.4168, longitude: -3.7038, latitudeDelta: 0.05, longitudeDelta: 0.05 };

export default function CoordinatePicker({
  value,
  onChange,
}: {
  value: Coordinate | null;
  onChange: (coord: Coordinate) => void;
}) {
  function handlePress(e: MapPressEvent) {
    onChange(e.nativeEvent.coordinate);
  }

  return (
    <View>
      <Text style={styles.hint}>Toca el mapa para marcar dónde está el bar</Text>
      <MapView
        style={styles.map}
        initialRegion={value ? { ...value, latitudeDelta: 0.02, longitudeDelta: 0.02 } : DEFAULT_REGION}
        onPress={handlePress}
      >
        {value && <Marker coordinate={value} />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: '#888', fontSize: 12, marginBottom: 6 },
  map: { height: 180, borderRadius: 10, marginBottom: 10 },
});
