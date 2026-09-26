import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, EmptyState, Loading } from '../../src/components/ui';
import {
  listarAlertas,
  listarAlertasMensajes,
  listarAvisosRutasTerminadas,
  listarSolicitudesFoto,
  marcarRutasTerminadasVistas,
} from '../../src/features/admin/api';
import {
  cuentaPorFiltro,
  detalleAlerta,
  ESTADOS,
  FILTROS,
  filtrarAlertas,
  hace,
  ordenarAlertas,
  pieAlerta,
  type Alerta,
  type FiltroAlerta,
} from '../../src/features/admin/alertas';
import type { AvisoRutaTerminada } from '../../src/features/admin/rutasTerminadas';
import { useNotificaciones } from '../../src/features/notificaciones/Notificaciones';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Bandeja de "Alertas de administracion", solo administradores.
 *
 * Hay dos tipos de alerta: las denuncias de la cana y las fotos de perfil
 * pendientes de aprobar (0020). La pantalla pinta `Alerta`; lo unico que sabe
 * de cada tipo es a que ticket llevar (`abrir`). Anadir otra fuente es anadir un
 * tipo en src/features/admin/alertas.ts.
 *
 * Quien protege esto de verdad es `match_admin_require()` en Postgres: aunque
 * alguien llegue a /admin/alertas escribiendo la URL, la consulta le falla.
 */
