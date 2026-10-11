import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, EmptyState, Loading } from '../../src/components/ui';
import { leerEstadisticasRuta } from '../../src/features/admin/api';
import { seccionesEstadisticas, type Baldosa, type EstadisticasRuta } from '../../src/features/admin/estadisticas';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { listRoutes } from '../../src/features/routes/api';
import { estadoDeRuta, etiquetaEstado } from '../../src/features/routes/estado';
import { colors, fonts, radius, space, typography } from '../../src/lib/theme';
import type { RouteRow } from '../../src/types/database';

/**
 * Estadisticas de una ruta, solo admins (0037). Cifras de AHORA MISMO y solo
 * totales: nada dice quien hizo que, porque la politica promete que a quien
 * das Me gusta no lo ve nadie, tampoco quien organiza.
 *
 * Quien protege esto es `match_admin_require()` en la funcion: aunque alguien
 * llegue aqui escribiendo la URL, la consulta le falla.
 */
export default function EstadisticasAdmin() {
  const { activeRoute } = useActiveRoute();
  const [rutas, setRutas] = useState<RouteRow[]>([]);
  const [elegida, setElegida] = useState<string | null>(null);
  const [datos, setDatos] = useState<EstadisticasRuta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarRutas = useCallback(async () => {
    try {
      const todas = await listRoutes();
      setRutas(todas);
      // La que se esta viendo en la app, si sigue existiendo; si no, la primera.
      setElegida((actual) =>
        actual && todas.some((r) => r.id === actual)
          ? actual
          : (todas.find((r) => r.id === activeRoute?.id)?.id ?? todas[0]?.id ?? null),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las rutas.');
      setCargando(false);
    }
  }, [activeRoute?.id]);

  const cargarDatos = useCallback(async (routeId: string | null) => {
    if (!routeId) {
      setDatos(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      setDatos(await leerEstadisticasRuta(routeId));
      setError(null);
    } catch (e) {
      setDatos(null);
      setError(e instanceof Error ? e.message : 'No se pudieron leer las estadísticas.');
    } finally {
      setCargando(false);
    }
  }, []);

  // Al volver a la pantalla, cifras nuevas: son de ahora mismo.
  useFocusEffect(
    useCallback(() => {
      void cargarRutas();
    }, [cargarRutas]),
  );

  useEffect(() => {
    void cargarDatos(elegida);
  }, [elegida, cargarDatos]);

  const ruta = rutas.find((r) => r.id === elegida) ?? null;

  if (cargando && !datos && !error) return <Loading label="Contando..." />;

  if (rutas.length === 0 && !error) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState title="Todavía no hay rutas" body="Cuando crees una desde el editor, sus cifras saldrán aquí." />
      </SafeAreaView>
    );
  }

  const secciones = datos ? seccionesEstadisticas(datos) : [];

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => void cargarDatos(elegida)} tintColor={colors.beer} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {rutas.map((r) => {
            const on = r.id === elegida;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setElegida(r.id)}
                style={[styles.chip, on && styles.chipElegido]}
              >
                <Text style={[styles.chipTexto, on && styles.chipTextoElegido]}>{r.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {ruta ? (
          <Text style={styles.nota}>{etiquetaEstado(estadoDeRuta(ruta, new Date()))} · datos de ahora mismo</Text>
        ) : null}

        {error ? <Banner tone="error">{error}</Banner> : null}

        {datos
          ? secciones.map((seccion, i) => (
              <View key={seccion.titulo} style={styles.seccion}>
                <Text style={typography.overline}>{seccion.titulo}</Text>
                <View style={styles.rejilla}>
                  {seccion.baldosas.map((b) => (
                    <Tile key={b.titulo} baldosa={b} />
                  ))}
                </View>
                {/* Las etiquetas van justo despues de La Caña, que es de donde salen. */}
                {i === 1 ? <Etiquetas etiquetas={datos.etiquetas} /> : null}
              </View>
            ))
          : null}

        {datos ? (
          <Text style={styles.nota}>
            Solo totales de la ruta: nada de aquí dice quién hizo qué. Al borrar la ruta, sus cifras se van con ella.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ baldosa }: { baldosa: Baldosa }) {
  return (
    <View style={styles.baldosa} accessible accessibilityLabel={`${baldosa.titulo}: ${baldosa.valor}, ${baldosa.detalle}`}>
      <Text style={styles.valor}>{baldosa.valor}</Text>
      <Text style={styles.baldosaTitulo}>{baldosa.titulo}</Text>
      <Text style={styles.baldosaDetalle}>{baldosa.detalle}</Text>
    </View>
  );
}

function Etiquetas({ etiquetas }: { etiquetas: EstadisticasRuta['etiquetas'] }) {
  return (
    <View style={styles.seccion}>
      <Text style={[typography.overline, styles.subtitulo]}>Etiquetas más elegidas</Text>
      <View style={styles.tarjeta}>
        {etiquetas.length === 0 ? (
          <Text style={typography.muted}>Nadie con La Caña activada ha elegido etiquetas todavía.</Text>
        ) : (
          etiquetas.map((e, i) => (
            <View key={e.etiqueta} style={styles.fila}>
              <Text style={styles.puesto}>{i + 1}</Text>
              <Text style={styles.etiqueta}>{e.etiqueta}</Text>
              <Text style={styles.veces}>{e.veces}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  chips: { gap: space.sm, paddingRight: space.lg },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipElegido: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  chipTexto: { color: colors.inkSoft, fontWeight: '600', fontSize: 13 },
  chipTextoElegido: { color: colors.white },
  nota: { fontSize: 12.5, color: colors.inkFaint },
  seccion: { gap: space.sm },
  subtitulo: { marginTop: space.sm },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Dos por fila: la mitad menos el hueco entre ellas.
  baldosa: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: 2,
  },
  valor: { fontFamily: fonts.title, fontSize: 28, color: colors.ink, fontVariant: ['tabular-nums'] },
  baldosaTitulo: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  baldosaDetalle: { fontSize: 12, color: colors.inkFaint },
  tarjeta: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  fila: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  puesto: { width: 18, fontWeight: '800', color: colors.beerDark },
  etiqueta: { flex: 1, fontSize: 15, color: colors.ink },
  veces: { fontWeight: '700', color: colors.inkSoft, fontVariant: ['tabular-nums'] },
});
