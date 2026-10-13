import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, Loading } from '../../src/components/ui';
import { GanadoraRuta } from '../../src/features/casas/GanadoraRuta';
import { RankingCasas } from '../../src/features/casas/RankingCasas';
import { RetosRuta } from '../../src/features/casas/RetosRuta';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { colors } from '../../src/lib/theme';

/**
 * La clasificacion ocupa el espacio entre la cabecera y las pestanas.
 * La tabla permite scroll solo si su contenido necesita mas espacio.
 */
export default function CasasScreen() {
  const { activeRoute, stamps, loading } = useActiveRoute();

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
      <RankingCasas
        key={activeRoute.id}
        rutaId={activeRoute.id}
        pie={<GanadoraRuta rutaId={activeRoute.id} />}
        retos={<RetosRuta rutaId={activeRoute.id} sellos={stamps.length} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
});
