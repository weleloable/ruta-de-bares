import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StampSeal } from '../../src/components/StampSeal';
import { Banner, Button, Card, EmptyState, Loading } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { StampSheet } from '../../src/features/stamps/StampSheet';
import { INSTAGRAM_URL, TELEGRAM_URL } from '../../src/lib/enlacesExternos';
import { desdeFechaISO, diaLargo } from '../../src/lib/fechas';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Abre un enlace externo (Instagram/Telegram si estan instaladas, si no el
 * navegador). Vive aqui y no en src/lib/ para no importar 'react-native' en
 * un fichero con test (ver enlacesExternos.ts). Sin Alert si falla
 * (tests/sin-alert.test.ts lo prohibe en toda la app): el boton simplemente
 * no hace nada en vez de romper la pantalla.
 */
function abrirEnlaceExterno(url: string): void {
  Linking.openURL(url).catch(() => undefined);
}

/**
 * La compostelana: una pagina de huecos de sello, uno por bar de la ruta.
 * Es la pantalla de inicio porque es la que el usuario abre en la calle.
 */
export default function SellosScreen() {
  const { profile } = useAuth();
  const { routes, activeRoute, bars, stamps, loading, error, selectRoute, refresh, addStamp } =
    useActiveRoute();
  const [abierto, setAbierto] = useState<string | null>(null);

  // Cuanto tapa la cabecera (aviso + chips + credencial) desde el top de la
  // pantalla: el fondo decorativo empieza justo debajo, no detras, porque la
  // credencial es opaca y ese trozo de imagen se perderia sin verse.
  // layout.y ya incluye el padding de 'cuerpo' (space.lg), y layout.height es
  // la cabecera entera: sumados dan el offset absoluto que necesita el fondo,
  // que esta FUERA del ScrollView (mismo patron que altoSuperior en ruta.tsx).
  const [altoCabecera, setAltoCabecera] = useState(0);
  const medirCabecera = useCallback((evento: LayoutChangeEvent) => {
    const { y, height } = evento.nativeEvent.layout;
    const total = Math.round(y + height);
    setAltoCabecera((previo) => (previo === total ? previo : total));
  }, []);

  const sellosPorBar = useMemo(
    () => new Map(stamps.map((sello) => [sello.route_bar_id, sello])),
    [stamps],
  );

  const conseguidos = bars.filter((bar) => sellosPorBar.has(bar.id)).length;
  const indiceAbierto = bars.findIndex((bar) => bar.id === abierto);
  const barAbierto = indiceAbierto >= 0 ? bars[indiceAbierto] : null;
  const fecha = desdeFechaISO(activeRoute?.event_date ?? null);

  if (loading && bars.length === 0) return <Loading label="Buscando tu ruta..." />;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      {/* Decorativa: estirada (no recortada) al hueco que le queda por debajo
          de la cabecera (ver medirCabecera), al 5% de opacidad, casi un
          susurro. pointerEvents 'none' porque va detras pero ocupa su hueco
          entero, y si no un toque sobre ella no llegaria a la rejilla ni al
          scroll. */}
      <Image
        source={require('../../assets/fondos/sellos-fondo.jpg')}
        style={[styles.fondo, { top: altoCabecera }]}
        contentFit="fill"
        pointerEvents="none"
      />
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.beer} />
        }
      >
        {/* Todo lo que es opaco y tapa el fondo, junto y medido de una vez:
            ver altoCabecera arriba. Nunca vacio del todo (el padding de
            'cuerpo' ya le da algo de alto), asi que no hace falta ignorar 0. */}
        <View onLayout={medirCabecera} style={styles.cabecera}>
          {error ? <Banner tone="error">{error}</Banner> : null}

          {routes.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {routes.map((ruta) => (
                <Pressable
                  key={ruta.id}
                  onPress={() => selectRoute(ruta.id)}
                  style={[styles.chip, ruta.id === activeRoute?.id && styles.chipActivo]}
                >
                  <Text style={[styles.chipTexto, ruta.id === activeRoute?.id && styles.chipTextoActivo]}>
                    {ruta.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {activeRoute ? (
            <Card style={styles.credencial}>
              <Text style={typography.overline}>Credencial de</Text>
              <Text style={typography.screenTitle}>{profile?.display_name || 'Peregrino'}</Text>
              <Text style={typography.body}>{activeRoute.name}</Text>
              {fecha ? <Text style={typography.muted}>{diaLargo(fecha)}</Text> : null}

              <View style={styles.progresoFila}>
                <View style={styles.progresoPista}>
                  <View
                    style={[
                      styles.progresoRelleno,
                      { width: bars.length === 0 ? '0%' : `${(conseguidos / bars.length) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progresoTexto}>
                  {conseguidos} / {bars.length}
                </Text>
              </View>

              {bars.length > 0 && conseguidos === bars.length ? (
                <Banner tone="success">Ruta completa. Compostelana ganada.</Banner>
              ) : null}
            </Card>
          ) : null}
        </View>

        {!activeRoute ? (
          <EmptyState
            title="Todavia no hay ruta"
            body="Solo ves las rutas a las que te han invitado. Cuando te pasen una, abre su enlace de invitacion y sus bares apareceran aqui como huecos que ir sellando."
          />
        ) : bars.length === 0 ? (
          <EmptyState title="Ruta sin bares" body="Esta ruta esta publicada pero todavia no tiene paradas." />
        ) : (
          <View style={styles.rejilla}>
            {bars.map((bar, indice) => {
              const sello = sellosPorBar.get(bar.id) ?? null;
              return (
                <StampSeal
                  key={bar.id}
                  index={indice}
                  name={bar.name}
                  stampedAt={sello ? new Date(sello.stamped_at) : null}
                  onPress={() => setAbierto(bar.id)}
                />
              );
            })}
          </View>
        )}

        {/* Enlaces de la ruta, siempre al pie, con o sin ruta activa. */}
        <View style={styles.enlacesFila}>
          <Button
            title="Instagram"
            icon="logo-instagram"
            variant="secondary"
            onPress={() => abrirEnlaceExterno(INSTAGRAM_URL)}
          />
          <Button
            title="Telegram"
            icon="paper-plane-outline"
            variant="secondary"
            onPress={() => abrirEnlaceExterno(TELEGRAM_URL)}
          />
        </View>
      </ScrollView>

      <StampSheet
        bar={barAbierto}
        index={indiceAbierto}
        stamp={barAbierto ? (sellosPorBar.get(barAbierto.id) ?? null) : null}
        visible={barAbierto !== null}
        onClose={() => setAbierto(null)}
        onStamped={(sello) => {
          addStamp(sello);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  // 'fill' y no 'cover': el usuario pidio la imagen ESTIRADA al hueco que
  // ocupa, sin recortarla ni respetar su proporcion (la imagen es cuadrada y
  // el hueco no). 'top' se pone en linea con altoCabecera, no aqui: empieza
  // justo debajo de la credencial, nunca detras (es opaca, se perderia).
  // 0.05: practicamente un susurro, a proposito (a 0.1 ya casi no se veia).
  fondo: { position: 'absolute', left: 0, right: 0, bottom: 0, opacity: 0.05 },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  // Mismo 'gap' que 'cuerpo': agrupar aviso+chips+credencial en un View real
  // (para poder medirlo con un solo onLayout) le quita el espaciado que antes
  // les daba 'cuerpo' por ser hijos directos suyos.
  cabecera: { gap: space.lg },
  chips: { gap: space.sm, paddingRight: space.lg },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActivo: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  chipTexto: { color: colors.inkSoft, fontWeight: '600', fontSize: 13 },
  chipTextoActivo: { color: colors.white },
  credencial: { gap: space.xs },
  progresoFila: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  progresoPista: {
    flex: 1,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.paperDeep,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  progresoRelleno: { height: '100%', backgroundColor: colors.stamp },
  progresoTexto: { fontWeight: '800', color: colors.ink, fontSize: 15 },
  // Tres columnas con ancho en porcentaje y el aire por dentro de cada celda.
  // Con `gap` entre celdas de 31% el total pasa del ancho de pantalla en
  // moviles estrechos y la tercera se cae a la fila siguiente.
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  // justify 'space-between' y sin flex:1 en los botones (Button no estira por
  // defecto): uno pegado a cada lado, tal cual se pidio, y no dos a lo ancho.
  enlacesFila: { flexDirection: 'row', justifyContent: 'space-between' },
});
