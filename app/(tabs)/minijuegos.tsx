import { EmptyState, Loading, Screen } from '../../src/components/ui';
import { MenuMinijuegos } from '../../src/features/minijuegos/MenuMinijuegos';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';

// Los minijuegos son de cada ruta: sin estar dentro de una, no hay nada que ver
// (la pestana tampoco sale abajo; esto cubre entrar por una URL directa).
export default function MinijuegosScreen() {
  const { activeRoute, loading } = useActiveRoute();

  if (loading) return <Loading />;
  if (!activeRoute) {
    return (
      <Screen>
        <EmptyState
          title="Los juegos son de cada ruta"
          body="Entra en una ruta con una invitación para jugar con quienes están dentro."
        />
      </Screen>
    );
  }
  return <MenuMinijuegos rutaId={activeRoute.id} nombreRuta={activeRoute.name} />;
}
