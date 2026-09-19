import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, EmptyState, Loading } from '../../src/components/ui';
import { listarAlertas } from '../../src/features/admin/api';
import {
  cuentaPorFiltro,
  ESTADOS,
  etiquetaResolucion,
  FILTROS,
  filtrarAlertas,
  hace,
  type Alerta,
  type FiltroAlerta,
} from '../../src/features/admin/alertas';
import { colors, radius, space, typography } from '../../src/lib/theme';

/**
 * Bandeja de "Alertas de administracion", solo administradores.
 *
 * Hoy solo hay un tipo de alerta (las denuncias de la cana), pero la pantalla
 * no lo sabe: pinta `Alerta`, y anadir otra fuente es anadir un tipo en
 * src/features/admin/alertas.ts sin tocar esto.
 *
 * Quien protege esto de verdad es `match_admin_require()` en Postgres: aunque
 * alguien llegue a /admin/alertas escribiendo la URL, la consulta le falla.
 */
export default function AlertasAdmin() {
  const router = useRouter();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [filtro, setFiltro] = useState<FiltroAlerta>('abiertas');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // Siempre con historico: la bandeja es corta y asi cambiar de chip no
      // vuelve a pedir nada.
      setAlertas(await listarAlertas(true));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer las alertas.');
    } finally {
      setCargando(false);
    }
  }, []);

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
                : 'Cuando alguien denuncie a otra persona en Tírate una caña, el aviso aparecerá aquí.'
            }
          />
        ) : (
          visibles.map((alerta) => (
            <FilaAlerta
              key={alerta.id}
              alerta={alerta}
              onAbrir={(id) => router.push({ pathname: '/admin/alerta/[reportId]', params: { reportId: id } })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FilaAlerta({ alerta, onAbrir }: { alerta: Alerta; onAbrir(alertaId: string): void }) {
  const estado = ESTADOS[alerta.estado];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${alerta.titulo}, sobre ${alerta.sobre}, ${estado.etiqueta}`}
      onPress={() => onAbrir(alerta.id)}
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
      <Text style={typography.muted}>
        Sobre {alerta.sobre} · de {alerta.de}
      </Text>

      <Text style={styles.pie}>
        {alerta.mensajes > 0
          ? `${alerta.mensajes} ${alerta.mensajes === 1 ? 'mensaje copiado' : 'mensajes copiados'}`
          : 'Sin mensajes'}
        {alerta.resolucion ? ` · ${etiquetaResolucion(alerta.resolucion)}` : ''}
      </Text>
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
