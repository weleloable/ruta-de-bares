import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, EmptyState, Loading } from '../../src/components/ui';
import { leerEstadisticasRuta } from '../../src/features/admin/api';
import {
  embudoCana,
  resultadoPregunta,
  seccionesEstadisticas,
  type Baldosa,
  type EstadisticasRuta,
  type FilaBarra,
} from '../../src/features/admin/estadisticas';
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
                {/* El embudo, la pregunta y las etiquetas van con La Caña, que es de donde salen. */}
                {i === 1 ? (
                  <>
                    <Barras
                      titulo="La Caña, de principio a fin"
                      filas={embudoCana(datos)}
                      pie="Personas que llegan a cada paso."
                    />
                    <Barras
                      titulo="Cómo acaba la pregunta de la caña"
                      filas={resultadoPregunta(datos).map((f) => ({ ...f, sufijo: `${f.porcentaje} %` }))}
                      pie="De las conexiones en las que alguien preguntó."
                    />
                    <Etiquetas etiquetas={datos.etiquetas} />
                  </>
                ) : null}
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

/**
 * Filas con barra: el embudo y el reparto de respuestas. Sin filas (una base
 * que aun no trae estos datos) no pinta nada.
 */
function Barras({ titulo, filas, pie }: { titulo: string; filas: (FilaBarra & { sufijo?: string })[]; pie: string }) {
  if (filas.length === 0) return null;
  return (
    <View style={styles.seccion}>
      <Text style={[typography.overline, styles.subtitulo]}>{titulo}</Text>
      <View style={styles.tarjeta}>
        {filas.map((f) => (
          <View
            key={f.titulo}
            style={styles.barraFila}
            accessible
            accessibilityLabel={`${f.titulo}: ${f.valor}${f.sufijo ? `, ${f.sufijo}` : ''}`}
          >
            <Text style={styles.barraTitulo}>{f.titulo}</Text>
            <View style={styles.pista}>
              <View
                style={[styles.relleno, f.destacada && styles.rellenoDestacado, { width: `${Math.round(f.proporcion * 100)}%` }]}
              />
            </View>
            <Text style={styles.barraValor}>{f.valor}</Text>
            {f.sufijo ? <Text style={styles.barraSufijo}>{f.sufijo}</Text> : null}
          </View>
        ))}
        <Text style={styles.baldosaDetalle}>{pie}</Text>
      </View>
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
  barraFila: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barraTitulo: { width: 118, fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  pista: { flex: 1, height: 20, borderRadius: 6, backgroundColor: colors.paperDeep, overflow: 'hidden' },
  relleno: { height: '100%', backgroundColor: colors.beer },
  rellenoDestacado: { backgroundColor: colors.green },
  barraValor: { width: 30, textAlign: 'right', fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  barraSufijo: { width: 40, textAlign: 'right', fontSize: 12, color: colors.inkFaint, fontVariant: ['tabular-nums'] },
  fila: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  puesto: { width: 18, fontWeight: '800', color: colors.beerDark },
  etiqueta: { flex: 1, fontSize: 15, color: colors.ink },
  veces: { fontWeight: '700', color: colors.inkSoft, fontVariant: ['tabular-nums'] },
});
