import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StampSeal } from '../../src/components/StampSeal';
import { Banner, Card, EmptyState, Loading } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { StampSheet } from '../../src/features/stamps/StampSheet';
import { desdeFechaISO, diaLargo } from '../../src/lib/fechas';
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
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.beer} />
        }
      >
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

        {!activeRoute ? (
          <EmptyState
            title="Todavia no hay ruta"
            body="Cuando un administrador publique una ruta, sus bares apareceran aqui como huecos que ir sellando."
          />
        ) : (
          <>
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

            {bars.length === 0 ? (
              <EmptyState
                title="Ruta sin bares"
                body="Esta ruta esta publicada pero todavia no tiene paradas."
              />
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
          </>
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
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
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
});
