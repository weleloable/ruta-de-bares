import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Field, Loading } from '../src/components/ui';
import { useAuth } from '../src/features/auth/AuthProvider';
import { DialogoConfirmar } from '../src/features/profile/DialogoConfirmar';
import { useActiveRoute } from '../src/features/routes/ActiveRouteProvider';
import { createRoute, deleteRoute, listRoutes, updateRoute } from '../src/features/routes/api';
import {
  avisoDeRutaTerminada,
  estadoDeRuta,
  etiquetaEstado,
  LO_QUE_SE_BORRA,
  puedeTerminarseAMano,
} from '../src/features/routes/estado';
import { motivoParaNoPublicar, validateRouteDraft } from '../src/features/routes/validation';
import { aFechaISO, desdeFechaISO, diaLargo } from '../src/lib/fechas';
import { colors, radius, space, typography } from '../src/lib/theme';
import type { RouteRow } from '../src/types/database';

/**
 * Editor de rutas, solo administradores.
 *
 * La pestana ya esta oculta para usuarios normales (href: null en
 * app/(tabs)/_layout.tsx) y RLS rechaza cualquier escritura que no venga de un
 * admin. Esta comprobacion es la tercera capa, la que evita que un usuario que
 * llegue aqui por una url vea un formulario que no va a funcionar.
 */
