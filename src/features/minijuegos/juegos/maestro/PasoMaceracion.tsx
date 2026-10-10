import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { colors, radius, space } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { ALTO_OLLA, OllaMaceracion } from './OllaMaceracion';
import {
  avanzar,
  calentar,
  DURACION,
  escalaOlla,
  INICIO,
  precision,
  TEMP_MAX,
  TEMP_MIN,
  terminado,
  ZONA,
  type Estado,
} from './maceracion';

// El paso tiene que caber en la pantalla SIN scroll (si no, el boton queda tapado
// por "Siguiente"): la olla y el termometro se encogen juntos con `escalaOlla`;
// lo demas tiene altos fijos y compactos.
const ALTO = ALTO_OLLA;
const ALTO_TEXTO = 24;
const ALTO_TIEMPO = 40;
const ALTO_ETIQUETA = 22;
const ALTO_BOTON = 64;
const HUECOS = 3;
/** Lo que mide de mas de lo que suman las franjas (alineacion de la fila del tiempo, redondeos): medido con `npm run verificar:juego`. */
const HOLGURA = 12;
/** Todo lo del paso menos la olla y el termometro: lo que entra en la cuenta de `escalaOlla`. */
export const ALTO_RESTO_PASO = ALTO_TEXTO + ALTO_TIEMPO + ALTO_ETIQUETA + ALTO_BOTON + HUECOS * space.sm + HOLGURA;
const RANGO = TEMP_MAX - TEMP_MIN;
/** Cada cuantos segundos cambia el rumbo de la deriva: mas seguido seria un temblor, no una deriva. */
const CAMBIO_RUMBO = 0.6;
const DT_MAX = 0.05;

/** Altura de una temperatura en un termometro de `alto` px. */
const pos = (temp: number, alto: number) => ((temp - TEMP_MIN) / RANGO) * alto;

function veredicto(p: number): string {
  if (p < 0.4) return 'Agua tibia';
  if (p < 0.7) return 'Se deja beber';
  if (p < 0.9) return 'Buena maceración';
  return 'Maceración de maestro';
}

export function PasoMaceracion({ onTerminar }: { onTerminar: (precision: number) => void }) {
  const [estado, setEstado] = useState<Estado>(INICIO);
  const [empezado, setEmpezado] = useState(false);
  // Cuenta de toques: la olla da una llamarada cada vez que cambia.
  const [pulsos, setPulsos] = useState(0);

  const estadoRef = useRef<Estado>(INICIO);
  const empezadoRef = useRef(false);
  const avisadoRef = useRef(false);
  const alTerminar = useRef(onTerminar);
  alTerminar.current = onTerminar;

  useEffect(() => {
    let raf = 0;
    let ultimo = Date.now();
    let ruido = 0;
    let proximoCambio = 0;
    const bucle = () => {
      const ahora = Date.now();
      const dt = Math.min((ahora - ultimo) / 1000, DT_MAX);
      ultimo = ahora;
      // El reloj y la deriva no corren hasta el primer toque.
      if (empezadoRef.current && !terminado(estadoRef.current)) {
        proximoCambio -= dt;
        if (proximoCambio <= 0) {
          ruido = Math.random() * 2 - 1;
          proximoCambio = CAMBIO_RUMBO;
        }
        estadoRef.current = avanzar(estadoRef.current, dt, ruido);
        setEstado(estadoRef.current);
        if (terminado(estadoRef.current) && !avisadoRef.current) {
          avisadoRef.current = true;
          alTerminar.current(Math.round(precision(estadoRef.current) * 100) / 100);
        }
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tocar = () => {
    if (terminado(estadoRef.current)) return;
    if (!empezadoRef.current) {
      empezadoRef.current = true;
      setEmpezado(true);
    }
    estadoRef.current = calentar(estadoRef.current);
    setEstado(estadoRef.current);
    setPulsos((n) => n + 1);
    feedback.toque();
  };

  const fin = terminado(estado);
  const enZona = estado.temp >= ZONA.min && estado.temp <= ZONA.max;
  const restante = Math.max(DURACION - estado.t, 0);
  const p = precision(estado);

  const { height: altoVentana } = useWindowDimensions();
  const escala = escalaOlla(altoVentana, ALTO_RESTO_PASO, ALTO);
  const altoTermometro = ALTO * escala;

  return (
    <View style={styles.raiz}>
      <Text style={styles.texto} numberOfLines={1}>
        {fin
          ? `${veredicto(p)}: ${Math.round(p * 100)} % del tiempo en la zona`
          : empezado
            ? 'Mantén la aguja en la zona verde'
            : 'Toca Calentar para empezar el reloj.'}
      </Text>

      <View style={styles.cabecera}>
        <Text style={styles.tiempo}>{Math.ceil(restante)} s</Text>
        <Text style={styles.zonaTexto}>Zona: {ZONA.min}–{ZONA.max} °C</Text>
      </View>

      {/* Olla a la izquierda y termometro a la derecha, centrados: la olla se ve de reojo
          mientras se mira la aguja. */}
      <View style={styles.fila}>
        <OllaMaceracion temp={estado.temp} pulsos={pulsos} escala={escala} />
        <View style={[styles.termometro, { height: altoTermometro }]}>
          <View
            style={[
              styles.zona,
              { bottom: pos(ZONA.min, altoTermometro), height: pos(ZONA.max, altoTermometro) - pos(ZONA.min, altoTermometro) },
            ]}
          />
          <View style={[styles.aguja, { bottom: pos(estado.temp, altoTermometro) - AGUJA / 2 }, enZona && styles.agujaBien]} />
          <Text style={[styles.grados, { bottom: pos(estado.temp, altoTermometro) - 10 }]}>{Math.round(estado.temp)} °C</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Calentar"
        disabled={fin}
        onPressIn={tocar}
        style={({ pressed }) => [styles.boton, pressed && styles.botonPulsado, fin && styles.botonFin]}
      >
        <Text style={styles.botonTexto}>{fin ? 'Maceración terminada' : 'Calentar'}</Text>
      </Pressable>
    </View>
  );
}

const AGUJA = 26;

const styles = StyleSheet.create({
  raiz: { gap: space.sm },
  texto: { height: ALTO_TEXTO, lineHeight: ALTO_TEXTO, fontSize: 14, color: colors.inkSoft },
  zonaTexto: { fontSize: 14, color: colors.inkSoft },
  cabecera: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  // El margen derecho deja sitio a los grados, que se salen del carril del termometro.
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingRight: 64 },
  termometro: {
    width: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    // El texto de grados se sale a la derecha del carril.
    overflow: 'visible',
  },
  zona: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.green, opacity: 0.55, borderRadius: radius.sm },
  aguja: {
    position: 'absolute',
    left: 3,
    width: AGUJA,
    height: AGUJA,
    borderRadius: AGUJA / 2,
    backgroundColor: colors.stamp,
    borderWidth: 3,
    borderColor: colors.white,
  },
  agujaBien: { backgroundColor: colors.green },
  grados: { position: 'absolute', left: 44, fontSize: 16, fontWeight: '800', color: colors.ink, width: 70 },
  tiempo: { fontSize: 36, lineHeight: ALTO_TIEMPO, fontWeight: '800', color: colors.beerDark },
  boton: {
    height: ALTO_BOTON,
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
