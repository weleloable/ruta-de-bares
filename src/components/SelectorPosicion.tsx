import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type MapPressEvent } from 'react-native-maps';

import { colors, mapStyle, radius, typography } from '../lib/theme';
import type { SelectorPosicionProps } from './SelectorPosicion.types';

/**
 * Selector de la posicion de un bar en el editor: tocar el mapa o arrastrar
 * el pin, con el circulo del radio de sellado dibujado en el sitio.
 *
 * Tiene variante SelectorPosicion.web.tsx por el mismo motivo que RutaMapa:
 * react-native-maps rompe el bundle web solo con importarlo.
 */
export function SelectorPosicion({ punto, radioM, centroInicial, onCambiar }: SelectorPosicionProps) {
  function onTocarMapa(evento: MapPressEvent) {
    const { latitude, longitude } = evento.nativeEvent.coordinate;
    onCambiar({ lat: latitude, lng: longitude });
  }

  return (
    <>
      <Text style={typography.muted}>
        Toca el mapa o arrastra el pin. El circulo es la zona desde la que se puede sellar.
      </Text>
      <View style={styles.mapaCaja}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          customMapStyle={mapStyle}
          onPress={onTocarMapa}
          initialRegion={{
            latitude: punto?.lat ?? centroInicial.lat,
            longitude: punto?.lng ?? centroInicial.lng,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }}
        >
          {punto ? (
            <>
              <Marker
                coordinate={{ latitude: punto.lat, longitude: punto.lng }}
                draggable
                onDragEnd={(e) =>
                  onCambiar({
                    lat: e.nativeEvent.coordinate.latitude,
                    lng: e.nativeEvent.coordinate.longitude,
                  })
                }
                pinColor={colors.stamp}
              />
              {radioM !== null ? (
                <Circle
                  center={{ latitude: punto.lat, longitude: punto.lng }}
                  radius={radioM}
                  strokeColor={colors.stamp}
                  fillColor="rgba(168, 44, 36, 0.14)"
                  strokeWidth={1}
                />
              ) : null}
            </>
          ) : null}
        </MapView>
      </View>
      <Text style={typography.muted}>
        {punto ? `${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)}` : 'Sin posicion marcada todavia.'}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  mapaCaja: {
    height: 260,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
