import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RutaMapa, type RutaMapaHandle } from '../../src/components/RutaMapa';
import { Banner, EmptyState, Loading } from '../../src/components/ui';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { ventana } from '../../src/lib/fechas';
import { colors, radius, shadow, space, typography } from '../../src/lib/theme';

/**
 * El mapa de la ruta: un marcador numerado por bar y una linea que los une en
 * el orden de la ruta. El trazado es la secuencia de paradas, no un itinerario
 * a pie: dibujar calles reales necesitaria la Directions API de Google, que se
 * factura aparte. Se puede anadir mas adelante sin tocar el esquema.
 */
export default function RutaScreen() {
  const { activeRoute, bars, stamps, loading, error } = useActiveRoute();
  const mapaRef = useRef<RutaMapaHandle>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const sellados = useMemo(() => new Set(stamps.map((s) => s.route_bar_id)), [stamps]);

  function irA(barId: string) {
    const bar = bars.find((b) => b.id === barId);
    if (!bar || !mapaRef.current) return;
    setSeleccionado(barId);
    mapaRef.current.irA(bar);
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
      <RutaMapa
        ref={mapaRef}
        bars={bars}
        sellados={sellados}
        seleccionado={seleccionado}
        onSeleccionar={setSeleccionado}
      />

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
          <Pressable style={styles.botonEncuadre} onPress={() => mapaRef.current?.encuadrar()}>
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
});
