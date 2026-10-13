import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Medalla } from '../../src/components/Medalla';
import { StampSeal } from '../../src/components/StampSeal';
import { Banner, Card, EmptyState, Loading } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { ultimoBarSellado } from '../../src/features/casas/reglasConsumo';
import { DiplomaModal } from '../../src/features/diploma/DiplomaModal';
import { AvisoNavegadorIntegrado } from '../../src/features/profile/AvisoNavegadorIntegrado';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { credencialCompleta, nivelMedalla } from '../../src/features/stamps/progreso';
import { StampSheet } from '../../src/features/stamps/StampSheet';
import { desdeFechaISO, diaCorto } from '../../src/lib/fechas';
import { sellables } from '../../src/features/routes/tipoParada';
import { BannerSorteo } from '../../src/features/sorteo/BannerSorteo';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * La compostelana: una pagina de huecos de sello, uno por bar de la ruta.
 * Es la pantalla de inicio porque es la que el usuario abre en la calle.
 */
export default function SellosScreen() {
  const { profile } = useAuth();
  const { routes, activeRoute, bars, stamps, loading, error, selectRoute, refresh, addStamp } =
    useActiveRoute();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [diplomaAbierto, setDiplomaAbierto] = useState(false);

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

  // Lo que miden el titulo y la barra juntos: es el alto de la medalla. No
  // depende de la medalla (la fila es tan alta como ellos), asi que no hay bucle.
  // 48 hasta la primera medida; el minimo evita una medalla ilegible si una
  // lectura rara llega casi a 0.
  const [altoDatos, setAltoDatos] = useState(48);
  const medirDatos = useCallback((evento: LayoutChangeEvent) => {
    const alto = Math.round(evento.nativeEvent.layout.height);
    if (alto >= 24) setAltoDatos((previo) => (previo === alto ? previo : alto));
  }, []);

  const sellosPorBar = useMemo(
    () => new Map(stamps.map((sello) => [sello.route_bar_id, sello])),
    [stamps],
  );

  const fecha = desdeFechaISO(activeRoute?.event_date ?? null);
  // Solo los bares se sellan (0060): las paradas de foto y otras salen en el mapa, no aqui.
  const bares = useMemo(() => sellables(bars), [bars]);
  const conseguidos = bares.filter((bar) => sellosPorBar.has(bar.id)).length;
  const indiceAbierto = bares.findIndex((bar) => bar.id === abierto);
  const barAbierto = indiceAbierto >= 0 ? bares[indiceAbierto] : null;
  const nivel = nivelMedalla(conseguidos, bares.length);

  if (loading && bares.length === 0) return <Loading label="Buscando tu ruta..." />;

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
          <AvisoNavegadorIntegrado />
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
              {/* A la izquierda, los datos: el nombre de la ruta como titulo (con su
                  fecha a la derecha) y debajo cuantos sellos llevas. A la derecha,
                  pegada al borde, la medalla, tan alta como los datos para que la
                  tarjeta no crezca por ella; los datos se estrechan para dejarle sitio.
                  La medalla se deduce de los sellos (bronce, plata u oro; solo la de
                  oro abre el diploma): si se borra uno, baja de nivel o desaparece y
                  los datos recuperan todo el ancho. */}
              <View style={styles.credencialCuerpo}>
                <View style={styles.credencialDatos} onLayout={medirDatos}>
                  <View style={styles.rutaFila}>
                    <Text style={[typography.overline, styles.credencialNombre]} numberOfLines={1}>
                      {activeRoute.name}
                    </Text>
                    {fecha ? <Text style={[typography.muted, styles.rutaFecha]}>{diaCorto(fecha)}</Text> : null}
                  </View>
                  <View style={styles.progresoFila}>
                    <View style={styles.progresoPista}>
                      <View
                        style={[
                          styles.progresoRelleno,
                          { width: bares.length === 0 ? '0%' : `${(conseguidos / bares.length) * 100}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progresoTexto}>
                      {conseguidos}/{bares.length}
                    </Text>
                  </View>
                </View>
                {nivel ? (
                  <Medalla
                    nivel={nivel}
                    alto={altoDatos}
                    onPress={nivel === 'oro' ? () => setDiplomaAbierto(true) : undefined}
                  />
                ) : null}
              </View>

              {/* El sorteo de la ruta (0061), como ultima fila de la credencial: solo
                  sale si la ruta lo tiene. */}
              <BannerSorteo rutaId={activeRoute.id} sellos={stamps.length} enTarjeta />
            </Card>
          ) : null}

        </View>

        {!activeRoute ? (
          <EmptyState
            title="Todavia no hay ruta"
            body="Solo ves las rutas a las que te han invitado. Cuando te pasen una, abre su enlace de invitacion y sus bares apareceran aqui como huecos que ir sellando."
          />
        ) : bares.length === 0 ? (
          <EmptyState title="Ruta sin bares" body="Esta ruta esta publicada pero todavia no tiene paradas." />
        ) : (
          <View style={styles.rejilla}>
            {bares.map((bar, indice) => {
              const sello = sellosPorBar.get(bar.id) ?? null;
              return (
                <StampSeal
                  key={bar.id}
                  index={indice}
                  name={bar.name}
                  logo={bar.logo}
                  stampedAt={sello ? new Date(sello.stamped_at) : null}
                  onPress={() => setAbierto(bar.id)}
                />
              );
            })}
          </View>
        )}

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
        ruta={activeRoute}
        esUltimoSellado={barAbierto !== null && barAbierto.id === ultimoBarSellado(stamps, new Set(bares.map((b) => b.id)))}
      />

      {/* Solo existe con la credencial completa: es lo que abre la medalla. */}
      {activeRoute && credencialCompleta(conseguidos, bares.length) ? (
        <DiplomaModal
          visible={diplomaAbierto}
          onClose={() => setDiplomaAbierto(false)}
          nombre={profile?.display_name ?? ''}
          ruta={activeRoute.name}
          foto={profile?.avatar_url ?? null}
          paradas={bares.map((b) => ({ id: b.id, nombre: b.name, lat: b.lat, lng: b.lng, logo: b.logo }))}
        />
      ) : null}
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
  // Datos a la izquierda (ocupan lo que deje la medalla) y medalla a la derecha.
  credencialCuerpo: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  credencialDatos: { flex: 1, gap: space.sm },
  // El titulo: el estilo de etiqueta (mayusculas, espaciado), algo mas grande que el de 11.
  credencialNombre: { flex: 1, fontSize: 14 },
  rutaFila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  rutaFecha: { flexShrink: 0 },
  progresoFila: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs },
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
});
