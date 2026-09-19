import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Loading } from '../../../src/components/ui';
import { DialogoConfirmar } from '../../../src/features/profile/DialogoConfirmar';
import { useActiveRoute } from '../../../src/features/routes/ActiveRouteProvider';
import {
  deleteBar,
  getRouteWithBars,
  persistOrder,
  updateRoute,
} from '../../../src/features/routes/api';
import { BarLogo } from '../../../src/features/routes/BarLogo';
import { direccionVisible } from '../../../src/features/routes/catalogo';
import {
  assignSortOrder,
  findRouteWarnings,
  moveBar,
} from '../../../src/features/routes/validation';
import { desdeFechaISO, diaLargo, ventana } from '../../../src/lib/fechas';
import { colors, radius, space, typography } from '../../../src/lib/theme';
import type { RouteBarRow, RouteRow } from '../../../src/types/database';

/** Lista ordenable de bares de una ruta. Solo admins llegan aqui (RLS + editor). */
export default function EditorDeRuta() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const router = useRouter();
  const { refresh: refrescarRutaActiva } = useActiveRoute();

  const [ruta, setRuta] = useState<RouteRow | null>(null);
  const [bares, setBares] = useState<RouteBarRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoOrden, setGuardandoOrden] = useState(false);
  const [borrando, setBorrando] = useState<RouteBarRow | null>(null);
  const [borrandoEnCurso, setBorrandoEnCurso] = useState(false);

  const cargar = useCallback(async () => {
    if (!routeId) return;
    setCargando(true);
    setError(null);
    try {
      const detalle = await getRouteWithBars(routeId);
      if (!detalle) {
        setError('Esta ruta ya no existe.');
        return;
      }
      setRuta(detalle.route);
      setBares(detalle.bars);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la ruta.');
    } finally {
      setCargando(false);
    }
  }, [routeId]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const avisos = useMemo(
    () =>
      findRouteWarnings(
        bares.map((bar) => ({
          id: bar.id,
          name: bar.name,
          opensAt: new Date(bar.opens_at),
          closesAt: new Date(bar.closes_at),
        })),
      ),
    [bares],
  );

  async function mover(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= bares.length || !routeId) return;

    // Optimista: la lista se reordena al instante y se revierte si el servidor
    // dice que no. Esperar a la ida y vuelta hace que el boton parezca roto.
    const previos = bares;
    const posicionesPrevias = new Map(bares.map((bar) => [bar.id, bar.sort_order]));
    const reordenados = moveBar(bares, indice, destino);
    setBares(reordenados);
    setGuardandoOrden(true);
    setError(null);
    try {
      await persistOrder(routeId, assignSortOrder(reordenados), posicionesPrevias);
      await cargar();
      await refrescarRutaActiva();
    } catch (e) {
      setBares(previos);
      setError(e instanceof Error ? e.message : 'No se pudo guardar el nuevo orden.');
    } finally {
      setGuardandoOrden(false);
    }
  }

  async function onBorrarConfirmado() {
    if (!borrando) return;
    setBorrandoEnCurso(true);
    try {
      await deleteBar(borrando.id);
      const quedan = bares.filter((b) => b.id !== borrando.id);
      // Renumerar: si no, queda un hueco en sort_order y el siguiente bar
      // nuevo chocaria con la unique al reutilizar un numero.
      if (routeId && quedan.length > 0) {
        await persistOrder(
          routeId,
          assignSortOrder(quedan),
          new Map(quedan.map((b) => [b.id, b.sort_order])),
        );
      }
      setBorrando(null);
      await cargar();
      await refrescarRutaActiva();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el bar.');
    } finally {
      setBorrandoEnCurso(false);
    }
  }

  async function onPublicar() {
    if (!ruta) return;
    try {
      setRuta(await updateRoute(ruta.id, { is_published: !ruta.is_published }));
      await refrescarRutaActiva();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la publicacion.');
    }
  }

  if (cargando && !ruta) return <Loading label="Cargando la ruta..." />;

  if (!ruta) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState title="Ruta no encontrada" body={error ?? 'Esta ruta ya no existe.'} />
      </SafeAreaView>
    );
  }

  const dia = desdeFechaISO(ruta.event_date);

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.cuerpo}>
        {error ? <Banner tone="error">{error}</Banner> : null}

        <Card>
          <Text style={typography.sectionTitle}>{ruta.name}</Text>
          {dia ? <Text style={typography.muted}>{diaLargo(dia)}</Text> : null}
          {ruta.description.length > 0 ? (
            <Text style={typography.body}>{ruta.description}</Text>
          ) : null}
          <Text style={typography.muted}>
            {bares.length} {bares.length === 1 ? 'parada' : 'paradas'} ·{' '}
            {ruta.is_published ? 'publicada' : 'borrador'}
          </Text>
          <Button
            title={ruta.is_published ? 'Despublicar' : 'Publicar ruta'}
            variant={ruta.is_published ? 'secondary' : 'primary'}
            onPress={onPublicar}
          />
          {!ruta.is_published ? (
            <Text style={typography.muted}>
              Mientras sea borrador solo tu la ves. Al publicarla aparece en Sellos y en Ruta para
              todo el mundo.
            </Text>
          ) : null}
        </Card>

        {avisos.map((aviso) => (
          <Banner key={`${aviso.kind}-${aviso.firstId}-${aviso.secondId}`} tone="info">
            {aviso.message}
          </Banner>
        ))}

        {bares.length === 0 ? (
          <EmptyState
            title="Ruta sin paradas"
            body="Anade el primer bar: eliges uno de la lista y le pones el horario."
          />
        ) : (
          bares.map((bar, indice) => (
            <Card key={bar.id}>
              <View style={styles.filaTitulo}>
                <View style={styles.numero}>
                  <Text style={styles.numeroTexto}>{indice + 1}</Text>
                </View>
                <BarLogo nombre={bar.name} tamano={40} />
                <View style={styles.tituloTexto}>
                  <Text style={typography.cardTitle}>{bar.name}</Text>
                  <Text style={typography.muted}>
                    {ventana(new Date(bar.opens_at), new Date(bar.closes_at))} · {bar.radius_m} m
                  </Text>
                  {direccionVisible(bar.address).length > 0 ? (
                    <Text style={typography.muted} numberOfLines={1}>
                      {direccionVisible(bar.address)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.acciones}>
                <Pressable
                  style={[styles.accion, indice === 0 && styles.accionInactiva]}
                  disabled={indice === 0 || guardandoOrden}
                  onPress={() => mover(indice, -1)}
                >
                  <Text style={styles.accionTexto}>Subir</Text>
                </Pressable>
                <Pressable
                  style={[styles.accion, indice === bares.length - 1 && styles.accionInactiva]}
                  disabled={indice === bares.length - 1 || guardandoOrden}
                  onPress={() => mover(indice, 1)}
                >
                  <Text style={styles.accionTexto}>Bajar</Text>
                </Pressable>
                <Pressable
                  style={styles.accion}
                  onPress={() =>
                    router.push({
                      pathname: '/editor/[routeId]/bar',
                      params: { routeId: ruta.id, barId: bar.id },
                    })
                  }
                >
                  <Text style={styles.accionTexto}>Editar</Text>
                </Pressable>
                <Pressable style={styles.accion} onPress={() => setBorrando(bar)}>
                  <Text style={[styles.accionTexto, styles.accionPeligro]}>Quitar</Text>
                </Pressable>
              </View>
            </Card>
          ))
        )}

        <Button
          title="Anadir bar"
          onPress={() =>
            router.push({ pathname: '/editor/[routeId]/bar', params: { routeId: ruta.id } })
          }
        />
      </ScrollView>

      {/*
        Con Alert.alert este boton no hacia NADA en web: react-native-web lo
        define como `static alert() {}`. Cuarto sitio con el mismo fallo; lo
        vigila ahora tests/sin-alert.test.ts en TODA la app.
      */}
      <DialogoConfirmar
        visible={borrando !== null}
        titulo="Quitar el bar"
        mensaje={
          borrando ? `Se quita "${borrando.name}" de la ruta y sus sellos se pierden.` : ''
        }
        textoConfirmar="Quitar"
        destructivo
        ocupado={borrandoEnCurso}
        onConfirmar={onBorrarConfirmado}
        onCancelar={() => setBorrando(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  filaTitulo: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  numero: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.paperDeep,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numeroTexto: { fontWeight: '800', color: colors.ink },
  tituloTexto: { flex: 1, gap: 2 },
  acciones: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  accion: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  accionInactiva: { opacity: 0.35 },
  accionTexto: { fontSize: 13, fontWeight: '700', color: colors.ink },
  accionPeligro: { color: colors.danger },
});
