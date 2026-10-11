import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useSondeo } from '../../lib/useSondeo';
import { CASAS, esCasa, type IdCasa } from './casas';
import { Escudo } from './Escudo';
import { Podio, type PuestoCasa } from './Podio';

const nativo = Platform.OS !== 'web';

type Resultado = { ruta: string; ganadoras: string[]; resultado: PuestoCasa[]; visto: boolean };

/** "¡Gana Mahou!", "¡Empate entre Mahou y Alhambra!" o "Sin ganadora". */
export function titularGanadoras(ganadoras: readonly string[]): string {
  const nombres = ganadoras.filter(esCasa).map((c) => CASAS[c].nombre);
  if (nombres.length === 0) return 'Sin ganadora';
  if (nombres.length === 1) return `¡Gana ${nombres[0]}!`;
  return `¡Empate entre ${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}!`;
}

/**
 * Cuando la ruta se cierra (0049): una fila "🏆 Gana Mahou · ver podio" en
 * Ruta/Sellos y, la primera vez, la pantalla de la casa ganadora. Mientras la
 * ruta siga abierta no pinta nada.
 */
export function GanadoraRuta({ rutaId }: { rutaId: string }) {
  const [res, setRes] = useState<Resultado | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('casas_resultado', { p_route_id: rutaId });
    if (error) return;
    const r = (data as Resultado | null) ?? null;
    setRes(r);
    if (r && !r.visto) setAbierto(true);
  }, [rutaId]);

  useEffect(() => {
    setRes(null);
    void cargar();
  }, [cargar]);
  useSondeo(cargar, 60_000);

  async function cerrar() {
    setAbierto(false);
    if (res && !res.visto) {
      setRes({ ...res, visto: true });
      await supabase.rpc('casas_resultado_visto', { p_route_id: rutaId });
    }
  }

  if (!res) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setAbierto(true)}
        style={({ pressed }) => [styles.fila, pressed && styles.pulsada]}
      >
        <Text style={styles.filaTexto}>{`🏆 Ruta cerrada · ${titularGanadoras(res.ganadoras)}`}</Text>
        <Text style={styles.filaVer}>Ver podio</Text>
      </Pressable>
      <PantallaGanadora resultado={res} visible={abierto} onCerrar={() => void cerrar()} />
    </>
  );
}

/** La celebracion en si (se puede ensenar sola). */
export function PantallaGanadora({ resultado, visible, onCerrar }: { resultado: Omit<Resultado, 'visto'>; visible: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const ganadoras: IdCasa[] = resultado.ganadoras.filter(esCasa);
  const ganadora: IdCasa | null = ganadoras[0] ?? null;
  const c = ganadora ? CASAS[ganadora] : null;
  const entrada = useRef(new Animated.Value(0)).current;
  const confeti = useRef(Array.from({ length: 30 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return undefined;
    entrada.setValue(0);
    Animated.spring(entrada, { toValue: 1, friction: 5, tension: 40, useNativeDriver: nativo }).start();
    const caidas = confeti.map((v, k) => {
      v.setValue(0);
      return Animated.loop(
        Animated.timing(v, { toValue: 1, duration: 2600 + (k % 7) * 350, delay: (k % 10) * 180, easing: Easing.linear, useNativeDriver: nativo }),
      );
    });
    if (ganadora) caidas.forEach((a) => a.start());
    return () => caidas.forEach((a) => a.stop());
  }, [visible, entrada, confeti, ganadora]);

  const fondo = c?.oscuro ?? colors.ink;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={[styles.fondo, { backgroundColor: fondo }]}>
        {c
          ? confeti.map((v, k) => (
              <Animated.View
                key={k}
                pointerEvents="none"
                style={[
                  styles.confeti,
                  {
                    left: (((k * 37) % 100) / 100) * width,
                    backgroundColor: k % 3 === 0 ? c.detalle : k % 3 === 1 ? c.color : '#FFFFFF',
                    transform: [
                      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-30, height + 30] }) },
                      { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(k % 2 ? 1 : -1) * 540}deg`] }) },
                    ],
                  },
                ]}
              />
            ))
          : null}
        <ScrollView style={styles.encima} contentContainerStyle={styles.cuerpo}>
          <Text style={[styles.antes, { color: c?.detalle ?? colors.beerSoft }]}>{resultado.ruta}</Text>
          {ganadoras.length > 0 ? (
            <Animated.View style={[styles.escudos, { transform: [{ scale: entrada }] }]}>
              {ganadoras.map((g) => (
                <Escudo key={g} casa={g} tamano={Math.min(150, (width * 0.38) / Math.max(1, ganadoras.length * 0.75))} />
              ))}
            </Animated.View>
          ) : null}
          <Text style={[styles.titular, { color: c?.texto ?? colors.white }]}>{titularGanadoras(resultado.ganadoras)}</Text>
          <View style={styles.tarjeta}>
            <Podio resultado={resultado.resultado} />
          </View>
          <View style={styles.botones}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onCerrar();
                router.push('/casas/historico');
              }}
              style={({ pressed }) => [styles.boton, styles.botonSecundario, pressed && styles.pulsada]}
            >
              <Text style={[styles.botonTexto, { color: colors.white }]}>Ver histórico</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onCerrar}
              style={({ pressed }) => [styles.boton, { backgroundColor: c?.detalle ?? colors.beer }, pressed && styles.pulsada]}
            >
              <Text style={[styles.botonTexto, { color: fondo }]}>¡Salud!</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  pulsada: { opacity: 0.75 },
  filaTexto: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.white },
  filaVer: { fontSize: 13, fontWeight: '700', color: colors.beerSoft },
  fondo: { flex: 1 },
  // Por encima del confeti (que es absoluto y si no tapa el texto en web).
  encima: { zIndex: 1 },
  escudos: { flexDirection: 'row', gap: space.md },
  confeti: { position: 'absolute', top: 0, width: 10, height: 16, borderRadius: 2 },
  cuerpo: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  antes: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center' },
  titular: { fontSize: 30, fontWeight: '900', textAlign: 'center' },
  tarjeta: { width: '100%', maxWidth: 420, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.paper },
  botones: { flexDirection: 'row', gap: space.md },
  boton: { paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.pill },
  botonSecundario: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  botonTexto: { fontSize: 16, fontWeight: '900' },
});
