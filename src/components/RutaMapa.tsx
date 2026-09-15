import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { ventana } from '../lib/fechas';
import { colors, mapStyle, radius } from '../lib/theme';
import type { RutaMapaHandle, RutaMapaProps } from './RutaMapa.types';

export type { RutaMapaHandle } from './RutaMapa.types';

/**
 * El mapa de la pestana Ruta. Vive fuera de app/ y tiene variante
 * RutaMapa.web.tsx por una razon: react-native-maps no tiene build web y
 * revienta solo con importarlo ("codegenNativeComponent is not a function").
 * Un `Platform.OS === 'web'` en la pantalla no basta, porque el import
 * estatico ya mete el paquete en el bundle. Metro elige el .web.tsx al
 * bundlear para web y este archivo no llega a entrar.
 */
export const RutaMapa = forwardRef<RutaMapaHandle, RutaMapaProps>(function RutaMapa(
  { bars, sellados, seleccionado, onSeleccionar },
  ref,
) {
  const mapaRef = useRef<MapView>(null);

  const coordenadas = useMemo(
    () => bars.map((bar) => ({ latitude: bar.lat, longitude: bar.lng })),
    [bars],
  );

  const encuadrar = useCallback(() => {
    if (coordenadas.length === 0 || !mapaRef.current) return;
    mapaRef.current.fitToCoordinates(coordenadas, {
      edgePadding: { top: 90, right: 70, bottom: 240, left: 70 },
      animated: true,
    });
  }, [coordenadas]);

  useEffect(() => {
    // Pequena espera: fitToCoordinates antes de que el mapa tenga tamano no
    // hace nada y el usuario se queda mirando el oceano Atlantico.
    const id = setTimeout(encuadrar, 450);
    return () => clearTimeout(id);
  }, [encuadrar]);

  useImperativeHandle(
    ref,
    () => ({
      encuadrar,
      irA(bar) {
        mapaRef.current?.animateToRegion(
          { latitude: bar.lat, longitude: bar.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 },
          350,
        );
      },
    }),
    [encuadrar],
  );

  return (
    <MapView
      ref={mapaRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      customMapStyle={mapStyle}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onMapReady={encuadrar}
      initialRegion={
        coordenadas.length > 0
          ? {
              latitude: coordenadas[0].latitude,
              longitude: coordenadas[0].longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }
          : undefined
      }
    >
      {coordenadas.length > 1 ? (
        <Polyline
          coordinates={coordenadas}
          strokeColor={colors.stamp}
          strokeWidth={4}
          lineDashPattern={[12, 8]}
        />
      ) : null}

      {bars.map((bar, indice) => {
        const sellado = sellados.has(bar.id);
        return (
          <Marker
            key={bar.id}
            coordinate={{ latitude: bar.lat, longitude: bar.lng }}
            title={`${indice + 1}. ${bar.name}`}
            description={ventana(new Date(bar.opens_at), new Date(bar.closes_at))}
            onPress={() => onSeleccionar(bar.id)}
            tracksViewChanges={false}
          >
            <View style={[styles.pin, sellado && styles.pinSellado]}>
              <Text style={[styles.pinTexto, sellado && styles.pinTextoSellado]}>{indice + 1}</Text>
            </View>
          </Marker>
        );
      })}

      {seleccionado
        ? bars
            .filter((bar) => bar.id === seleccionado)
            .map((bar) => (
              <Circle
                key={`radio-${bar.id}`}
                center={{ latitude: bar.lat, longitude: bar.lng }}
                radius={bar.radius_m}
                strokeColor={colors.stamp}
                fillColor="rgba(168, 44, 36, 0.12)"
                strokeWidth={1}
              />
            ))
        : null}
    </MapView>
  );
});

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSellado: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  pinTexto: { fontWeight: '800', color: colors.ink },
  pinTextoSellado: { color: colors.white },
});
