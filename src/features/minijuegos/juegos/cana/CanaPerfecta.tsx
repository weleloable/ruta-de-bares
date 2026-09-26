import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import type { PropsJuego } from '../../tipos';
import { SelectorAngulo } from './SelectorAngulo';
import { useTecladoCana } from './teclado';
import { useInclinacion } from './useInclinacion';
import { avanzar, desbordado, ESTADO_VACIO, LINEA, puntuar, total, type Estado } from './modelo';

const ALTO_VASO = 260;
/** Del pico del grifo a la boca del vaso, en px (ver `grifo` y `escenario` en los estilos). */
const CAIDA_A_LA_BOCA = 22;
/** Un fotograma largo (pestana en segundo plano) no debe llenar el vaso de golpe. */
const DT_MAX = 0.05;

export function CanaPerfecta({ onFinish }: PropsJuego) {
  const [estado, setEstado] = useState<Estado>(ESTADO_VACIO);
  const [sirviendo, setSirviendo] = useState(false);
  const [rebosa, setRebosa] = useState(false);
  const [inclinado, setInclinado] = useState(0);
  const { modo, angulo, empezar, usarManual, fijar } = useInclinacion();

  // Refs para el bucle: leer el estado de React dentro de rAF leeria uno viejo.
  const estadoRef = useRef<Estado>(ESTADO_VACIO);
  const sirviendoRef = useRef(false);
  const inicioRef = useRef<number | null>(null);
  const acabadoRef = useRef(false);

  const terminar = useCallback(
    (seDesbordo: boolean) => {
      if (acabadoRef.current) return;
      acabadoRef.current = true;
      sirviendoRef.current = false;
      setSirviendo(false);
      const segundos = inicioRef.current === null ? 0 : (Date.now() - inicioRef.current) / 1000;
      const d = puntuar(estadoRef.current, segundos, seDesbordo);
      if (seDesbordo) feedback.fallo();
      setRebosa(seDesbordo);
      onFinish({
        juego: 'cana-perfecta',
        puntuacion: d.total,
        detalles: {
          nivel: d.nivel,
          espuma: d.espuma,
          rapidez: d.rapidez,
          segundos: Math.round(segundos * 10) / 10,
          desbordada: seDesbordo,
        },
      });
    },
    [onFinish],
  );

  useEffect(() => {
    let raf = 0;
    let ultimo = Date.now();
    const bucle = () => {
      const ahora = Date.now();
      const dt = Math.min((ahora - ultimo) / 1000, DT_MAX);
      ultimo = ahora;
      if (!acabadoRef.current) {
        estadoRef.current = avanzar(estadoRef.current, dt, sirviendoRef.current, angulo.current);
        setEstado(estadoRef.current);
        setInclinado(angulo.current);
        if (desbordado(estadoRef.current)) terminar(true);
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, [terminar, angulo]);

  const abrir = useCallback(() => {
    if (acabadoRef.current) return;
    // El reloj de la rapidez arranca con el primer chorro, no al abrir la pantalla.
    inicioRef.current ??= Date.now();
    sirviendoRef.current = true;
    setSirviendo(true);
    feedback.toque();
  }, []);
  const cerrar = useCallback(() => {
    sirviendoRef.current = false;
    setSirviendo(false);
  }, []);

  useTecladoCana(
    { abrir, cerrar, ajustar: (delta) => modo === 'manual' && fijar(angulo.current + delta) },
    modo !== 'inicio',
  );

  const haServido = inicioRef.current !== null;
  const largoChorro = CAIDA_A_LA_BOCA + (1 - Math.min(total(estado), 1)) * ALTO_VASO * Math.cos((inclinado * Math.PI) / 180);
  const alto = (fraccion: number) => Math.min(Math.max(fraccion, 0), 1) * ALTO_VASO;

  return (
    <View style={styles.raiz}>
      <View style={styles.escenario}>
        <Text style={[typography.muted, styles.lineaTexto]}>
          {rebosa ? '¡Se ha desbordado!' : 'Llénalo hasta la línea'}
        </Text>
        <View style={styles.columna}>
          <View style={styles.grifo}>
            <View style={styles.grifoCuerpo} />
            <View style={styles.grifoPico} />
          </View>

          {/* Gira sobre la boca, no sobre la base: asi sigue bajo el grifo al inclinarse. Siempre hacia el mismo lado: el signo del sensor no es fiable entre plataformas. */}
          <View style={[styles.vaso, { transform: [{ rotate: `${inclinado}deg` }], transformOrigin: 'top' }]}>
            <View style={[styles.liquido, { height: alto(estado.liquido) }]} />
            <View style={[styles.espuma, { bottom: alto(estado.liquido), height: alto(estado.espuma) }]} />
            <View style={[styles.linea, { bottom: alto(LINEA) }]} />
          </View>
          {/* Despues del vaso para pintarse encima; acaba en la superficie del liquido. */}
          {sirviendo ? <View pointerEvents="none" style={[styles.chorro, { height: largoChorro }]} /> : null}
        </View>
      </View>

      {modo === 'inicio' ? (
        <View style={styles.inicio}>
          <Text style={typography.muted}>
            Empieza con el vaso inclinado y ponlo recto al final para formar la corona.
          </Text>
          <Button title="Empezar" onPress={empezar} />
        </View>
      ) : (
        <>
          {modo === 'manual' ? (
            <SelectorAngulo valor={inclinado} onChange={fijar} />
          ) : (
            <Button title="Usar deslizador" variant="ghost" onPress={usarManual} />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mantén pulsado para servir cerveza"
            onPressIn={abrir}
            onPressOut={cerrar}
            style={({ pressed }) => [styles.servir, pressed && styles.servirPulsado]}
          >
            <Text style={styles.servirTexto}>{sirviendo ? 'Sirviendo…' : 'Mantén para servir'}</Text>
          </Pressable>
          <Button
            title="Entregar"
            variant="secondary"
            disabled={!haServido || total(estado) <= 0}
            onPress={() => terminar(false)}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inicio: { gap: space.md },
  raiz: { flex: 1, gap: space.md, justifyContent: 'flex-end' },
  escenario: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: space.sm },
  // Columna propia y de tamano fijo: el chorro se coloca en absoluto dentro de ella.
  columna: { alignItems: 'center', gap: space.sm },
  grifo: { alignItems: 'center', height: 56 },
  grifoCuerpo: { width: 80, height: 22, borderRadius: radius.sm, backgroundColor: colors.borderStrong },
  grifoPico: { width: 16, height: 20, backgroundColor: colors.inkSoft },
  chorro: {
    position: 'absolute',
    // Sale justo del pico: 22 (cuerpo del grifo) + 20 (pico).
    top: 42,
    left: '50%',
    marginLeft: -4,
    width: 8,
    backgroundColor: colors.beer,
    borderRadius: 4,
    opacity: 0.9,
  },
  vaso: {
    width: 140,
    height: ALTO_VASO,
    borderWidth: 3,
    borderTopWidth: 0,
    borderColor: colors.inkSoft,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    // Mas oscuro que la espuma (blanca): sobre el papel claro no se veria.
    backgroundColor: colors.paperDeep,
    overflow: 'hidden',
  },
  liquido: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.beer },
  espuma: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 2,
    borderTopColor: colors.beerSoft,
  },
  linea: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: colors.stamp },
  lineaTexto: { textAlign: 'center' },
  servir: {
    minHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.beer,
    borderWidth: 1,
    borderColor: colors.beerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servirPulsado: { backgroundColor: colors.beerDark },
  servirTexto: { fontSize: 22, fontWeight: '800', color: colors.white },
});
