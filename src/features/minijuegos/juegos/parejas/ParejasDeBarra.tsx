import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { colors, radius, space, typography } from '../../../../lib/theme';
import { Escudo } from '../../../casas/Escudo';
import type { IdCasa } from '../../../casas/casas';
import { feedback } from '../../feedback';
import type { PropsJuego } from '../../tipos';
import {
  avanzar,
  COLUMNAS,
  crearPartida,
  FILAS,
  formatearTiempo,
  ID_PAREJAS,
  nota,
  parejasEncontradas,
  tiempo,
  tocar,
  VOLTEO,
  type EstadoCarta,
  type Partida,
  type Simbolo,
} from './modelo';
import { ZonaCarta } from './ZonaCarta';

/** Hueco entre cartas (px). */
const HUECO = 8;
/** Ni en una tablet ni en un PC: una carta de 120 px ya se ve de sobra. */
const CARTA_MAX = 120;
/** Lo que se deja ver el tablero completo antes de pasar a la tarjeta de fin. */
const PAUSA_FIN_MS = 700;

const IMAGENES: Partial<Record<Simbolo, number>> = {
  pato: require('../../../../../assets/parejas/pato.png') as number,
  rxb: require('../../../../../assets/parejas/rxb.png') as number,
  jarra: require('../../../../../assets/parejas/jarra.png') as number,
  chapa: require('../../../../../assets/parejas/chapa.png') as number,
};

const NOMBRES: Record<Simbolo, string> = {
  mahou: 'Mahou',
  cruzcampo: 'Cruzcampo',
  estrella: 'Estrella Galicia',
  alhambra: 'Alhambra',
  pato: 'el pato',
  rxb: 'R por B',
  jarra: 'la jarra',
  chapa: 'la chapa',
};

const ESCUDOS: ReadonlySet<Simbolo> = new Set(['mahou', 'cruzcampo', 'estrella', 'alhambra']);

/** Segundos de un reloj que no salta hacia atras (el del sistema puede). */
function ahora(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

/** La cara de una carta. Los escudos son los de las casas, sin redibujar. */
function Cara({ simbolo, lado }: { simbolo: Simbolo; lado: number }) {
  if (ESCUDOS.has(simbolo)) return <Escudo casa={simbolo as IdCasa} tamano={Math.round(lado * 0.6)} />;
  return <Image source={IMAGENES[simbolo]} style={{ width: lado * 0.78, height: lado * 0.78 }} contentFit="contain" />;
}

/**
 * Una carta. El volteo es un "giro" de ancho (1 -> 0 -> 1) y a mitad cambia de
 * cara: lo mismo en web y en nativo, sin backfaceVisibility (que en web pinta
 * las dos caras a la vez en algunos navegadores). Dura VOLTEO, lo mismo que el
 * modelo bloquea los toques: lo que se ve y lo que cuenta van a la par. El toque
 * lo recoge ZonaCarta (en web no es un Pressable: ver ZonaCarta.web.tsx).
 */
const Carta = memo(function Carta({
  indice,
  simbolo,
  estado,
  lado,
  onTocar,
}: {
  indice: number;
  simbolo: Simbolo;
  estado: EstadoCarta;
  lado: number;
  onTocar: (i: number) => void;
}) {
  const bocaArriba = estado !== 'tapada';
  const [cara, setCara] = useState(bocaArriba);
  const giro = useRef(new Animated.Value(1)).current;
  // Si se desmonta a mitad del giro ("Otra vez", salir), el callback no toca nada.
  // Se pone a true AL MONTAR (y no solo al crear la ref): si se remonta, vuelve a valer.
  const montada = useRef(true);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);
  // La cara que toca AHORA, no la de cuando empezo el giro: si se vuelve a tocar la
  // carta mientras se tapa, el final del giro tiene que ensenar lo ultimo.
  const objetivo = useRef(bocaArriba);
  objetivo.current = bocaArriba;

  useEffect(() => {
    if (bocaArriba === cara) return;
    const nativo = Platform.OS !== 'web';
    Animated.timing(giro, { toValue: 0, duration: (VOLTEO * 1000) / 2, useNativeDriver: nativo }).start(() => {
      if (!montada.current) return;
      setCara(objetivo.current);
      Animated.timing(giro, { toValue: 1, duration: (VOLTEO * 1000) / 2, useNativeDriver: nativo }).start();
    });
  }, [bocaArriba, cara, giro]);

  const emparejada = estado === 'emparejada';
  return (
    <ZonaCarta
      testID={`carta-${indice}`}
      accessibilityLabel={`Carta ${indice + 1}, ${cara ? NOMBRES[simbolo] : 'boca abajo'}${emparejada ? ', emparejada' : ''}`}
      desactivada={bocaArriba}
      onTocar={() => onTocar(indice)}
      style={{ width: lado, height: lado }}
    >
      <Animated.View
        style={[
          styles.carta,
          cara ? styles.cartaCara : styles.cartaReverso,
          emparejada && cara ? styles.cartaEmparejada : null,
          { transform: [{ scaleX: giro }] },
        ]}
      >
        {cara ? (
          <Cara simbolo={simbolo} lado={lado} />
        ) : (
          <View style={[styles.reversoAro, { width: lado * 0.62, height: lado * 0.62, borderRadius: lado }]}>
            <View style={[styles.burbuja, { width: lado * 0.1, height: lado * 0.1, top: '22%', left: '24%' }]} />
            <View style={[styles.burbuja, { width: lado * 0.14, height: lado * 0.14, top: '50%', left: '58%' }]} />
            <View style={[styles.burbuja, { width: lado * 0.07, height: lado * 0.07, top: '70%', left: '34%' }]} />
          </View>
        )}
      </Animated.View>
    </ZonaCarta>
  );
});

