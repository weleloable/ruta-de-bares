import { Fragment, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';

import { colors, radius, space, typography } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { BOLSA_ANCHO, BOLSA_ALTO, BolsaColgante, BolsaEnOlla, BolsaVolando, posicionEnOlla } from './BolsitaLupulo';
import { avanzar, DURACION, estadoBolsa, INICIO, MARCAS, resumen, terminado, tocar, VENTANA, type Estado, type MarcaId } from './lupulo';
import { ANCHO_OLLA, OllaMaceracion } from './OllaMaceracion';
import type { ResultadoLupulo } from './pasos';

const DT_MAX = 0.05;
/** Ancho de la escena de la olla: la olla va centrada, y de aqui sale donde empieza. */
const ANCHO_ESCENA = ANCHO_OLLA;
const pct = (segundos: number) => `${(segundos / DURACION) * 100}%` as const;

const NOMBRE: Record<MarcaId, string> = { amargor: 'Amargor', aroma: 'Aroma' };

export function PasoLupulo({ onTerminar }: { onTerminar: (r: ResultadoLupulo) => void }) {
  const [estado, setEstado] = useState<Estado>(INICIO);
  const [empezado, setEmpezado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // A las que se ha tocado (no lo mismo que "tienen resultado": dejar pasar una tambien lo tiene).
  const [echadas, setEchadas] = useState<MarcaId[]>([]);
  // Las que van cayendo y las que ya estan flotando en la olla.
  const [volando, setVolando] = useState<MarcaId[]>([]);
  const [enOlla, setEnOlla] = useState<MarcaId[]>([]);
  // Donde esta cada cosa, para que la bolsa caiga de su sitio a la olla de verdad.
  const [filaBolsas, setFilaBolsas] = useState<LayoutRectangle | null>(null);
  const [zonaOlla, setZonaOlla] = useState<LayoutRectangle | null>(null);

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
    setEchadas((hechas) => [...hechas, r.marca as MarcaId]);
    setVolando((v) => [...v, r.marca as MarcaId]);
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

      {/* Las bolsitas cuelgan sobre su marca de la barra (mismo ancho y mismo %). */}
      <View style={styles.filaBolsas} onLayout={(e) => setFilaBolsas(e.nativeEvent.layout)}>
        {MARCAS.map((m) => {
          const e = estadoBolsa(m.id, estado, echadas);
          return (
            <View key={m.id} pointerEvents="none" style={[styles.huecoBolsa, { left: pct(m.en) }]}>
              {e === 'echada' ? <View style={styles.huecoVacio} /> : <BolsaColgante id={m.id} estado={e} />}
            </View>
          );
        })}
      </View>

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

      {/* El boton va ANTES de la olla: la olla es alta y, debajo de ella, el boton se salia de la pantalla. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={empezado ? 'Echar lúpulo' : 'Empezar el hervido'}
        disabled={fin}
        onPressIn={pulsar}
        style={({ pressed }) => [styles.boton, pressed && styles.botonPulsado, fin && styles.botonFin]}
      >
        <Text style={styles.botonTexto}>{fin ? 'Hervido terminado' : empezado ? '¡Lúpulo!' : 'Empezar hervido'}</Text>
      </Pressable>

      <View style={styles.zonaOlla} onLayout={(e) => setZonaOlla(e.nativeEvent.layout)}>
        <OllaMaceracion
          hervor
          pulsos={enOlla.length}
          hijos={enOlla.map((id) => (
            <BolsaEnOlla key={id} id={id} />
          ))}
        />
      </View>

      {/* Las que estan cayendo van por encima de todo, en coordenadas de este paso. */}
      {filaBolsas && zonaOlla
        ? volando.map((id) => {
            const m = MARCAS.find((x) => x.id === id)!;
            const destino = posicionEnOlla(id);
            return (
              <BolsaVolando
                key={id}
                id={id}
                desde={{ x: filaBolsas.x + (m.en / DURACION) * filaBolsas.width - BOLSA_ANCHO / 2, y: filaBolsas.y }}
                hasta={{ x: zonaOlla.x + (zonaOlla.width - ANCHO_ESCENA) / 2 + destino.izquierda, y: zonaOlla.y + destino.arriba }}
                alTerminar={() => {
                  setVolando((v) => v.filter((x) => x !== id));
                  setEnOlla((v) => [...v, id]);
                }}
              />
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.md },
  // Alto de sobra para las etiquetas de las marcas, que cuelgan por debajo de la barra.
  filaBolsas: { height: BOLSA_ALTO + 4 },
  huecoBolsa: { position: 'absolute', top: 0, width: 0, alignItems: 'center' },
  huecoVacio: { width: BOLSA_ANCHO, height: BOLSA_ALTO },
  zonaOlla: { alignItems: 'center' },
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
