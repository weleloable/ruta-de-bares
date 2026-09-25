import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner, Button } from '../../components/ui';
import { diaLargo, ventana } from '../../lib/fechas';
import { colors, radius, space, typography } from '../../lib/theme';
import { useNow } from '../../lib/useNow';
import { direccionVisible } from '../routes/catalogo';
import type { RouteBarRow, StampRow } from '../../types/database';
import { LocationDeniedError, claimStamp, getCurrentPosition } from './api';
import { debeCerrarAlSoltar } from './arrastre';
import { describeVerdict, evaluateStamp, type LatLng } from './rules';

/**
 * Ficha del bar con el boton de sellar.
 *
 * La ubicacion se pide al abrir, no al pulsar: asi el usuario ve "estas a 300 m"
 * antes de intentarlo, en vez de darle a un boton para que le digan que no.
 */
export function StampSheet({
  bar,
  index,
  stamp,
  visible,
  onClose,
  onStamped,
}: {
  bar: RouteBarRow | null;
  index: number;
  stamp: StampRow | null;
  visible: boolean;
  onClose: () => void;
  onStamped: (stamp: StampRow) => void;
}) {
  const now = useNow(15_000);
  const [posicion, setPosicion] = useState<LatLng | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellando, setSellando] = useState(false);

  const localizar = useCallback(async () => {
    setUbicando(true);
    setError(null);
    try {
      setPosicion(await getCurrentPosition());
    } catch (e) {
      setPosicion(null);
      setError(
        e instanceof LocationDeniedError
          ? e.message
          : 'No se pudo obtener tu ubicacion. Comprueba el GPS.',
      );
    } finally {
      setUbicando(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !bar || stamp) return;
    void localizar();
  }, [visible, bar?.id, stamp, localizar]);

  // Al cerrar se olvida la posicion: la proxima vez que se abra hay que volver
  // a medir, porque el usuario se ha movido.
  useEffect(() => {
    if (!visible) {
      setPosicion(null);
      setError(null);
    }
  }, [visible]);

  /*
    Cerrar arrastrando la hoja entera hacia abajo. El contenido es un ScrollView,
    asi que el gesto solo se le quita (Capture) cuando es claramente vertical,
    hacia abajo y el contenido esta arriba del todo: si no, un gesto hacia abajo
    seria "volver arriba" y no "cerrar". Los toques a los botones no se tocan:
    solo se captura al MOVER, nunca al empezar.
    onClose va por una referencia porque el PanResponder se crea una sola vez.
  */
  const desplazamiento = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const alCerrar = useRef(onClose);
  alCerrar.current = onClose;
  const arrastre = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          scrollY.current <= 0 && g.dy > 6 && g.dy > Math.abs(g.dx) * 1.5,
        // Solo hacia abajo: hacia arriba la hoja no se despega de su sitio.
        onPanResponderMove: (_e, g) => desplazamiento.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (debeCerrarAlSoltar(g.dy, g.vy)) alCerrar.current();
          else Animated.spring(desplazamiento, { toValue: 0, useNativeDriver: true }).start();
        },
        // Si el sistema se lo quita (una llamada, un gesto del sistema), vuelve.
        onPanResponderTerminate: () =>
          Animated.spring(desplazamiento, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [desplazamiento],
  );

  // Cerrada la hoja, la proxima vez se abre en su sitio y no desplazada.
  useEffect(() => {
    if (!visible) desplazamiento.setValue(0);
  }, [visible, desplazamiento]);

  if (!bar) return null;

  const abre = new Date(bar.opens_at);
  const cierra = new Date(bar.closes_at);
  const verdict = evaluateStamp({
    bar: {
      id: bar.id,
      lat: bar.lat,
      lng: bar.lng,
      radiusM: bar.radius_m,
      opensAt: abre,
      closesAt: cierra,
    },
    position: posicion,
    now,
    alreadyStamped: stamp !== null,
  });

  async function onSellar() {
    if (!bar || !posicion) return;
    setSellando(true);
    setError(null);
    try {
      onStamped(await claimStamp(bar.id, posicion));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sellar.');
    } finally {
      setSellando(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.fondo} onPress={onClose} accessibilityLabel="Cerrar" />
      <Animated.View
        style={[styles.hoja, { transform: [{ translateY: desplazamiento }] }]}
        {...arrastre.panHandlers}
      >
        <View style={styles.zonaAsa}>
          <View style={styles.asa} />
        </View>
        <ScrollView
          contentContainerStyle={styles.contenido}
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
        >
          <Text style={typography.overline}>Parada {index + 1}</Text>
          <Text style={typography.screenTitle}>{bar.name}</Text>
          {direccionVisible(bar.address).length > 0 ? <Text style={typography.muted}>{direccionVisible(bar.address)}</Text> : null}

          <View style={styles.datos}>
            <Dato titulo="Dia" valor={diaLargo(abre)} />
            <Dato titulo="Ventana" valor={ventana(abre, cierra)} />
            <Dato titulo="Radio" valor={`${bar.radius_m} m`} />
          </View>

          {bar.notes.length > 0 ? (
            <View style={styles.notas}>
              <Text style={typography.overline}>Notas</Text>
              <Text style={typography.body}>{bar.notes}</Text>
            </View>
          ) : null}

          {stamp ? (
            <Banner tone="success">{describeVerdict(verdict)}</Banner>
          ) : (
            <Banner tone={verdict.status === 'ready' ? 'success' : 'info'}>
              {ubicando ? 'Buscando tu ubicacion...' : describeVerdict(verdict)}
            </Banner>
          )}

          {error ? <Banner tone="error">{error}</Banner> : null}

          {!stamp ? (
            <View style={styles.acciones}>
              <Button
                title="Sellar este bar"
                onPress={onSellar}
                disabled={verdict.status !== 'ready' || sellando}
                loading={sellando}
              />
              <Button
                title={posicion ? 'Volver a medir mi posicion' : 'Reintentar ubicacion'}
                variant="secondary"
                onPress={localizar}
                loading={ubicando}
                disabled={sellando}
              />
            </View>
          ) : null}

          <Button title="Cerrar" variant="ghost" onPress={onClose} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <Text style={typography.overline}>{titulo}</Text>
      <Text style={[typography.body, styles.datoValor]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sin velo oscuro (antes tinta al 45 %): transparente, pero sigue ocupando el
  // hueco de arriba y cerrando al tocarlo.
  fondo: { flex: 1, backgroundColor: 'transparent' },
  hoja: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '82%',
    paddingBottom: space.xl,
  },
  zonaAsa: { paddingVertical: space.md, alignItems: 'center' },
  asa: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  contenido: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: space.lg },
  datos: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  dato: { gap: 2 },
  datoValor: { fontWeight: '600' },
  notas: {
    gap: space.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  acciones: { gap: space.sm },
});
