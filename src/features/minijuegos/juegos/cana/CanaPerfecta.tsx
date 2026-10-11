import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import { BotonMantener } from '../../BotonMantener';
import { EscenaCana } from './EscenaCana';
import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { textoMotivo } from './inclinacion';
import { SelectorAngulo } from './SelectorAngulo';
import { useTecladoCana } from './teclado';
import { useInclinacion } from './useInclinacion';
import {
  avanzar,
  derrameTotal,
  DERRAME_MAX,
  ESTADO_VACIO,
  estaLleno,
  haDerramado,
  puntuar,
  total,
  type Estado,
} from './modelo';

/** Alto de la franja del deslizador / boton "Usar deslizador" (ver `control`). */
const ALTO_CONTROL = 96;
/** Lo que tarda el tirador en abrirse o cerrarse (constante de tiempo, s): se ve el gesto, no un salto. */
const TAU_PALANCA = 0.07;
/** Un fotograma largo (pestana en segundo plano) no debe llenar el vaso de golpe. */
const DT_MAX = 0.05;

export function CanaPerfecta({ onFinish }: PropsJuego) {
  const [estado, setEstado] = useState<Estado>(ESTADO_VACIO);
  const [sirviendo, setSirviendo] = useState(false);
  const [inclinado, setInclinado] = useState(0);
  // Solo para el dibujo: el tirador moviendose y el reloj de las burbujas y el chorro.
  const [animacion, setAnimacion] = useState({ palanca: 0, tiempo: 0 });
  const palancaRef = useRef(0);
  const tiempoRef = useRef(0);
  const { modo, motivo, objetivo, giro, avanzarGiro, empezar, usarManual, fijar } = useInclinacion();

  // Refs para el bucle: leer el estado de React dentro de rAF leeria uno viejo.
  const estadoRef = useRef<Estado>(ESTADO_VACIO);
  const sirviendoRef = useRef(false);
  const inicioRef = useRef<number | null>(null);
  const acabadoRef = useRef(false);
  const derramoRef = useRef(false);

  const terminar = useCallback(
    (seDesbordo: boolean) => {
      if (acabadoRef.current) return;
      acabadoRef.current = true;
      sirviendoRef.current = false;
      setSirviendo(false);
      const segundos = inicioRef.current === null ? 0 : (Date.now() - inicioRef.current) / 1000;
      const d = puntuar(estadoRef.current, segundos);
      onFinish({
        juego: 'cana-perfecta',
        puntuacion: d.total,
        detalles: {
          nivel: d.nivel,
          espuma: d.espuma,
          rapidez: d.rapidez,
          penalizacion: d.penalizacion,
          derramado: Math.round(estadoRef.current.derramado * 100),
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
      const dt = pasoDeTiempo(ahora, ultimo, DT_MAX);
      ultimo = ahora;
      if (!acabadoRef.current) {
        // El giro se acerca al sensor segun el tiempo (filtrado); lo que se dibuja y lo
        // que ve el modelo es ese valor ya suave. El modelo solo mira cuanto, no hacia donde.
        avanzarGiro(dt);
        estadoRef.current = avanzar(estadoRef.current, dt, sirviendoRef.current, Math.abs(giro.current));
        setEstado(estadoRef.current);
        setInclinado(giro.current);
        palancaRef.current += ((sirviendoRef.current ? 1 : 0) - palancaRef.current) * (1 - Math.exp(-dt / TAU_PALANCA));
        tiempoRef.current += dt;
        setAnimacion({ palanca: palancaRef.current, tiempo: tiempoRef.current });
        // Una sola vibracion al empezar a derramar, no una por fotograma.
        if (haDerramado(estadoRef.current) && !derramoRef.current) {
          derramoRef.current = true;
          feedback.fallo();
        }
        if (derrameTotal(estadoRef.current)) terminar(true);
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, [terminar, giro, avanzarGiro]);

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
    { abrir, cerrar, ajustar: (delta) => modo === 'manual' && fijar(Math.abs(objetivo.current) + delta) },
    modo !== 'inicio',
  );

  const haServido = inicioRef.current !== null;
  const derramando = sirviendo && estaLleno(estado);

  return (
    <View style={styles.raiz}>
      <View style={styles.escenario}>
        {derramando ? (
          <Text style={[styles.aviso, styles.avisoDerrame]}>¡Se está derramando! Suelta</Text>
        ) : (
          <Text style={[typography.muted, styles.aviso]}>
            {haDerramado(estado) ? 'Has derramado, pierdes puntos' : 'Llénalo hasta arriba, sin derramar'}
          </Text>
        )}
        {/* Con el signo del sensor: inclinas el movil a la derecha y la jarra a la derecha. */}
        <EscenaCana
          inclinado={inclinado}
          palanca={animacion.palanca}
          tiempo={animacion.tiempo}
          liquido={estado.liquido}
          espuma={estado.espuma}
          sirviendo={sirviendo}
          derramando={derramando}
          derramado={haDerramado(estado) ? estado.derramado / DERRAME_MAX : 0}
        />
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
          {/* Alto FIJO: el juego pasa del sensor al deslizador solo (si el sensor no da
              lecturas) y, si esta franja cambiase de alto, el boton de servir se moveria
              bajo el dedo y se soltaria. */}
          <View style={styles.control}>
            {modo === 'manual' ? (
              <>
                <SelectorAngulo valor={Math.abs(inclinado)} onChange={fijar} />
                {/* Por que no va el sensor: sin decirlo, parece un fallo del juego. */}
                {textoMotivo(motivo) ? (
                  <Text style={styles.motivo} numberOfLines={1}>
                    {textoMotivo(motivo)}
                  </Text>
                ) : null}
              </>
            ) : (
              // Funcion y no `onPress={usarManual}`: si no, el evento del toque llegaria como el motivo.
              <Button title="Usar deslizador" variant="ghost" onPress={() => usarManual()} />
            )}
          </View>
          {/* No es un Pressable: ver BotonMantener (dos dedos, gestos del navegador). */}
          <BotonMantener
            accessibilityLabel="Mantén pulsado para servir cerveza"
            onApretar={abrir}
            onSoltar={cerrar}
            style={styles.servir}
            estiloPulsado={styles.servirPulsado}
          >
            <Text style={styles.servirTexto}>{sirviendo ? 'Sirviendo…' : 'Mantén para servir'}</Text>
          </BotonMantener>
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
  // Lo que mide el deslizador (texto + zona de toque de 52 + el motivo): con el boton "Usar deslizador" se reserva igual.
  control: { height: ALTO_CONTROL, justifyContent: 'center' },
  motivo: { fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
  raiz: { flex: 1, gap: space.md, justifyContent: 'flex-end' },
  escenario: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: space.sm },
  aviso: { textAlign: 'center', minHeight: 24 },
  avisoDerrame: { fontSize: 18, fontWeight: '800', color: colors.danger },
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
