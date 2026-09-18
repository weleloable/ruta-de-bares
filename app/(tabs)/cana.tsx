import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Loading } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/AuthProvider';
import {
  activateMatch,
  deactivateMatch,
  getMatchGrid,
  getMatchInbox,
  getMatchProfile,
} from '../../src/features/match/api';
import { ListaChats } from '../../src/features/match/ListaChats';
import { Casilla } from '../../src/features/match/piezas';
import {
  FILTROS,
  chatsPendientes,
  contarPorFiltro,
  estadoPestana,
  estadoTarjeta,
  pasaFiltro,
  type Filtro,
} from '../../src/features/match/reglas';
import { LeyendaVasos, TarjetaPersona } from '../../src/features/match/TarjetaPersona';
import { VasoCana, type NivelVaso } from '../../src/features/match/VasoCana';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { DialogoConfirmar } from '../../src/features/profile/DialogoConfirmar';
import { colors, radius, space, typography } from '../../src/lib/theme';
import { useSondeo } from '../../src/lib/useSondeo';
import type { MatchGridRow, MatchInboxRow, MatchProfileState } from '../../src/types/database';

/**
 * Cada cuanto se refrescan grilla y chats con la pestana a la vista. Mas a
 * menudo en Chats: ahi lo que llega (una pregunta) pide respuesta.
 */
const REFRESCO_PERFILES_MS = 45_000;
const REFRESCO_CHATS_MS = 15_000;

/** El mismo vaso de la tarjeta en el filtro de ese estado: la leyenda se aprende sola. */
const VASO_FILTRO: Partial<Record<Filtro, NivelVaso>> = {
  'me-gusta': 'media',
  visto: 'vacio',
  conexiones: 'llena',
};

type Vista = 'perfiles' | 'chats';

const VACIO: Record<Filtro, { title: string; body: string }> = {
  todos: {
    title: 'Aún no hay nadie',
    body: 'Cuando alguien de tu ruta active Tírate una caña, aparecerá aquí.',
  },
  'me-gusta': { title: 'Nadie marcado', body: 'Las personas a las que des Me gusta aparecerán aquí.' },
  visto: {
    title: 'Nadie visto todavía',
    body: 'Aquí verás a quien hayas abierto sin darle Me gusta.',
  },
  conexiones: {
    title: 'Sin conexiones todavía',
    body: 'Cuando alguien a quien has dado Me gusta te lo devuelva, aparecerá aquí.',
  },
  nuevos: { title: 'Nada nuevo', body: 'Ya has votado a todo el mundo. Vuelve más tarde.' },
};

/**
 * "Tirate una cana": el tinder cervecero de la ruta activa.
 *
 * Desactivado por defecto. La pantalla de desactivado explica ANTES de activar
 * que veran los demas, porque pulsar Activar es el consentimiento. Todas las
 * reglas estan en el servidor (0003_tirate_una_cana.sql); aqui solo se pinta.
 */
