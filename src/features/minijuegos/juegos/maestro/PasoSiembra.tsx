import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { colors, radius, space } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import { LEVADURAS, type LevaduraId } from './datos';
import { escalaOlla } from './maceracion';
import { ALTO_OLLA, OllaMaceracion } from './OllaMaceracion';
import {
  avanzar,
  inerciaRestante,
  INICIO,
  precision,
  sembrar,
  suerte,
  TEMP_MAX,
  TEMP_MIN,
  terminado,
  TIEMPO_MAX,
  VENTANAS,
  type Estado,
  type Suerte,
} from './siembra';
import { Termometro } from './Termometro';

const DT_MAX = 0.05;

// Como en la maceracion y el hervido: el paso cabe en la pantalla SIN scroll.
// Altos fijos para todo menos la olla y el termometro, que se encogen juntos.
const ALTO_TEXTO = 24;
const ALTO_LEVADURAS = 48;
const ALTO_ETIQUETA = 22;
const ALTO_BOTON = 64;
const HUECOS = 3;
/** Lo que mide de mas de lo que suman las franjas, como en la maceracion (medido con `npm run verificar:juego`). */
const HOLGURA = 12;
/** Todo lo del paso menos la olla y el termometro: lo que entra en la cuenta de `escalaOlla`. */
export const ALTO_RESTO_PASO = ALTO_TEXTO + ALTO_LEVADURAS + ALTO_ETIQUETA + ALTO_BOTON + HUECOS * space.sm + HOLGURA;

/** Lo que se dice al sembrar, segun como le fue a la levadura. */
const DICHO: Record<Suerte, string> = {
  perfecta: '¡Levadura feliz!',
  estresada: 'Algo caliente: se estresa',
  dormida: 'Demasiado fría: arranca a medias',
  muerta: '¡Mosto caliente: la levadura ha muerto!',
};

/**
 * Paso 4: elegir la levadura, enfriar el mosto y echarla a su temperatura
 * (logica en siembra.ts). Mientras se mantiene pulsado "Enfriar" corre el agua
 * fria por el serpentin; al soltar, el mosto aun baja un poco (inercia). "Echar
 * levadura" es un solo disparo.
 *
 * La levadura se elige aqui mismo y se BLOQUEA al empezar a enfriar: cada una
 * tiene su ventana, y cambiarla a mitad seria cambiar de juego.
 */
