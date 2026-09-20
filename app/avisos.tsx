import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, EmptyState, Loading } from '../src/components/ui';
import { listarAvisos, marcarAvisosLeidos } from '../src/features/notices/api';
import { COMO_RECLAMAR, cuando, textoAviso } from '../src/features/notices/avisos';
import { colors, radius, space, typography } from '../src/lib/theme';
import type { UserNoticeRow } from '../src/types/database';

/**
 * Las decisiones de moderacion que le afectan a quien entra, con su motivo.
 *
 * Existe porque el art. 17 del Reglamento de Servicios Digitales obliga a
 * comunicar toda restriccion con una "declaracion de motivos", y el art. 20 da
 * seis meses para reclamar: por eso cada aviso lleva el motivo tal cual lo
 * escribio quien modera, la fecha, y a quien dirigirse.
 *
 * Funciona aunque a la persona la hayan expulsado de la ruta o suspendido la
 * cuenta, que es justo cuando hace falta: entrar sigue siendo posible.
 */
export default function Avisos() {
  const [avisos, setAvisos] = useState<UserNoticeRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const leidos = await listarAvisos();
      setAvisos(leidos);
      setError(null);
      // Marcar leido al ABRIR y no al pulsar nada: la fecha de lectura es la
      // prueba de que se le comunico. Se pintan con lo que ya se ha traido, asi
      // que la marca no cambia esta pantalla hasta la proxima vez.
      if (leidos.some((a) => a.read_at === null)) await marcarAvisosLeidos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron leer tus avisos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  if (cargando && avisos.length === 0) return <Loading label="Buscando tus avisos..." />;

  return (
    <SafeAreaView style={styles.pantalla} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.cuerpo}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colors.beer} />}
      >
        {error ? <Banner tone="error">{error}</Banner> : null}

        {avisos.length === 0 ? (
          <EmptyState
            title="No hay nada"
            body="Aquí aparecerían las decisiones que se tomen sobre tu cuenta, con el motivo."
          />
        ) : (
          <>
            <Text style={typography.muted}>
              Decisiones que se han tomado sobre tu cuenta. Se quedan aquí aunque ya no estés en la ruta.
            </Text>
            {avisos.map((avisoRow) => (
              <FichaAviso key={avisoRow.id} aviso={avisoRow} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FichaAviso({ aviso }: { aviso: UserNoticeRow }) {
  const router = useRouter();
  const texto = textoAviso(aviso.action);
  const nuevo = aviso.read_at === null;

  return (
    <Card>
      <View style={styles.cabecera}>
        <View
          style={[styles.punto, texto.restriccion ? styles.puntoRestriccion : styles.puntoLevantado]}
        />
        <Text style={styles.estado}>{nuevo ? 'SIN LEER' : 'LEÍDO'}</Text>
      </View>

      <Text style={styles.titulo}>{texto.titulo}</Text>
      {aviso.route_name ? <Text style={typography.muted}>{aviso.route_name}</Text> : null}
      <Text style={styles.fecha}>{cuando(aviso.created_at)}</Text>

      {aviso.reason ? (
        <View style={styles.motivo}>
          <Text style={typography.overline}>Motivo</Text>
          <Text style={styles.motivoTexto}>{aviso.reason}</Text>
        </View>
      ) : null}

      <Text style={styles.explicacion}>{texto.explicacion}</Text>
      {/*
        El boton del art. 20 del DSA: seis meses para reclamar una decision. Solo
        en las restrictivas, porque levantar un veto no se reclama. Lleva el id
        del aviso pegado, que es lo que ata la reclamacion a ESTA decision.
      */}
      {texto.restriccion ? (
        <>
          <Text style={styles.reclamar}>{COMO_RECLAMAR}</Text>
          <Button
            title="No estoy de acuerdo con esta decisión"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/contacto', params: { aviso: aviso.id, accion: texto.titulo } })
            }
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.paper },
  cuerpo: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  punto: { width: 8, height: 8, borderRadius: radius.pill },
  punto_relleno: {},
  puntoRestriccion: { backgroundColor: colors.stamp },
  puntoLevantado: { backgroundColor: colors.green },
  estado: { fontSize: 11, fontWeight: '800', color: colors.inkSoft, letterSpacing: 0.5 },
  titulo: { ...typography.cardTitle },
  fecha: { fontSize: 12, color: colors.inkFaint },
  motivo: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.paperDeep,
    gap: space.xs,
  },
  motivoTexto: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  explicacion: { marginTop: space.sm, fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  reclamar: { fontSize: 14, color: colors.beerDark, fontWeight: '600', lineHeight: 20 },
});
