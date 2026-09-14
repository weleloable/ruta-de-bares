import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, EmptyState, Loading } from '../../src/components/ui';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { ventana } from '../../src/lib/fechas';
import { colors, mapStyle, radius, shadow, space, typography } from '../../src/lib/theme';

/**
 * El mapa de la ruta: un marcador numerado por bar y una linea que los une en
 * el orden de la ruta. El trazado es la secuencia de paradas, no un itinerario
 * a pie: dibujar calles reales necesitaria la Directions API de Google, que se
 * factura aparte. Se puede anadir mas adelante sin tocar el esquema.
 */
export default function RutaScreen() {
  const { activeRoute, bars, stamps, loading, error } = useActiveRoute();
  const mapaRef = useRef<MapView>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const sellados = useMemo(() => new Set(stamps.map((s) => s.route_bar_id)), [stamps]);

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

  function irA(barId: string) {
    const bar = bars.find((b) => b.id === barId);
    if (!bar || !mapaRef.current) return;
    setSeleccionado(barId);
    mapaRef.current.animateToRegion(
      { latitude: bar.lat, longitude: bar.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 },
      350,
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.pantalla}>
        <EmptyState
          title="El mapa es solo para movil"
          body="react-native-maps necesita el mapa nativo. Abre la app en el movil para ver la ruta."
        />
      </SafeAreaView>
    );
  }

  if (loading && bars.length === 0) return <Loading label="Cargando el mapa..." />;

  if (!activeRoute) {
    return (
      <SafeAreaView style={styles.pantalla}>
        <EmptyState
          title="Sin ruta que dibujar"
          body="Cuando haya una ruta publicada veras aqui sus bares y el trazado que los une."
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.pantalla}>
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
              onPress={() => setSeleccionado(bar.id)}
              tracksViewChanges={false}
            >
              <View style={[styles.pin, sellado && styles.pinSellado]}>
                <Text style={[styles.pinTexto, sellado && styles.pinTextoSellado]}>
                  {indice + 1}
                </Text>
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

      <SafeAreaView style={styles.superpuesto} pointerEvents="box-none" edges={['top', 'bottom']}>
        <View style={styles.cabecera}>
          <Text style={typography.sectionTitle} numberOfLines={1}>
            {activeRoute.name}
          </Text>
          <Text style={typography.muted}>
            {bars.length} paradas, {sellados.size} selladas
          </Text>
        </View>

        {error ? (
          <View style={styles.avisoError}>
            <Banner tone="error">{error}</Banner>
          </View>
        ) : null}

        <View style={styles.pie} pointerEvents="box-none">
          <Pressable style={styles.botonEncuadre} onPress={encuadrar}>
            <Text style={styles.botonEncuadreTexto}>Ver toda la ruta</Text>
          </Pressable>

          {bars.length === 0 ? (
            <View style={[styles.tarjeta, styles.tarjetaSuelta]}>
              <Text style={typography.muted}>Esta ruta todavia no tiene paradas.</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carrusel}
            >
              {bars.map((bar, indice) => (
                <Pressable
                  key={bar.id}
                  onPress={() => irA(bar.id)}
                  style={[styles.tarjeta, bar.id === seleccionado && styles.tarjetaActiva]}
                >
                  <Text style={typography.overline}>
                    Parada {indice + 1}
                    {sellados.has(bar.id) ? ' - sellada' : ''}
                  </Text>
                  <Text style={typography.cardTitle} numberOfLines={1}>
                    {bar.name}
                  </Text>
                  <Text style={typography.muted} numberOfLines={1}>
                    {ventana(new Date(bar.opens_at), new Date(bar.closes_at))}
                  </Text>
                  {bar.address.length > 0 ? (
                    <Text style={typography.muted} numberOfLines={1}>
                      {bar.address}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  superpuesto: { flex: 1, justifyContent: 'space-between' },
  cabecera: {
    margin: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  avisoError: { marginHorizontal: space.lg },
  pie: { gap: space.md, paddingBottom: space.md },
  botonEncuadre: {
    alignSelf: 'flex-end',
    marginRight: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow,
  },
  botonEncuadreTexto: { fontSize: 13, fontWeight: '700', color: colors.ink },
  carrusel: { gap: space.md, paddingHorizontal: space.lg },
  tarjeta: {
    width: 220,
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  // El carrusel ya pone el margen lateral; la tarjeta suelta del estado vacio no.
  tarjetaSuelta: { marginHorizontal: space.lg, width: 'auto' },
  tarjetaActiva: { borderColor: colors.stamp, borderWidth: 2 },
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