export default function EditorScreen() {
  const { profile, isAdmin } = useAuth();
  const router = useRouter();
  const { refresh: refrescarRutaActiva } = useActiveRoute();

  const [rutas, setRutas] = useState<RouteRow[]>([]);
  // Una sola marca de tiempo para toda la lista: asi dos rutas no se pintan
  // con instantes distintos, y se refresca sola en cada recarga.
  const [ahora, setAhora] = useState(() => new Date());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(aFechaISO(new Date()));
  const [guardando, setGuardando] = useState(false);
  const [erroresFormulario, setErroresFormulario] = useState<string[]>([]);
  const [borrando, setBorrando] = useState<RouteRow | null>(null);
  const [borrandoEnCurso, setBorrandoEnCurso] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setRutas(await listRoutes());
      // El estado "terminada" se deduce de la hora: al recargar hay que mirar
      // el reloj otra vez, o una ruta que termino mientras la pantalla estaba
      // abierta seguiria saliendo como publicada.
      setAhora(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las rutas.');
    } finally {
      setCargando(false);
    }
  }, []);

  // Al volver del editor de bares la lista tiene que reflejar los cambios.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  async function onCrear() {
    if (!profile) return;
    const borrador = { name: nombre, description: descripcion, eventDate: fecha || null };
    const errores = validateRouteDraft(borrador);
    setErroresFormulario(errores);
    if (errores.length > 0) return;

    setGuardando(true);
    setError(null);
    try {
      const creada = await createRoute({ ...borrador, createdBy: profile.id });
      setNombre('');
      setDescripcion('');
      setCreando(false);
      await cargar();
      router.push({ pathname: '/editor/[routeId]', params: { routeId: creada.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la ruta.');
    } finally {
      setGuardando(false);
    }
  }

  async function onPublicar(ruta: RouteRow) {
    setError(null);
    // Solo al publicar: despublicar una sin fecha tiene que seguir siendo
    // posible, o una ruta mal creada se quedaria publicada para siempre.
    const impedimento = ruta.is_published ? null : motivoParaNoPublicar(ruta);
    if (impedimento) {
      setError(impedimento);
      return;
    }
    try {
      await updateRoute(ruta.id, { is_published: !ruta.is_published });
      await cargar();
      await refrescarRutaActiva();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la publicacion.');
    }
  }

  /*
    Terminar a mano es para cuando se cancela o se acaba antes: lo normal es que
    la ruta termine sola a las 08:00 del dia siguiente, sin tocar nada.
  */
  async function onTerminar(ruta: RouteRow) {
    setError(null);
    try {
      await updateRoute(ruta.id, { finished_at: new Date().toISOString() });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar como terminada.');
    }
  }

  async function onBorrarConfirmado() {
    if (!borrando) return;
    setBorrandoEnCurso(true);
    try {
      await deleteRoute(borrando.id);
      setBorrando(null);
      await cargar();
      await refrescarRutaActiva();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar la ruta.');
    } finally {
      setBorrandoEnCurso(false);
    }
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState
          title="Solo para administradores"
          body="El editor de rutas no esta disponible para tu cuenta."
        />
      </SafeAreaView>
    );
  }

  if (cargando && rutas.length === 0) return <Loading label="Cargando rutas..." />;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colors.beer} />
        }
      >
        {error ? <Banner tone="error">{error}</Banner> : null}

        {creando ? (
          <Card>
            <Text style={typography.sectionTitle}>Nueva ruta</Text>
            <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Ruta de La Latina" />
            <Field
              label="Descripcion"
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Seis paradas, empezamos a las 19:00"
              multiline
            />
            <Field
              label="Fecha"
              value={fecha}
              onChangeText={setFecha}
              placeholder="AAAA-MM-DD"
              autoCapitalize="none"
              hint="Formato AAAA-MM-DD. Dejalo vacio si aun no hay fecha."
            />
            {erroresFormulario.map((mensaje) => (
              <Text key={mensaje} style={typography.error}>
                {mensaje}
              </Text>
            ))}
            <Button title="Crear y anadir bares" onPress={onCrear} loading={guardando} />
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => {
                setCreando(false);
                setErroresFormulario([]);
              }}
            />
          </Card>
        ) : (
          <Button title="Nueva ruta" onPress={() => setCreando(true)} />
        )}

        {rutas.length === 0 ? (
          <EmptyState
            title="Sin rutas todavia"
            body="Crea la primera ruta, anade sus bares con sus horarios y publicala para que la gente pueda sellar."
          />
        ) : (
          rutas.map((ruta) => {
            const dia = desdeFechaISO(ruta.event_date);
            // Se deduce en cada pintada y no se guarda: ver routes/estado.ts.
            const estado = estadoDeRuta(ruta, ahora);
            const avisoFin = avisoDeRutaTerminada(ruta, ahora);
            return (
              <Card key={ruta.id}>
                <View style={styles.filaTitulo}>
                  <Text style={typography.sectionTitle} numberOfLines={2}>
                    {ruta.name}
                  </Text>
                  <View
                    style={[
                      styles.etiqueta,
                      estado === 'publicada' && styles.etiquetaPublicada,
                      estado === 'terminada' && styles.etiquetaTerminada,
                    ]}
                  >
                    <Text
                      style={[
                        styles.etiquetaTexto,
                        estado === 'publicada' && styles.etiquetaTextoPublicada,
                        estado === 'terminada' && styles.etiquetaTextoTerminada,
                      ]}
                    >
                      {etiquetaEstado(estado)}
                    </Text>
                  </View>
                </View>

                {dia ? <Text style={typography.muted}>{diaLargo(dia)}</Text> : null}
                {/*
                  El unico recordatorio que hay de que toca borrar: no hay cron
                  ni tarea programada, asi que si nadie pulsa, los datos del
                  evento se quedan. Por eso lo dice aqui y no en un sitio al que
                  haya que ir a mirar.
                */}
                {avisoFin ? <Text style={styles.avisoFin}>{avisoFin}</Text> : null}
                {ruta.description.length > 0 ? (
                  <Text style={typography.body}>{ruta.description}</Text>
                ) : null}

                <View style={styles.acciones}>
                  <Pressable
                    style={styles.accion}
                    onPress={() =>
                      router.push({ pathname: '/editor/[routeId]', params: { routeId: ruta.id } })
                    }
                  >
                    <Text style={styles.accionTexto}>Editar bares</Text>
                  </Pressable>
                  <Pressable style={styles.accion} onPress={() => onPublicar(ruta)}>
                    <Text style={styles.accionTexto}>
                      {ruta.is_published ? 'Despublicar' : 'Publicar'}
                    </Text>
                  </Pressable>
                  {puedeTerminarseAMano(ruta, ahora) ? (
                    <Pressable style={styles.accion} onPress={() => void onTerminar(ruta)}>
                      <Text style={styles.accionTexto}>Marcar terminada</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.accion} onPress={() => setBorrando(ruta)}>
                    <Text style={[styles.accionTexto, styles.accionPeligro]}>Borrar</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/*
        Con Alert.alert este boton no hacia NADA en web: react-native-web lo
        define como `static alert() {}`. Mismo fallo y misma solucion que en
        "Cerrar sesion" (PR #8) y en "Anular" de Invitaciones.
      */}
      <DialogoConfirmar
        visible={borrando !== null}
        titulo="Borrar la ruta"
        mensaje={
          borrando
            ? `Se borra "${borrando.name}". ${LO_QUE_SE_BORRA}`
            : ''
        }
        textoConfirmar="Borrar"
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
  filaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  etiqueta: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.paperDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  etiquetaPublicada: { backgroundColor: '#DCEBE1', borderColor: colors.green },
  etiquetaTerminada: { backgroundColor: colors.paperDeep, borderColor: colors.borderStrong },
  avisoFin: { fontSize: 13, fontWeight: '700', color: colors.beerDark },
  etiquetaTexto: { fontSize: 11, fontWeight: '700', color: colors.inkSoft },
  etiquetaTextoPublicada: { color: colors.green },
  etiquetaTextoTerminada: { color: colors.inkSoft },
  acciones: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  accion: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  accionTexto: { fontSize: 13, fontWeight: '700', color: colors.ink },
  accionPeligro: { color: colors.danger },
});
