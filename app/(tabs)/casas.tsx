import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, Loading } from '../../src/components/ui';
import { EstadisticasCasas } from '../../src/features/casas/EstadisticasCasas';
import { GanadoraRuta } from '../../src/features/casas/GanadoraRuta';
import { RankingCasas } from '../../src/features/casas/RankingCasas';
import { RetosRuta } from '../../src/features/casas/RetosRuta';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { colors, space } from '../../src/lib/theme';

/**
 * La competicion de las casas (0044+): la tabla en directo, la casa ganadora si
 * la ruta esta cerrada, los retos y las estadisticas de cada casa. Antes todo
 * esto vivia en Sellos y se mezclaba con la credencial.
 */
export default function CasasScreen() {
  const { activeRoute, stamps, loading, refresh } = useActiveRoute();

  if (loading && !activeRoute) return <Loading label="Buscando tu ruta..." />;
  if (!activeRoute) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState
          title="Las casas son de cada ruta"
          body="Entra en una ruta con una invitación y verás cómo va tu casa frente a las otras tres."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.beer} />}
      >
        <GanadoraRuta rutaId={activeRoute.id} />
        <RankingCasas rutaId={activeRoute.id} />
        <RetosRuta rutaId={activeRoute.id} sellos={stamps.length} />
        <EstadisticasCasas rutaId={activeRoute.id} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
});
