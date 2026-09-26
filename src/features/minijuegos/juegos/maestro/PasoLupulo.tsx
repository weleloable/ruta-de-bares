import { Fragment, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import type { ResultadoLupulo } from './pasos';
import { avanzar, DURACION, INICIO, MARCAS, resumen, terminado, tocar, VENTANA, type Estado, type MarcaId } from './lupulo';

const DT_MAX = 0.05;
const pct = (segundos: number) => `${(segundos / DURACION) * 100}%` as const;

const NOMBRE: Record<MarcaId, string> = { amargor: 'Amargor', aroma: 'Aroma' };

export function PasoLupulo({ onTerminar }: { onTerminar: (r: ResultadoLupulo) => void }) {
  const [estado, setEstado] = useState<Estado>(INICIO);
  const [empezado, setEmpezado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const estadoRef = useRef<Estado>(INICIO);
  const empezadoRef = useRef(false);
  const avisadoRef = useRef(false);
  const alTerminar = useRef(onTerminar);
  alTerminar.current = onTerminar;

  useEffect(() => {
    let raf = 0;
    let ultimo = Date.now();
    const bucle = () => {
      const ahora = Date.now();
      const dt = Math.min((ahora - ultimo) / 1000, DT_MAX);
      ultimo = ahora;
      if (empezadoRef.current && !terminado(estadoRef.current)) {
        estadoRef.current = avanzar(estadoRef.current, dt);
        setEstado(estadoRef.current);
        if (terminado(estadoRef.current) && !avisadoRef.current) {
          avisadoRef.current = true;
          const r = resumen(estadoRef.current);
          alTerminar.current({ amargor: Math.round(r.amargor * 100) / 100, aroma: Math.round(r.aroma * 100) / 100 });
        }
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pulsar = () => {
    if (terminado(estadoRef.current)) return;
    if (!empezadoRef.current) {
      empezadoRef.current = true;
      setEmpezado(true);
      return;
    }
    const r = tocar(estadoRef.current);
    if (r.marca === null) {
      setMensaje('Aún no es el momento');
      return;
    }
    estadoRef.current = r.estado;
    setEstado(r.estado);
    setMensaje(`${NOMBRE[r.marca]}: ${Math.round(r.precision * 100)} %`);
    if (r.precision >= 0.5) feedback.acierto();
    else feedback.fallo();
  };

  const fin = terminado(estado);
  const r = resumen(estado);
  // Marca a la que iria el proximo toque: se resalta para saber que se espera.
  const siguienteMarca = MARCAS.find((m) => estado.resultados[m.id] === null)?.id ?? null;

  return (
    <View style={styles.raiz}>
      <Text style={typography.muted}>
        {fin
          ? `Amargor ${Math.round(r.amargor * 100)} % · Aroma ${Math.round(r.aroma * 100)} %`
          : empezado
            ? 'Toca cuando el indicador llegue a cada marca'
            : 'El lúpulo del principio amarga y el del final da aroma.'}
      </Text>

      <View style={styles.barraZona}>
        <View style={styles.barra}>
          <View style={[styles.progreso, { width: pct(estado.t) }]} />
        </View>
        {MARCAS.map((m) => (
          <Fragment key={m.id}>
            <View
              pointerEvents="none"
              style={[styles.ventana, { left: pct(m.en - VENTANA), width: pct(VENTANA * 2) }, siguienteMarca === m.id && styles.ventanaActiva]}
            />
            <View pointerEvents="none" style={[styles.marca, { left: pct(m.en) }]}>
              <View style={[styles.palito, estado.resultados[m.id] !== null && styles.palitoHecho]} />
              <Text style={styles.marcaTexto}>{NOMBRE[m.id]}</Text>
            </View>
          </Fragment>
        ))}
        <View pointerEvents="none" style={[styles.indicador, { left: pct(estado.t) }]} />
      </View>
      <View style={styles.extremos}>
        <Text style={typography.muted}>Inicio del hervido</Text>
        <Text style={typography.muted}>Final</Text>
      </View>

      <Text style={styles.mensaje}>{mensaje ?? ' '}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={empezado ? 'Echar lúpulo' : 'Empezar el hervido'}
        disabled={fin}
        onPressIn={pulsar}
        style={({ pressed }) => [styles.boton, pressed && styles.botonPulsado, fin && styles.botonFin]}
      >
        <Text style={styles.botonTexto}>{fin ? 'Hervido terminado' : empezado ? '¡Lúpulo!' : 'Empezar hervido'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.md },
  // Alto de sobra para las etiquetas de las marcas, que cuelgan por debajo de la barra.
  barraZona: { height: 84, justifyContent: 'flex-start', paddingTop: 24 },
  barra: { height: 14, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  progreso: { height: 14, backgroundColor: colors.beer },
  ventana: {
    position: 'absolute',
    top: 22,
    height: 18,
    backgroundColor: colors.green,
    opacity: 0.25,
    borderRadius: radius.sm,
  },
  ventanaActiva: { opacity: 0.55 },
  marca: { position: 'absolute', top: 14, width: 0, alignItems: 'center' },
  palito: { width: 4, height: 34, borderRadius: 2, backgroundColor: colors.green },
  palitoHecho: { backgroundColor: colors.inkFaint },
  marcaTexto: { width: 90, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.ink },
  indicador: {
    position: 'absolute',
    top: 22,
    marginLeft: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.stamp,
    borderWidth: 3,
    borderColor: colors.white,
  },
  extremos: { flexDirection: 'row', justifyContent: 'space-between' },
  mensaje: { textAlign: 'center', fontSize: 20, fontWeight: '800', color: colors.beerDark, minHeight: 28 },
  boton: {
    minHeight: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.beer,
    borderWidth: 1,
    borderColor: colors.beerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonPulsado: { backgroundColor: colors.beerDark },
  botonFin: { opacity: 0.45 },
  botonTexto: { fontSize: 22, fontWeight: '800', color: colors.white },
});
