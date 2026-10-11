import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner } from '../../src/components/ui';
import { Cierre } from '../../src/features/casas/panel/Cierre';
import { Movimientos } from '../../src/features/casas/panel/Movimientos';
import { Personas } from '../../src/features/casas/panel/Personas';
import { Chips } from '../../src/features/casas/panel/piezas';
import { Reglas } from '../../src/features/casas/panel/Reglas';
import { Resumen } from '../../src/features/casas/panel/Resumen';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { listRoutes } from '../../src/features/routes/api';
import { colors, space } from '../../src/lib/theme';
import type { RouteRow } from '../../src/types/database';

type Seccion = 'resumen' | 'movimientos' | 'reglas' | 'personas' | 'cierre';
const SECCIONES: { id: Seccion; texto: string }[] = [
  { id: 'resumen', texto: 'Resumen' },
  { id: 'movimientos', texto: 'Movimientos' },
  { id: 'reglas', texto: 'Reglas y retos' },
  { id: 'personas', texto: 'Personas' },
  { id: 'cierre', texto: 'Cierre y temporadas' },
];
const TODAS = '__todas';

/**
 * "Casas y puntuaciones" (0048), solo admins: todos los puntos y de donde
 * salen, correcciones, reglas, limites, retos y cambios de casa. Lo protegen
 * las funciones del servidor (FORBIDDEN si no administras), no esta pantalla.
 */
export default function CasasAdmin() {
  const { activeRoute } = useActiveRoute();
  const [seccion, setSeccion] = useState<Seccion>('resumen');
  const [rutas, setRutas] = useState<RouteRow[]>([]);
  const [ruta, setRuta] = useState<string>(TODAS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRoutes()
      .then((todas) => {
        setRutas(todas);
        if (activeRoute && todas.some((r) => r.id === activeRoute.id)) setRuta(activeRoute.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las rutas.'));
    // Solo al entrar: luego manda lo que elija quien administra.
  }, []);

  const rutaId = ruta === TODAS ? null : ruta;
  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
        <Chips<Seccion> opciones={SECCIONES} elegida={seccion} onElegir={setSeccion} />
        {seccion !== 'personas' ? (
          <Chips
            opciones={[{ id: TODAS, texto: 'Todas las rutas' }, ...rutas.map((r) => ({ id: r.id, texto: r.name }))]}
            elegida={ruta}
            onElegir={setRuta}
          />
        ) : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        <View>
          {seccion === 'resumen' ? <Resumen rutaId={rutaId} /> : null}
          {seccion === 'movimientos' ? <Movimientos rutaId={rutaId} /> : null}
          {seccion === 'reglas' ? <Reglas rutaId={rutaId} /> : null}
          {seccion === 'personas' ? <Personas /> : null}
          {seccion === 'cierre' ? <Cierre rutaId={rutaId} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
});
