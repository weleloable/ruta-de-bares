import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Loading } from '../../src/components/ui';
import { activateMatch, deactivateMatch, getMatchProfile } from '../../src/features/match/api';
import { Casilla } from '../../src/features/match/piezas';
import { estadoPestana } from '../../src/features/match/reglas';
import { useActiveRoute } from '../../src/features/routes/ActiveRouteProvider';
import { confirmar } from '../../src/lib/confirmar';
import { colors, radius, space, typography } from '../../src/lib/theme';
import type { MatchProfileState } from '../../src/types/database';

/**
 * "Tirate una cana": el tinder cervecero de la ruta activa.
 *
 * Desactivado por defecto. La pantalla de desactivado explica ANTES de activar
 * que veran los demas, porque pulsar Activar es el consentimiento. Todas las
 * reglas estan en el servidor (0003_tirate_una_cana.sql); aqui solo se pinta.
 */
export default function CanaScreen() {
  const router = useRouter();
  const { activeRoute, loading: cargandoRuta } = useActiveRoute();

  const [perfil, setPerfil] = useState<MatchProfileState | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mayorDeEdad, setMayorDeEdad] = useState(false);
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setPerfil(await getMatchProfile());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar Tírate una caña.');
    } finally {
      setCargando(false);
    }
  }, []);

  // Al volver de la presentacion el perfil ha cambiado.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const estado = estadoPestana(activeRoute !== null, perfil);

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

  async function onDesactivar() {
    const seguro = await confirmar({
      titulo: 'Desactivar Tírate una caña',
      mensaje:
        'Dejarás de aparecer en la grilla y en los chats de tu ruta. Tus votos y conexiones se guardan para cuando vuelvas a activarlo.',
      aceptar: 'Desactivar',
    });
    if (!seguro) return;
    setCambiando(true);
    setError(null);
    try {
      await deactivateMatch();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desactivar.');
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
              <Punto icono="images-outline" texto="enviarte GIFs y zumbidos" />
              <Punto icono="beer-outline" texto="ofrecerte tomar una cerveza" />
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
                onPress={() => router.push({ pathname: '/cana/presentacion', params: { modo: 'editar' } })}
              >
                <Text style={styles.accionTexto}>Editar perfil</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.accion} onPress={onDesactivar} disabled={cambiando}>
                <Text style={styles.accionTexto}>Desactivar</Text>
              </Pressable>
            </View>

            <EmptyState
              title="Ya se te ve"
              body={`La gente de ${activeRoute?.name ?? 'tu ruta'} que también lo tenga activado ya puede verte.`}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
    borderColor: colors.green,
    backgroundColor: '#DCEBE1',
  },
  punto: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.green },
  activadoTexto: { fontSize: 13, fontWeight: '700', color: colors.green },
  hueco: { flex: 1 },
  accion: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
  },
  accionTexto: { fontSize: 13, fontWeight: '700', color: colors.ink },
});
