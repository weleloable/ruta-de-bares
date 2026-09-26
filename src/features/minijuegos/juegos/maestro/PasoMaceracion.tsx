import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, typography } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { avanzar, calentar, DURACION, INICIO, precision, TEMP_MAX, TEMP_MIN, terminado, ZONA, type Estado } from './maceracion';

const ALTO = 240;
const RANGO = TEMP_MAX - TEMP_MIN;
/** Cada cuantos segundos cambia el rumbo de la deriva: mas seguido seria un temblor, no una deriva. */
const CAMBIO_RUMBO = 0.6;
const DT_MAX = 0.05;

const pos = (temp: number) => ((temp - TEMP_MIN) / RANGO) * ALTO;

function veredicto(p: number): string {
  if (p < 0.4) return 'Agua tibia';
  if (p < 0.7) return 'Se deja beber';
  if (p < 0.9) return 'Buena maceración';
  return 'Maceración de maestro';
}

export function PasoMaceracion({ onTerminar }: { onTerminar: (precision: number) => void }) {
  const [estado, setEstado] = useState<Estado>(INICIO);
  const [empezado, setEmpezado] = useState(false);

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
    feedback.toque();
  };

  const fin = terminado(estado);
  const enZona = estado.temp >= ZONA.min && estado.temp <= ZONA.max;
  const restante = Math.max(DURACION - estado.t, 0);
  const p = precision(estado);

  return (
    <View style={styles.raiz}>
      <Text style={typography.muted}>
        {fin
          ? `${veredicto(p)}: ${Math.round(p * 100)} % del tiempo en la zona`
          : empezado
            ? 'Mantén la aguja en la zona verde'
            : 'Toca para calentar. El reloj empieza con el primer toque.'}
      </Text>

      <View style={styles.fila}>
        <View style={styles.termometro}>
          <View
            style={[
              styles.zona,
              { bottom: pos(ZONA.min), height: pos(ZONA.max) - pos(ZONA.min) },
            ]}
          />
          <View style={[styles.aguja, { bottom: pos(estado.temp) - AGUJA / 2 }, enZona && styles.agujaBien]} />
          <Text style={[styles.grados, { bottom: pos(estado.temp) - 10 }]}>{Math.round(estado.temp)} °C</Text>
        </View>
        <View style={styles.lateral}>
          <Text style={styles.tiempo}>{Math.ceil(restante)} s</Text>
          <Text style={typography.muted}>Zona: {ZONA.min}–{ZONA.max} °C</Text>
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
  raiz: { gap: space.md },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  termometro: {
    width: 32,
    height: ALTO,
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
  lateral: { gap: space.xs, minWidth: 120 },
  tiempo: { fontSize: 44, fontWeight: '800', color: colors.beerDark },
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
