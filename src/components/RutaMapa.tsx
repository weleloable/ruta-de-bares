import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import {
  ZOOM_PARADA,
  crearControlEncuadre,
  desplazamientoCentroPx,
  latitudCentroDesplazado,
  type Huecos,
} from '../lib/encuadre';
import { ventana } from '../lib/fechas';
import { colors, mapStyle, radius } from '../lib/theme';
import type { RutaMapaHandle, RutaMapaProps } from './RutaMapa.types';

export type { RutaMapaHandle } from './RutaMapa.types';

/** Lo que tapan cabecera y carrusel mientras ruta.tsx no lo ha medido. */
const HUECOS_NATIVO_POR_DEFECTO: Huecos = { arriba: 90, abajo: 240 };

/**
 * El mapa de la pestana Ruta. Vive fuera de app/ y tiene variante
 * RutaMapa.web.tsx por una razon: react-native-maps no tiene build web y
 * revienta solo con importarlo ("codegenNativeComponent is not a function").
 * Un `Platform.OS === 'web'` en la pantalla no basta, porque el import
 * estatico ya mete el paquete en el bundle. Metro elige el .web.tsx al
 * bundlear para web y este archivo no llega a entrar.
 *
 * Mismas reglas de encuadre que en web (crearControlEncuadre, probado en
 * Node): un cambio de medida no reencuadra, solo la primera; y un array nuevo
 * con las mismas posiciones tampoco.
 */
export const RutaMapa = forwardRef<RutaMapaHandle, RutaMapaProps>(function RutaMapa(
  { bars, sellados, seleccionado, onSeleccionar, huecos },
  ref,
) {
  const mapaRef = useRef<MapView>(null);
  const altoMapa = useRef(0);
  // fitToCoordinates antes de onMapReady no hace nada: los encuadres automaticos
  // esperan a que el mapa este listo en vez de a un temporizador a ojo.
  const mapaListo = useRef(false);
  const [control] = useState(crearControlEncuadre);

  // Lo que tapan cabecera y carrusel se lee de una ref y no de las dependencias
  // de `encuadrar`: un cambio de medida solo afecta al siguiente encuadre.
  const tapado = useRef<Huecos>(HUECOS_NATIVO_POR_DEFECTO);
  tapado.current = {
    arriba: Math.round(huecos?.arriba ?? HUECOS_NATIVO_POR_DEFECTO.arriba),
    abajo: Math.round(huecos?.abajo ?? HUECOS_NATIVO_POR_DEFECTO.abajo),
  };
  const hayMedida = huecos !== undefined;

  // Solo cambia si cambian las posiciones: el proveedor recarga y entrega un
  // array nuevo con lo mismo, y eso no debe reencuadrar bajo el dedo del usuario.
  const firma = bars.map((b) => `${b.id}:${b.lat}:${b.lng}`).join('|');
  const coordenadas = useMemo(
    () => bars.map((bar) => ({ latitude: bar.lat, longitude: bar.lng })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firma],
  );

  /** `animar` solo cuando lo pide el usuario; los automaticos son instantaneos. */
  const encuadrar = useCallback(
    (animar = false) => {
      if (coordenadas.length === 0 || !mapaRef.current || !mapaListo.current) return;
      mapaRef.current.fitToCoordinates(coordenadas, {
        edgePadding: { top: tapado.current.arriba, right: 70, bottom: tapado.current.abajo, left: 70 },
        animated: animar,
      });
    },
    [coordenadas],
  );

  // Al cambiar las posiciones (si el mapa ya esta listo; si no, lo hara onMapReady).
  useEffect(() => {
    encuadrar();
  }, [encuadrar]);

  // Primera medida valida: un encuadre con los valores reales. Si llega antes de
  // que el mapa este listo, onMapReady ya encuadra leyendolos de la ref.
  useEffect(() => {
    if (control.medir(hayMedida)) encuadrar();
  }, [hayMedida, encuadrar, control]);

  useImperativeHandle(
    ref,
    () => ({
      encuadrar() {
        encuadrar(true);
      },
      irA(bar) {
        // Igual que en web: el bar al centro del hueco libre, no al centro de
        // la pantalla, a zoom de calle. El desplazamiento en pixeles se pasa a
        // latitud con Web Mercator exacto (latitudCentroDesplazado).
        // heading y pitch a 0: la camara parcial conserva el giro y la
        // inclinacion actuales, y con el mapa girado "hacia el sur" ya no es
        // "hacia abajo en pantalla" y el bar caeria junto al carrusel.
        const alto = altoMapa.current;
        const desplazamiento = alto > 0 ? desplazamientoCentroPx(alto, tapado.current) : 0;
        mapaRef.current?.animateCamera(
          {
            center: {
              latitude: latitudCentroDesplazado(bar.lat, desplazamiento, ZOOM_PARADA),
              longitude: bar.lng,
            },
            zoom: ZOOM_PARADA,
            heading: 0,
            pitch: 0,
          },
          { duration: 350 },
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
      onMapReady={() => {
        mapaListo.current = true;
        encuadrar();
      }}
      onLayout={(evento) => {
        altoMapa.current = evento.nativeEvent.layout.height;
      }}
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