export function PasoSiembra({
  levadura,
  onElegirLevadura,
  onEmpezar,
  onTerminar,
}: {
  levadura: LevaduraId | null;
  onElegirLevadura: (l: LevaduraId) => void;
  /** Al abrir el grifo la primera vez: lo sembrado en una partida anterior (volviendo con Atras) deja de valer. */
  onEmpezar: () => void;
  onTerminar: (precision: number) => void;
}) {
  const [estado, setEstado] = useState<Estado>(INICIO);
  const [empezado, setEmpezado] = useState(false);
  const [grifo, setGrifo] = useState(false);

  const estadoRef = useRef<Estado>(INICIO);
  const empezadoRef = useRef(false);
  const grifoRef = useRef(false);
  const avisadoRef = useRef(false);
  const levaduraRef = useRef(levadura);
  levaduraRef.current = levadura;
  const alTerminar = useRef(onTerminar);
  alTerminar.current = onTerminar;

  const { height: altoVentana } = useWindowDimensions();
  const escala = escalaOlla(altoVentana, ALTO_RESTO_PASO, ALTO_OLLA);

  const avisar = (e: Estado) => {
    if (avisadoRef.current || !terminado(e) || !levaduraRef.current) return;
    avisadoRef.current = true;
    const p = precision(e, levaduraRef.current);
    if (p >= 0.5) feedback.acierto();
    else feedback.fallo();
    alTerminar.current(Math.round(p * 100) / 100);
  };

  useEffect(() => {
    let raf = 0;
    let ultimo = Date.now();
    const bucle = () => {
      const ahora = Date.now();
      const dt = pasoDeTiempo(ahora, ultimo, DT_MAX);
      ultimo = ahora;
      // El reloj y el enfriamiento no corren hasta abrir el grifo la primera vez.
      if (empezadoRef.current && !terminado(estadoRef.current)) {
        estadoRef.current = avanzar(estadoRef.current, dt, grifoRef.current);
        setEstado(estadoRef.current);
        // Si se acabo el tiempo con el dedo puesto, el boton ya esta deshabilitado
        // y puede que no llegue el "soltar": se cierra el grifo aqui.
        if (terminado(estadoRef.current) && grifoRef.current) {
          grifoRef.current = false;
          setGrifo(false);
        }
        // Si se agota el tiempo se echa sola: tambien hay que avisar.
        avisar(estadoRef.current);
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
    // `avisar` solo lee refs: no hace falta repetir el efecto.
  }, []);

  const abrirGrifo = () => {
    if (!levaduraRef.current || terminado(estadoRef.current)) return;
    if (!empezadoRef.current) {
      empezadoRef.current = true;
      setEmpezado(true);
      onEmpezar();
    }
    grifoRef.current = true;
    setGrifo(true);
    feedback.toque();
  };
  const cerrarGrifo = () => {
    grifoRef.current = false;
    setGrifo(false);
  };
  const echar = () => {
    if (!levaduraRef.current || !empezadoRef.current || terminado(estadoRef.current)) return;
    grifoRef.current = false;
    setGrifo(false);
    estadoRef.current = sembrar(estadoRef.current);
    setEstado(estadoRef.current);
    avisar(estadoRef.current);
  };

  const fin = terminado(estado);
  const ventana = levadura ? VENTANAS[levadura] : null;
  const vivo = fin && levadura ? ['perfecta', 'estresada'].includes(suerte(estado.sembradaA!, levadura)) : false;

  let texto: string;
  if (!levadura || !ventana) texto = 'Elige la levadura: cada una se siembra a su temperatura.';
  else if (fin) {
    const s = suerte(estado.sembradaA!, levadura);
    texto = `${estado.sola ? 'Se acabó el tiempo. ' : ''}${DICHO[s]} · ${Math.round(precision(estado, levadura) * 100)} %`;
  } else if (!empezado) texto = `Enfría hasta ${ventana.min}–${ventana.max} °C y echa la levadura.`;
  // La pista que enseña la inercia: si soltando ahora ya llega, hay que soltar.
  else if (grifo && estado.temp - inerciaRestante(estado) <= ventana.max) texto = '¡Suelta! El mosto sigue enfriando.';
  else texto = `Mantén para enfriar · ${Math.ceil(TIEMPO_MAX - estado.t)} s`;

  return (
    <View style={styles.raiz}>
      <Text style={[styles.texto, fin && styles.textoFin]} numberOfLines={1}>
        {texto}
      </Text>

      <View style={styles.levaduras}>
        {LEVADURAS.map((l) => {
          const elegida = levadura === l.id;
          const v = VENTANAS[l.id];
          return (
            <Pressable
              key={l.id}
              accessibilityRole="button"
              accessibilityState={{ selected: elegida, disabled: empezado }}
              accessibilityLabel={`${l.nombre}. ${l.descripcion}. Se siembra a ${v.min}–${v.max} grados`}
              disabled={empezado}
              onPress={() => onElegirLevadura(l.id)}
              style={[styles.levadura, elegida && styles.levaduraElegida, empezado && !elegida && styles.levaduraApagada]}
            >
              <Text style={styles.levaduraNombre}>{l.nombre}</Text>
              <Text style={styles.levaduraTemp}>
                {v.min}–{v.max} °C
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.fila}>
        <OllaMaceracion
          temp={estado.temp}
          pulsos={0}
          escala={escala}
          zona={ventana ?? VENTANAS.ale}
          fuego={false}
          enfriando={grifo}
          // Antes de sembrar no hay fermentacion; despues, solo si la levadura sigue viva.
          burbujas={vivo}
        />
        <Termometro
          temp={estado.temp}
          min={TEMP_MIN}
          max={TEMP_MAX}
          zona={ventana ?? VENTANAS.ale}
          alto={ALTO_OLLA * escala}
        />
      </View>

      <View style={styles.botones}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enfriar"
          accessibilityHint="Mantén pulsado para que corra el agua fría"
          disabled={!levadura || fin}
          onPressIn={abrirGrifo}
          onPressOut={cerrarGrifo}
          style={[styles.boton, styles.botonFrio, grifo && styles.botonFrioPulsado, (!levadura || fin) && styles.botonApagado]}
        >
          <Text style={styles.botonTexto}>{grifo ? 'Enfriando…' : 'Mantén para enfriar'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Echar levadura"
          disabled={!empezado || fin}
          onPressIn={echar}
          style={({ pressed }) => [
            styles.boton,
            styles.botonEchar,
            pressed && styles.botonEcharPulsado,
            (!empezado || fin) && styles.botonApagado,
          ]}
        >
          <Text style={styles.botonTexto}>{fin ? 'Sembrada' : '¡Echar levadura!'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { gap: space.sm },
  texto: { height: ALTO_TEXTO, lineHeight: ALTO_TEXTO, fontSize: 14, color: colors.inkSoft, textAlign: 'center' },
  textoFin: { fontSize: 16, fontWeight: '800', color: colors.beerDark },
  levaduras: { flexDirection: 'row', gap: space.sm, height: ALTO_LEVADURAS },
  levadura: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levaduraElegida: { borderColor: colors.beer, backgroundColor: colors.beerSoft },
  levaduraApagada: { opacity: 0.4 },
  levaduraNombre: { fontSize: 16, fontWeight: '800', color: colors.ink },
  levaduraTemp: { fontSize: 13, color: colors.inkSoft },
  // El margen derecho deja sitio a los grados, que se salen del carril del termometro.
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingRight: 64 },
  botones: { flexDirection: 'row', gap: space.sm, height: ALTO_BOTON },
  boton: { flex: 1, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  botonFrio: { backgroundColor: '#3E78A8', borderColor: '#2F5F87' },
  botonFrioPulsado: { backgroundColor: '#2F5F87' },
  botonEchar: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  botonEcharPulsado: { backgroundColor: colors.beerDark },
  botonApagado: { opacity: 0.45 },
  botonTexto: { fontSize: 17, fontWeight: '800', color: colors.white, textAlign: 'center' },
});