export default function AlertasAdmin() {
  const router = useRouter();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  // Rutas terminadas por borrar (0033). No son alertas de la lista: no se
  // reclaman ni se resuelven, solo desaparecen al borrar la ruta.
  const [rutasTerminadas, setRutasTerminadas] = useState<AvisoRutaTerminada[]>([]);
  const { refrescar } = useNotificaciones();
  const [filtro, setFiltro] = useState<FiltroAlerta>('abiertas');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    // Siempre con historico: la bandeja es corta y asi cambiar de chip no
    // vuelve a pedir nada. Las dos fuentes por separado: si una falla (p. ej.
    // el proyecto aun no tiene la 0020) la otra se ve igual, y el aviso dice
    // cual ha fallado.
    const [denuncias, fotos, mensajes, rutas] = await Promise.allSettled([
      listarAlertas(true),
      listarSolicitudesFoto(true),
      listarAlertasMensajes(true),
      listarAvisosRutasTerminadas(),
    ]);
    if (rutas.status === 'fulfilled') {
      setRutasTerminadas(rutas.value);
      // Verlos aqui apaga el punto rojo de este admin; los avisos se quedan.
      void marcarRutasTerminadasVistas(rutas.value.map((r) => r.routeId))
        .then(refrescar)
        .catch(() => {});
    }
    const mensaje = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : 'error desconocido');

    setAlertas(
      ordenarAlertas([
        ...(denuncias.status === 'fulfilled' ? denuncias.value : []),
        ...(fotos.status === 'fulfilled' ? fotos.value : []),
        ...(mensajes.status === 'fulfilled' ? mensajes.value : []),
      ]),
    );

    const avisos: string[] = [];
    if (denuncias.status === 'rejected') avisos.push(`No se pudieron leer las denuncias: ${mensaje(denuncias)}`);
    if (fotos.status === 'rejected') {
      avisos.push(`No se pudieron leer las fotos de perfil (¿está aplicada la migración 0020?): ${mensaje(fotos)}`);
    }
    if (mensajes.status === 'rejected') {
      avisos.push(`No se pudieron leer los mensajes (¿está aplicada la migración 0026?): ${mensaje(mensajes)}`);
    }
    setError(avisos.length > 0 ? avisos.join(' ') : null);
    setCargando(false);
  }, [refrescar]);

  // Cada tipo tiene su ticket: una denuncia lleva a sus mensajes y sanciones, una
  // foto a aprobar o rechazar, y un mensaje a responderlo.
  const abrir = useCallback(
    (alerta: Alerta) => {
      if (alerta.tipo === 'foto_perfil') {
        router.push({ pathname: '/admin/foto/[requestId]', params: { requestId: alerta.id } });
      } else if (alerta.tipo === 'mensaje') {
        router.push({ pathname: '/admin/mensaje/[messageId]', params: { messageId: alerta.id } });
      } else {
        router.push({ pathname: '/admin/alerta/[reportId]', params: { reportId: alerta.id } });
      }
    },
    [router],
  );

  // Al volver de un ticket, el estado ha podido cambiar.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const cuenta = cuentaPorFiltro(alertas);
  const visibles = filtrarAlertas(alertas, filtro);

  if (cargando && alertas.length === 0) return <Loading label="Buscando alertas..." />;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colors.beer} />}
      >
        {error ? <Banner tone="error">{error}</Banner> : null}

        {rutasTerminadas.map((aviso) => (
          <AvisoRuta key={aviso.routeId} aviso={aviso} onIr={() => router.push('/editor')} />
        ))}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtros}>
          {FILTROS.map(({ id, etiqueta }) => {
            const elegido = id === filtro;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityLabel={`${etiqueta} ${cuenta[id]}`}
                accessibilityState={{ selected: elegido }}
                onPress={() => setFiltro(id)}
                style={[styles.filtro, elegido && styles.filtroElegido]}
              >
                <Text style={[styles.filtroTexto, elegido && styles.filtroTextoElegido]}>
                  {etiqueta} {cuenta[id]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {visibles.length === 0 ? (
          <EmptyState
            title={filtro === 'resuelta' ? 'Nada cerrado todavía' : 'No hay nada pendiente'}
            body={
              filtro === 'resuelta'
                ? 'Aquí quedará lo que vayáis resolviendo, con quién lo hizo y cuándo.'
                : 'Cuando alguien denuncie a otra persona en La Caña, o suba una foto de perfil nueva, el aviso aparecerá aquí.'
            }
          />
        ) : (
          // La clave lleva el tipo: una denuncia y una foto podrian, en teoria, compartir id.
          visibles.map((alerta) => <FilaAlerta key={`${alerta.tipo}:${alerta.id}`} alerta={alerta} onAbrir={abrir} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Una ruta terminada que hay que borrar: se queda aqui hasta que se borra. */
function AvisoRuta({ aviso, onIr }: { aviso: AvisoRutaTerminada; onIr(): void }) {
  return (
    <View style={styles.avisoRuta} accessibilityRole="summary">
      <Text style={styles.avisoRutaTitulo}>{aviso.titulo}</Text>
      <Text style={styles.avisoRutaCuerpo}>{aviso.cuerpo}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onIr}
        style={({ pressed }) => [styles.avisoRutaBoton, pressed && styles.ticketPulsado]}
      >
        <Text style={styles.avisoRutaBotonTexto}>Ir al editor para borrarla</Text>
      </Pressable>
    </View>
  );
}

function FilaAlerta({ alerta, onAbrir }: { alerta: Alerta; onAbrir(alerta: Alerta): void }) {
  const estado = ESTADOS[alerta.estado];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${alerta.titulo}, sobre ${alerta.sobre}, ${estado.etiqueta}`}
      onPress={() => onAbrir(alerta)}
      style={({ pressed }) => [styles.ticket, pressed && styles.ticketPulsado]}
    >
      <View style={styles.ticketCabecera}>
        <View style={styles.estado}>
          <View style={[styles.punto, styles[`punto_${estado.tono}`]]} />
          <Text style={styles.estadoTexto}>{estado.etiqueta.toUpperCase()}</Text>
        </View>
        <Text style={styles.cuando}>{hace(alerta.cuando, new Date())}</Text>
      </View>

      <Text style={styles.titulo}>{alerta.titulo}</Text>
      <Text style={typography.muted}>{detalleAlerta(alerta)}</Text>

      <Text style={styles.pie}>{pieAlerta(alerta)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  filtros: { gap: space.sm, paddingRight: space.lg },
  filtro: {
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
  ticket: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 2,
  },
  ticketPulsado: { backgroundColor: colors.paperDeep },
  avisoRuta: {
    backgroundColor: colors.paperDeep,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  avisoRutaTitulo: { fontSize: 15, fontWeight: '700', color: colors.ink },
  avisoRutaCuerpo: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  avisoRutaBoton: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.beerDark,
  },
  avisoRutaBotonTexto: { fontSize: 13, fontWeight: '700', color: colors.beerDark },
  ticketCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  estado: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  punto: { width: 8, height: 8, borderRadius: radius.pill },
  // El color dice el estado sin leer: rojo lo que espera, ambar lo que alguien
  // ya esta mirando, verde lo cerrado.
  punto_aviso: { backgroundColor: colors.stamp },
  punto_curso: { backgroundColor: colors.beer },
  punto_hecho: { backgroundColor: colors.green },
  estadoTexto: { fontSize: 11, fontWeight: '800', color: colors.inkSoft, letterSpacing: 0.5 },
  cuando: { fontSize: 12, color: colors.inkFaint },
  titulo: { ...typography.cardTitle, marginTop: space.xs },
  pie: { fontSize: 12, color: colors.inkFaint, marginTop: space.xs },
});
