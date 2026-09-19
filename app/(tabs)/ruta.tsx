import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RutaMapa, type RutaMapaHandle } from '../../src/components/RutaMapa';
import { Banner, EmptyState, Loading } from '../../src/components/ui';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { direccionVisible } from '../../src/features/routes/catalogo';
import { huecosDesdeMedidas } from '../../src/lib/encuadre';
import { ventana } from '../../src/lib/fechas';
import { colors, radius, shadow, space, typography } from '../../src/lib/theme';

/** Aire entre lo que tapa el mapa y el primer pin que se ve. */
const AIRE_PX = 8;

/**
 * El mapa de la ruta: un marcador numerado por bar y una linea que los une en
 * el orden de la ruta. En movil es Google Maps (RutaMapa.tsx) y en web
 * OpenStreetMap (RutaMapa.web.tsx), con la misma API.
 *
 * El trazado es la secuencia de paradas, no un itinerario a pie: dibujar
 * calles reales necesitaria la Directions API de Google, que se factura aparte.
 *
 * Cabecera y carrusel van encima del mapa. Se mide su ALTO con onLayout y se le
 * pasa al mapa cuanto tapan (ver huecosDesdeMedidas), para que encuadrar e "ir a
 * un bar" dejen los pines en el hueco que se ve. Nunca su posicion: en web
 * onLayout no avisa cuando un elemento solo se mueve.
 */
export default function RutaScreen() {
  const { activeRoute, bars, stamps, loading, error } = useActiveRoute();
  const mapaRef = useRef<RutaMapaHandle>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [altoSuperior, setAltoSuperior] = useState(0);
  const [altoPie, setAltoPie] = useState(0);

  const sellados = useMemo(() => new Set(stamps.map((s) => s.route_bar_id)), [stamps]);

  // Sin las dos medidas no se pasa nada y el mapa usa sus valores por defecto.
  const huecos = useMemo(
    () =>
      altoSuperior > 0 && altoPie > 0
        ? huecosDesdeMedidas({
            altoSuperior,
            altoPie,
            // 0 y no insets.top: el mapa empieza debajo de BarraSuperior, que ya
            // se come el notch. useSafeAreaInsets lo sigue devolviendo igual.
            margenSeguroArriba: 0,
            margenSeguroAbajo: insets.bottom,
            aire: AIRE_PX,
          })
        : undefined,
    [altoSuperior, altoPie, insets.bottom],
  );

  // Redondeado a pixel y sin actualizar si no cambia: onLayout se dispara a
  // menudo y cada actualizacion repinta la pantalla. Una lectura de 0 se
  // ignora: es la pestana oculta con display:none, no una cabecera vacia, y
  // perder la medida al cambiar de pestana hacia creer al mapa que no hay nada
  // encima.
  const medirSuperior = useCallback((evento: LayoutChangeEvent) => {
    const alto = Math.round(evento.nativeEvent.layout.height);
    if (alto > 0) setAltoSuperior((previo) => (previo === alto ? previo : alto));
  }, []);
  const medirPie = useCallback((evento: LayoutChangeEvent) => {
    const alto = Math.round(evento.nativeEvent.layout.height);
    if (alto > 0) setAltoPie((previo) => (previo === alto ? previo : alto));
  }, []);

  function irA(barId: string) {
    const bar = bars.find((b) => b.id === barId);
    if (!bar || !mapaRef.current) return;
    setSeleccionado(barId);
    mapaRef.current.irA(bar);
  }

  if (loading && bars.length === 0) return <Loading label="Cargando el mapa..." />;

  if (!activeRoute) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['bottom', 'left', 'right']}>
        <EmptyState
          title="Sin ruta que dibujar"
          body="Aqui solo salen las rutas a las que te han invitado. Abre el enlace de invitacion que te pasen y su mapa aparecera aqui."
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
        huecos={huecos}
      />

      <SafeAreaView style={styles.superpuesto} pointerEvents="box-none" edges={['bottom']}>
        {/* Cabecera y aviso juntos: los dos tapan la parte de arriba del mapa. */}
        <View pointerEvents="box-none" onLayout={medirSuperior}>
          <View style={styles.cabecera}>
            <View style={styles.cabeceraTexto}>
              <Text style={typography.sectionTitle} numberOfLines={1}>
                {activeRoute.name}
              </Text>
              <Text style={typography.muted}>
                {bars.length} paradas, {sellados.size} selladas
              </Text>
              {Platform.OS === 'web' ? (
                // En web el mapa es OpenStreetMap, que exige atribucion VISIBLE
                // (su licencia y las condiciones de uso de las teselas). Va aqui y
                // no en una esquina del mapa porque cabecera y carrusel las tapan.
                // Es texto sin enlace a proposito: al lado del boton de Sellos, un
                // toque torcido abria la web de OpenStreetMap y sacaba de la app.
                // El credito se queda; lo que se quito es que se pueda pulsar.
                <Text style={styles.atribucion}>Mapa: © OpenStreetMap</Text>
              ) : null}
            </View>

            {/* Sellos ya no tiene boton en la barra de abajo: se entra por aqui, con su mismo icono. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver mis sellos"
              onPress={() => router.navigate('/')}
              style={({ pressed }) => [styles.botonSellos, pressed && styles.botonSellosPulsado]}
            >
              <Ionicons name="ribbon" size={22} color={colors.stamp} />
            </Pressable>
          </View>

          {error ? (
            <View style={styles.avisoError}>
              <Banner tone="error">{error}</Banner>
            </View>
          ) : null}
        </View>

        <View style={styles.pie} pointerEvents="box-none" onLayout={medirPie}>
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
                  {direccionVisible(bar.address).length > 0 ? (
                    <Text style={typography.muted} numberOfLines={1}>
                      {direccionVisible(bar.address)}
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
    // Texto a la izquierda, boton de Sellos a la derecha.
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    ...shadow,
  },
  // minWidth 0: sin el, un nombre de ruta largo empuja el boton fuera de la
  // cabecera en vez de recortarse con los puntos suspensivos.
  cabeceraTexto: { flex: 1, minWidth: 0 },
  atribucion: { fontSize: 11, color: colors.inkFaint, marginTop: 2 },
  // 44 px: el minimo tocable que piden iOS y Android para un boton solo de icono.
  botonSellos: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  botonSellosPulsado: { backgroundColor: colors.paperDeep },
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