export default function CanaScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const yo = session?.user.id ?? '';
  const { activeRoute, loading: cargandoRuta } = useActiveRoute();

  const [perfil, setPerfil] = useState<MatchProfileState | null>(null);
  const [tarjetas, setTarjetas] = useState<MatchGridRow[]>([]);
  const [bandeja, setBandeja] = useState<MatchInboxRow[]>([]);
  const [vista, setVista] = useState<Vista>('perfiles');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mayorDeEdad, setMayorDeEdad] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false);

  const rutaId = activeRoute?.id ?? null;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const actual = await getMatchProfile();
      setPerfil(actual);
      const [grilla, chats] =
        actual.is_active && rutaId ? await Promise.all([getMatchGrid(rutaId), getMatchInbox(rutaId)]) : [[], []];
      setTarjetas(grilla);
      setBandeja(chats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar Tírate una caña.');
    } finally {
      setCargando(false);
    }
  }, [rutaId]);

  // Al volver de la presentacion o de una ficha, perfil y votos han cambiado.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const estado = estadoPestana(activeRoute !== null, perfil);

  // En segundo plano y sin spinner: alguien nuevo, una conexion, un mensaje.
  // Un fallo puntual de red no pisa la grilla que ya se ve.
  const refrescar = useCallback(async () => {
    if (!rutaId) return;
    try {
      const [grilla, chats] = await Promise.all([getMatchGrid(rutaId), getMatchInbox(rutaId)]);
      setTarjetas(grilla);
      setBandeja(chats);
    } catch {
      // El siguiente tick lo reintenta.
    }
  }, [rutaId]);
  useSondeo(
    refrescar,
    vista === 'chats' ? REFRESCO_CHATS_MS : REFRESCO_PERFILES_MS,
    estado.tipo === 'activado',
  );

  const pendientes = chatsPendientes(bandeja, yo);

  async function onActivar() {
    if (estado.tipo !== 'desactivado') return;
    if (estado.primeraVez) {
      router.push({ pathname: '/cana/presentacion', params: { modo: 'alta', adulto: mayorDeEdad ? '1' : '0' } });
      return;
    }
    setCambiando(true);
    setError(null);
    try {
      await activateMatch();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar.');
    } finally {
      setCambiando(false);
    }
  }

  async function onConfirmarDesactivar() {
    setCambiando(true);
    setError(null);
    try {
      await deactivateMatch();
      setConfirmandoDesactivar(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desactivar.');
      setConfirmandoDesactivar(false);
    } finally {
      setCambiando(false);
    }
  }

  if ((cargando && perfil === null) || (cargandoRuta && !activeRoute)) {
    return <Loading label="Tirando la caña..." />;
  }

  if (estado.tipo === 'sin-ruta') {
    return (
      <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
        <EmptyState
          title="Todavía no hay ruta"
          body="Tírate una caña funciona dentro de una ruta. Cuando participes en una, aquí podrás conocer a su gente."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colors.beer} />}
      >
        {error ? <Banner tone="error">{error}</Banner> : null}

        {estado.tipo === 'desactivado' ? (
          <>
            <Card style={styles.intro}>
              <View style={styles.sello}>
                <Text style={styles.selloTexto}>CAÑA</Text>
              </View>
              <Text style={typography.screenTitle}>Un tinder cervecero</Text>
              <Text style={[typography.muted, styles.centrado]}>
                Conoce a la gente de {activeRoute?.name} y ofrécele una caña.
              </Text>
            </Card>

            <Card>
              <Text style={typography.sectionTitle}>Si lo activas</Text>
              <Text style={typography.body}>Quienes también lo tengan activado en esta ruta podrán:</Text>
              <Punto icono="person-circle-outline" texto="ver tu nombre y tu foto" />
              <Punto icono="beer-outline" texto="ofrecerte tomar una cerveza" />
              <Punto icono="chatbubble-outline" texto="escribirte un mensaje, solo si aceptas la cerveza" />
              <Text style={typography.muted}>
                Mientras esté desactivado nadie te ve. Puedes activarlo y desactivarlo cuando quieras.
              </Text>
            </Card>

            {estado.pideMayoriaDeEdad ? (
              <Casilla marcada={mayorDeEdad} onCambiar={setMayorDeEdad} texto="Soy mayor de edad" />
            ) : null}

            <Button
              title={estado.primeraVez ? 'Activar y presentarme' : 'Activar'}
              onPress={onActivar}
              disabled={estado.pideMayoriaDeEdad && !mayorDeEdad}
              loading={cambiando}
            />
          </>
        ) : (
          <>
            <View style={styles.barra}>
              <View style={styles.activado}>
                <View style={styles.punto} />
                <Text style={styles.activadoTexto}>Activado</Text>
              </View>
              <View style={styles.hueco} />
              <Pressable
                accessibilityRole="button"
                style={styles.accion}
                onPress={() => setConfirmandoDesactivar(true)}
                disabled={cambiando}
              >
                <Text style={styles.accionTexto}>Desactivar</Text>
              </Pressable>
            </View>

            {/* Fila aparte: desactivar va pegado al estado, y lo demas son
                sitios a los que ir, que no urgen. */}
            <View style={styles.enlaces}>
              <Pressable
                accessibilityRole="button"
                style={styles.accion}
                onPress={() => router.push({ pathname: '/cana/presentacion', params: { modo: 'editar' } })}
              >
                <Text style={styles.accionTexto}>Editar perfil</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.accion}
                onPress={() => router.push('/cana/bloqueados')}
              >
                <Text style={styles.accionTexto}>Bloqueados</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.accion}
                onPress={() => router.push('/cana/mis-datos')}
              >
                <Text style={styles.accionTexto}>Mis datos</Text>
              </Pressable>
            </View>

            <View style={styles.segmento} accessibilityRole="tablist">
              {(['perfiles', 'chats'] as const).map((opcion) => {
                const elegida = opcion === vista;
                return (
                  <Pressable
                    key={opcion}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: elegida }}
                    accessibilityLabel={
                      opcion === 'perfiles'
                        ? 'Perfiles'
                        : `Chats${pendientes > 0 ? `, ${pendientes} pendientes` : ''}`
                    }
                    onPress={() => setVista(opcion)}
                    style={[styles.segmentoOpcion, elegida && styles.segmentoElegido]}
                  >
                    <Text style={[styles.segmentoTexto, elegida && styles.segmentoTextoElegido]}>
                      {opcion === 'perfiles' ? 'Perfiles' : 'Chats'}
                    </Text>
                    {opcion === 'chats' && pendientes > 0 ? (
                      <View style={styles.pendientes}>
                        <Text style={styles.pendientesTexto}>{pendientes}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {vista === 'chats' ? (
              <ListaChats
                filas={bandeja}
                yo={yo}
                onAbrir={(connectionId) =>
                  router.push({ pathname: '/cana/chat/[connectionId]', params: { connectionId } })
                }
              />
            ) : (
              <VistaPerfiles
                tarjetas={tarjetas}
                filtro={filtro}
                onFiltro={setFiltro}
                onAbrir={(userId) => router.push({ pathname: '/cana/persona/[userId]', params: { userId } })}
              />
            )}
          </>
        )}
      </ScrollView>

      <DialogoConfirmar
        visible={confirmandoDesactivar}
        titulo="Desactivar Tírate una caña"
        mensaje="Dejarás de aparecer en la grilla y en los chats de tu ruta. Tus votos y conexiones se guardan para cuando vuelvas a activarlo."
        textoConfirmar="Desactivar"
        ocupado={cambiando}
        onConfirmar={onConfirmarDesactivar}
        onCancelar={() => setConfirmandoDesactivar(false)}
      />
    </SafeAreaView>
  );
}

/** Filtros con contador y la grilla de tres columnas. */
function VistaPerfiles({
  tarjetas,
  filtro,
  onFiltro,
  onAbrir,
}: {
  tarjetas: readonly MatchGridRow[];
  filtro: Filtro;
  onFiltro(filtro: Filtro): void;
  onAbrir(userId: string): void;
}) {
  const estados = tarjetas.map(estadoTarjeta);
  const cuenta = contarPorFiltro(estados);
  const visibles = tarjetas.filter((_, indice) => pasaFiltro(filtro, estados[indice]));

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtros}>
        {FILTROS.map(({ id, etiqueta }) => {
          const elegido = id === filtro;
          const vaso = VASO_FILTRO[id];
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={`${etiqueta} ${cuenta[id]}`}
              accessibilityState={{ selected: elegido }}
              onPress={() => onFiltro(id)}
              style={[styles.filtro, elegido && styles.filtroElegido]}
            >
              {vaso ? (
                <VasoCana
                  nivel={vaso}
                  tamano={16}
                  trazo={elegido ? colors.card : colors.beerDark}
                  liquido={elegido ? colors.beerSoft : colors.beer}
                />
              ) : null}
              <Text style={[styles.filtroTexto, elegido && styles.filtroTextoElegido]}>
                {etiqueta} {cuenta[id]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tarjetas.length > 0 ? <LeyendaVasos /> : null}

      {visibles.length === 0 ? (
        <EmptyState title={VACIO[filtro].title} body={VACIO[filtro].body} />
      ) : (
        <View style={styles.rejilla}>
          {visibles.map((persona) => (
            <TarjetaPersona key={persona.user_id} persona={persona} onPress={() => onAbrir(persona.user_id)} />
          ))}
        </View>
      )}
    </>
  );
}

function Punto({ icono, texto }: { icono: ComponentProps<typeof Ionicons>['name']; texto: string }) {
  return (
    <View style={styles.fila}>
      <Ionicons name={icono} size={20} color={colors.beerDark} />
      <Text style={typography.body}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  intro: { alignItems: 'center', gap: space.sm },
  centrado: { textAlign: 'center' },
  sello: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
    marginVertical: space.sm,
  },
  selloTexto: { fontSize: 19, fontWeight: '800', color: colors.stamp, letterSpacing: 1 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barra: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  activado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.beer,
    backgroundColor: colors.beerSoft,
  },
  punto: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.beer },
  activadoTexto: { fontSize: 13, fontWeight: '700', color: colors.beerDark },
  hueco: { flex: 1 },
  enlaces: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  accion: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  accionTexto: { fontSize: 13, fontWeight: '700', color: colors.ink },
  segmento: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.paperDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentoOpcion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  segmentoElegido: { backgroundColor: colors.card },
  segmentoTexto: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  segmentoTextoElegido: { color: colors.ink, fontWeight: '800' },
  pendientes: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendientesTexto: { color: colors.white, fontSize: 11, fontWeight: '800' },
  filtros: { gap: space.sm, paddingRight: space.lg },
  filtro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filtroElegido: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  filtroTexto: { color: colors.inkSoft, fontWeight: '600', fontSize: 13, fontVariant: ['tabular-nums'] },
  filtroTextoElegido: { color: colors.white },
  // Sin padding lateral propio: cada celda trae su aire y el hueco del aro de
  // conexion (TarjetaPersona, 2 + 2 + 2 px); el margen negativo alinea los
  // bordes de las tarjetas con el resto de la pantalla.
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
});
