import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { EmptyState, Loading, Screen } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { MenuMinijuegos } from '../../src/features/minijuegos/MenuMinijuegos';
import { SONDEO_PENUL_MS } from '../../src/features/minijuegos/visibilidad';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { leerPenulVisible } from '../../src/features/routes/api';
import { useSondeo } from '../../src/lib/useSondeo';

// Los minijuegos son de cada ruta: sin estar dentro de una, no hay nada que ver
// (la pestana tampoco sale abajo; esto cubre entrar por una URL directa).
export default function MinijuegosScreen() {
  const { activeRoute, loading } = useActiveRoute();
  const { isAdmin } = useAuth();
  // El interruptor de La Penul (0071). Arranca con lo que trajo la ruta y se
  // vuelve a mirar al enfocar la pestana y cada minuto: si un admin lo enciende
  // a mitad de la noche, aparece sin cerrar la app.
  // Lo leido se guarda CON su ruta y con el valor que traia la ruta cuando se
  // pregunto. Solo manda si los dos siguen igual; si no, manda la ruta. Se decide
  // AL PINTAR (sin efecto), asi no hay ni un fotograma con un valor viejo: al
  // cambiar de ruta, o cuando un admin cambia el interruptor en el editor y la ruta
  // se refresca, una lectura que salio antes ya no encaja y se ignora.
  const [leido, setLeido] = useState<{ ruta: string; base: boolean; visible: boolean } | null>(null);
  const base = activeRoute?.la_penul_visible === true;
  const penulVisible = leido && leido.ruta === activeRoute?.id && leido.base === base ? leido.visible : base;
  // La ruta de AHORA y la ultima pregunta: una respuesta de otra ruta, o mas
  // vieja que otra que ya llego, no pisa el valor.
  const rutaActual = useRef(activeRoute?.id);
  rutaActual.current = activeRoute?.id;
  const pregunta = useRef(0);
  const releer = useCallback(async () => {
    const id = activeRoute?.id;
    if (!id) return;
    const n = ++pregunta.current;
    const v = await leerPenulVisible(id);
    if (v !== null && rutaActual.current === id && n === pregunta.current) setLeido({ ruta: id, base, visible: v });
  }, [activeRoute?.id, base]);
  useSondeo(releer, SONDEO_PENUL_MS, !!activeRoute);
  // useSondeo solo pregunta cada minuto y al volver del segundo plano; esto, al enfocar la pestana.
  useFocusEffect(
    useCallback(() => {
      void releer();
    }, [releer]),
  );

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
  return <MenuMinijuegos rutaId={activeRoute.id} nombreRuta={activeRoute.name} esAdmin={isAdmin} penulVisible={penulVisible} />;
}
