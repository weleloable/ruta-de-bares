import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, EmptyState, Loading } from '../../src/components/ui';
import { nombreFicheroCsv, resumenCsv, type ActividadRuta } from '../../src/features/admin/actividad';
import { SeccionesActividad, type SeccionActividad } from '../../src/features/admin/ActividadRuta';
import { lineasCsvExtra, type AuditoriaRuta, type CasaDatos, type GlobalRutas } from '../../src/features/admin/actividadExtra';
import { leerActividadRuta, leerAuditoriaRuta, leerCasasRuta, leerEstadisticasRuta, leerGlobalRutas } from '../../src/features/admin/api';
import { VistaGlobal } from '../../src/features/admin/VistaGlobal';
import { descargarCsv } from '../../src/features/admin/descargarCsv';
import { seccionesEstadisticas, type Baldosa, type EstadisticasRuta } from '../../src/features/admin/estadisticas';
import { Chips } from '../../src/features/casas/panel/piezas';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { listRoutes } from '../../src/features/routes/api';
import { supabase } from '../../src/lib/supabase';
import { estadoDeRuta, etiquetaEstado } from '../../src/features/routes/estado';
import { colors, fonts, radius, space, typography } from '../../src/lib/theme';
import type { RouteRow } from '../../src/types/database';