export function ParejasDeBarra({ onFinish }: PropsJuego) {
  const [partida, setPartida] = useState<Partida>(() => crearPartida(Math.floor(Math.random() * 2 ** 32)));
  const [reloj, setReloj] = useState(0);
  const [hueco, setHueco] = useState<{ ancho: number; alto: number } | null>(null);
  const ref = useRef(partida);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;

  const aplicar = useCallback((p: Partida) => {
    ref.current = p;
    setPartida(p);
  }, []);

  const onTocar = useCallback(
    (i: number) => {
      const t = ahora();
      // Primero se tapa lo que ya tocaba taparse; luego el toque.
      const antes = avanzar(ref.current, t);
      const despues = tocar(antes, i, t);
      if (despues === antes) {
        // El toque no valia (carta girando, fallo a la vista, ya vista...).
        if (antes !== ref.current) aplicar(antes);
        return;
      }
      if (despues.intentos > antes.intentos) {
        if (despues.fallos > antes.fallos) feedback.fallo();
        else feedback.acierto();
      } else feedback.toque();
      aplicar(despues);
    },
    [aplicar],
  );

  // Tapar las dos de un fallo cuando toca.
  useEffect(() => {
    if (partida.taparEn === null) return undefined;
    const ms = Math.max(0, (partida.taparEn - ahora()) * 1000);
    const id = setTimeout(() => aplicar(avanzar(ref.current, ahora())), ms + 5);
    return () => clearTimeout(id);
  }, [partida.taparEn, aplicar]);

  // El reloj de arriba: corre desde el primer toque y se para al terminar.
  useEffect(() => {
    if (partida.inicio === null || partida.fin !== null) {
      setReloj(tiempo(ref.current, ahora()));
      return undefined;
    }
    let raf = 0;
    const paso = () => {
      setReloj(tiempo(ref.current, ahora()));
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [partida.inicio, partida.fin]);

  // Fin: se deja ver el tablero entero un momento y se entrega la nota.
  useEffect(() => {
    const final = nota(partida);
    if (final === null) return undefined;
    const id = setTimeout(() => {
      alAcabar.current({
        juego: ID_PAREJAS,
        puntuacion: final,
        detalles: { tiempo: final, intentos: partida.intentos, fallos: partida.fallos },
      });
    }, PAUSA_FIN_MS);
    return () => clearTimeout(id);
  }, [partida]);

  const medir = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Ignora lecturas de 0 (pantalla aun sin montar): encajarian cartas de 0 px.
    if (width > 0 && height > 0) setHueco({ ancho: Math.round(width), alto: Math.round(height) });
  }, []);

  const lado = hueco
    ? Math.floor(
        Math.min((hueco.ancho - HUECO * (COLUMNAS - 1)) / COLUMNAS, (hueco.alto - HUECO * (FILAS - 1)) / FILAS, CARTA_MAX),
      )
    : 0;

  return (
    <View style={styles.raiz}>
      <View style={styles.marcador}>
        <Text testID="reloj-parejas" style={styles.reloj} accessibilityLabel={`Tiempo: ${formatearTiempo(reloj)}`}>
          {formatearTiempo(reloj)}
        </Text>
        <Text style={styles.cuenta}>
          {parejasEncontradas(partida)}/8 · {partida.fallos} {partida.fallos === 1 ? 'fallo' : 'fallos'}
        </Text>
      </View>
      <Text style={[typography.muted, styles.pista]} numberOfLines={1}>
        {partida.inicio === null ? 'Toca una carta: el reloj arranca con el primer toque' : 'Encuentra las 8 parejas'}
      </Text>
      <View style={styles.hueco} onLayout={medir}>
        {lado > 0 ? (
          <View testID="tablero-parejas" style={[styles.tablero, { width: lado * COLUMNAS + HUECO * (COLUMNAS - 1) }]}>
            {partida.cartas.map((c, i) => (
              <Carta key={i} indice={i} simbolo={c.simbolo} estado={c.estado} lado={lado} onTocar={onTocar} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, gap: space.sm },
  marcador: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  reloj: { fontSize: 30, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  cuenta: { fontSize: 15, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  pista: { textAlign: 'center' },
  hueco: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  tablero: { flexDirection: 'row', flexWrap: 'wrap', gap: HUECO },
  carta: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cartaCara: { backgroundColor: colors.card, borderColor: colors.border },
  cartaEmparejada: { borderColor: colors.green, backgroundColor: '#EEF5EF' },
  cartaReverso: { backgroundColor: colors.beer, borderColor: colors.beerDark },
  reversoAro: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,253,248,0.75)' },
  burbuja: { position: 'absolute', borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.35)' },
});