type Vista = 'general' | SeccionActividad;
const VISTAS: { id: Vista; texto: string }[] = [
  { id: 'general', texto: 'General' },
  { id: 'participacion', texto: 'Participación' },
  { id: 'bares', texto: 'Bares' },
  { id: 'actividad', texto: 'Actividad' },
  { id: 'juegos', texto: 'Juegos y retos' },
  { id: 'casas', texto: 'Casas' },
  { id: 'auditoria', texto: 'Auditoría' },
];
const TODAS = '__todas';
const SIN_ACTIVIDAD: ActividadRuta = {
  participacion: { personas: 0, sellaron: 0, consumieron: 0, qr: 0, jugaron: 0, cana: 0, retos: 0, activos_30min: 0 },
  bares: [],
  horas: [],
  consumiciones: { total: 0, puntuan: 0, personas: 0, por_categoria: {} },
  juegos: [],
  retos: [],
  qr: { encuentros: 0, puntuan: 0 },
};

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
  const [actividad, setActividad] = useState<ActividadRuta | null>(null);
  const [errorActividad, setErrorActividad] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('general');
  const [casas, setCasas] = useState<CasaDatos[] | null>(null);
  const [auditoria, setAuditoria] = useState<AuditoriaRuta | null>(null);
  const [errorAuditoria, setErrorAuditoria] = useState<string | null>(null);
  const [global, setGlobal] = useState<GlobalRutas | null>(null);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [temporadas, setTemporadas] = useState<{ id: string; nombre: string }[]>([]);
  const [temporada, setTemporada] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
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
      setActividad(null);
      setCargando(false);
      return;
    }
    if (routeId === TODAS) {
      setCargando(true);
      try {
        setGlobal(await leerGlobalRutas(temporada));
        setErrorGlobal(null);
      } catch (e) {
        setGlobal(null);
        const m = e instanceof Error ? e.message : '';
        setErrorGlobal(/PGRST202|Could not find/i.test(m) ? 'Falta aplicar la migración 0059 en Supabase.' : m || 'No se pudo leer el total de rutas.');
      } finally {
        setCargando(false);
      }
      return;
    }
    setCargando(true);
    try {
      setDatos(await leerEstadisticasRuta(routeId));
      setError(null);
    } catch (e) {
      setDatos(null);
      setError(e instanceof Error ? e.message : 'No se pudieron leer las estadísticas.');
    }
    // Aparte: si falta la 0058, lo de siempre sigue viendose y solo estas secciones avisan.
    try {
      setActividad(await leerActividadRuta(routeId));
      setErrorActividad(null);
    } catch (e) {
      setActividad(null);
      const m = e instanceof Error ? e.message : '';
      setErrorActividad(/PGRST202|Could not find/i.test(m) ? 'Falta aplicar la migración 0058 en Supabase.' : m || 'No se pudo leer la actividad.');
    }
    // Casas y auditoria, cada una por su lado: que una falle no tumba lo demas.
    try {
      setCasas(await leerCasasRuta(routeId));
    } catch {
      setCasas(null);
    }
    try {
      setAuditoria(await leerAuditoriaRuta(routeId));
      setErrorAuditoria(null);
    } catch (e) {
      setAuditoria(null);
      const m = e instanceof Error ? e.message : '';
      setErrorAuditoria(/PGRST202|Could not find/i.test(m) ? 'Falta aplicar la migración 0059 en Supabase.' : m || 'No se pudo leer la auditoría.');
    } finally {
      setCargando(false);
    }
  }, [temporada]);

  useEffect(() => {
    void supabase
      .from('temporadas')
      .select('id, nombre')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTemporadas(data ?? []));
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
  const verGlobal = elegida === TODAS;

  if (cargando && !datos && !global && !error) return <Loading label="Contando..." />;

  if (rutas.length === 0 && !error) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState title="Todavía no hay rutas" body="Cuando crees una desde el editor, sus cifras saldrán aquí." />
      </SafeAreaView>
    );
  }

  const secciones = datos ? seccionesEstadisticas(datos) : [];

  async function bajarResumen() {
    if (!ruta || !datos || !actividad) return;
    setDescargando(true);
    try {
      const ahora = new Date();
      const csv = [resumenCsv(ruta.name, datos, actividad, ahora), ...lineasCsvExtra(casas, auditoria)].join('\r\n');
      await descargarCsv(nombreFicheroCsv(ruta.name, ahora), csv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el resumen.');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => void cargarDatos(elegida)} tintColor={colors.beer} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: verGlobal }}
            onPress={() => setElegida(TODAS)}
            style={[styles.chip, verGlobal && styles.chipElegido]}
          >
            <Text style={[styles.chipTexto, verGlobal && styles.chipTextoElegido]}>Todas las rutas</Text>
          </Pressable>
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

        {verGlobal ? (
          <>
            {errorGlobal ? <Banner tone="error">{errorGlobal}</Banner> : null}
            <VistaGlobal
              g={global}
              temporadas={temporadas}
              temporada={temporada}
              onTemporada={(id) => {
                setTemporada(id);
              }}
            />
          </>
        ) : null}

        {!verGlobal && ruta ? (
          <Text style={styles.nota}>{etiquetaEstado(estadoDeRuta(ruta, new Date()))} · datos de ahora mismo</Text>
        ) : null}

        {!verGlobal ? <Chips<Vista> opciones={VISTAS} elegida={vista} onElegir={setVista} /> : null}

        {error ? <Banner tone="error">{error}</Banner> : null}
        {!verGlobal && vista === 'auditoria' && errorAuditoria ? <Banner tone="error">{errorAuditoria}</Banner> : null}
        {!verGlobal && vista !== 'general' && vista !== 'casas' && vista !== 'auditoria' && errorActividad ? (
          <Banner tone="error">{errorActividad}</Banner>
        ) : null}

        {!verGlobal && vista !== 'general' && (actividad || vista === 'casas' || vista === 'auditoria') ? (
          <SeccionesActividad a={actividad ?? SIN_ACTIVIDAD} seccion={vista} casas={casas} auditoria={auditoria} />
        ) : null}

        {!verGlobal && vista === 'general' && datos
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

        {!verGlobal && datos && actividad && ruta ? (
          <Button
            title="Descargar resumen de la ruta (CSV)"
            variant="secondary"
            icon="download-outline"
            loading={descargando}
            onPress={() => void bajarResumen()}
          />
        ) : null}

        {!verGlobal && datos ? (
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
