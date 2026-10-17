import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, space } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import type { PropsJuego } from '../../tipos';
import {
  bebidaEnCurso,
  comandaActual,
  crearPartida,
  elegirBebida,
  empezar,
  ID_BARMAN,
  INGREDIENTES,
  masResistida,
  NOMBRE_BEBIDA,
  NOMBRE_INGREDIENTE,
  NOMBRE_LARGO_INGREDIENTE,
  pacienciaRestante,
  PEDIDOS,
  RECETAS,
  terminada,
  tocarIngrediente,
  totalTiradas,
  avanzar,
  multiplicadorActual,
  type Bebida,
  type Ingrediente,
  type Partida,
} from './modelo';
import { ALTO_CABECERA, ALTO_COLA, ALTO_COMANDA, HUECO, MARGEN, repartir } from './pantalla';
import { BARRA, BEBIDA, cliente, FONDO, INGREDIENTE } from './sprites';
import { PROPORCION_BEBIDA, PROPORCION_CLIENTE } from './spritesGeometria';
import { ToqueRapido } from './ToqueRapido';

/*
 * Barman Express: eres el camarero de un bar de Alcala en plena ruta. Aqui solo
 * se pinta y se llama al modelo (modelo.ts, puro y con tests). Vertical y a
 * pantalla completa: dentro del menu, a 740 px de alto, al juego le quedaban
 * ~328 px y no cabia. El reparto de la pantalla lo decide pantalla.ts.
 */

/** Cada cuanto se mira el reloj (paciencia que baja, clientes que se van). */
const PASO_RELOJ_MS = 100;
/** Lo que se ve un aviso ("+120", "¡A la basura!", "¡Se ha ido!"). */
const AVISO_MS = 900;
/** Lo que se ve "¡Se acabo el turno!" con la nota antes de pasar a la tarjeta de fin. */
const CIERRE_MS = 1500;

/** Segundos de un reloj que no salta hacia atras (el del sistema puede). */
function ahora(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

const semilla = () => Math.floor(Math.random() * 2 ** 32);

type Aviso = { texto: string; tono: 'bien' | 'mal'; n: number };

export function BarmanExpress({ onFinish, onSalir }: PropsJuego) {
  const insets = useSafeAreaInsets();
  const [partida, setPartida] = useState<Partida>(() => crearPartida(semilla()));
  const [jugando, setJugando] = useState(false);
  const [carta, setCarta] = useState(false);
  const [, setTic] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [hueco, setHueco] = useState<{ ancho: number; alto: number } | null>(null);
  const ref = useRef(partida);
  ref.current = partida;
  const avisado = useRef(false);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;
  // La bebida que se acaba de tirar, para verla caer a la basura.
  const [tirada, setTirada] = useState<{ bebida: Bebida; pasos: number; n: number } | null>(null);
  const caida = useRef(new Animated.Value(0)).current;

  const aplicar = useCallback((f: (p: Partida) => Partida) => {
    setPartida((p) => {
      const q = f(p);
      ref.current = q;
      return q;
    });
  }, []);

  // El reloj: la paciencia baja y, a cero, el cliente se va.
  useEffect(() => {
    if (!jugando) return undefined;
    const id = setInterval(() => {
      aplicar((p) => avanzar(p, ahora()));
      setTic((n) => n + 1);
    }, PASO_RELOJ_MS);
    return () => clearInterval(id);
  }, [jugando, aplicar]);

  // Lo que acaba de pasar: vibracion y aviso.
  const ultimoEvento = useRef(0);
  useEffect(() => {
    const e = partida.evento;
    if (!e || e.n === ultimoEvento.current) return undefined;
    ultimoEvento.current = e.n;
    let nuevo: Aviso | null = null;
    if (e.tipo === 'paso') feedback.toque();
    else if (e.tipo === 'entregada') feedback.acierto();
    else if (e.tipo === 'servido') {
      feedback.acierto();
      nuevo = { texto: `+${e.puntos}${e.propina > 0 ? ' con propina' : ''}`, tono: 'bien', n: e.n };
    } else if (e.tipo === 'tirada') {
      feedback.fallo();
      nuevo = { texto: '¡A la basura!', tono: 'mal', n: e.n };
    } else if (e.tipo === 'equivocado') {
      feedback.fallo();
      nuevo = { texto: '¡Ese no va primero!', tono: 'mal', n: e.n };
    } else if (e.tipo === 'enfadado') {
      feedback.fallo();
      nuevo = { texto: '¡Se ha ido sin lo suyo!', tono: 'mal', n: e.n };
    }
    if (nuevo) setAviso(nuevo);
  }, [partida.evento]);

  // El aviso se esconde solo, con su propio temporizador. Va aparte del efecto de
  // arriba: alli, un toque normal (que no da aviso) cancelaba el temporizador y
  // el "+120" se quedaba pegado en pantalla (lo cazo el critico).
  useEffect(() => {
    if (!aviso) return undefined;
    const id = setTimeout(() => setAviso((a) => (a && a.n === aviso.n ? null : a)), AVISO_MS);
    return () => clearTimeout(id);
  }, [aviso]);

  // Fin: se ve "se acabo el turno" con la nota un momento y se entrega, una sola vez.
  // Depende SOLO de si ha terminado (no de toda la partida): si el efecto se repitiera
  // por otro cambio, su limpieza cancelaria la entrega y no se entregaria nunca.
  const fin = terminada(partida);
  useEffect(() => {
    if (!fin || avisado.current) return undefined;
    avisado.current = true;
    setJugando(false);
    const id = setTimeout(() => {
      const p = ref.current;
      const resistida = masResistida(p);
      alAcabar.current({
        juego: ID_BARMAN,
        puntuacion: p.puntos,
        detalles: {
          servidos: p.servidos,
          mejorRacha: p.mejorRacha,
          tiradas: totalTiradas(p),
          resistida: resistida ? NOMBRE_BEBIDA[resistida] : '',
        },
      });
    }, CIERRE_MS);
    return () => clearTimeout(id);
  }, [fin]);

  const abrir = useCallback(() => {
    avisado.current = false;
    setPartida((p) => {
      const q = empezar(p, ahora());
      ref.current = q;
      return q;
    });
    setJugando(true);
  }, []);

  const tocar = useCallback(
    (ing: Ingrediente) => {
      const antes = ref.current;
      const i = bebidaEnCurso(antes);
      const c = comandaActual(antes);
      const t = ahora();
      const despues = tocarIngrediente(antes, ing, t);
      if (despues.evento?.tipo === 'tirada' && despues.evento.n !== antes.evento?.n && c && i !== null) {
        const bebida = c.bebidas[i] as Bebida;
        setTirada({ bebida, pasos: antes.hechos, n: despues.evento.n });
        caida.setValue(0);
        Animated.timing(caida, { toValue: 1, duration: 380, useNativeDriver: Platform.OS !== 'web' }).start(() =>
          setTirada((x) => (x && x.n === despues.evento?.n ? null : x)),
        );
      }
      ref.current = despues;
      setPartida(despues);
    },
    [caida],
  );

  const elegir = useCallback((i: number) => aplicar((p) => elegirBebida(p, i, ahora())), [aplicar]);

  const medir = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setHueco({ ancho: Math.round(width), alto: Math.round(height) });
  }, []);

  const r = hueco ? repartir(hueco.ancho, hueco.alto) : null;
  const c = comandaActual(partida);
  const enCurso = bebidaEnCurso(partida);
  const bebidaActual = c && enCurso !== null ? (c.bebidas[enCurso] as Bebida) : null;
  const restante = jugando ? pacienciaRestante(partida, ahora()) : 1;
  const colorPaciencia = restante > 0.5 ? colors.green : restante > 0.25 ? colors.beer : colors.stamp;

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Image source={FONDO} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.medida} onLayout={medir}>
        {r ? (
          <View style={[styles.columna, { width: r.ancho + 2 * MARGEN }]}>
            {/* Cabecera */}
            <View style={styles.cabecera}>
              {onSalir ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Salir del juego" onPress={onSalir} hitSlop={10} style={styles.circulo}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              ) : (
                <View style={styles.circuloHueco} />
              )}
              <View style={styles.marcador}>
                <Text style={styles.marcadorTexto} testID="barman-pedido">
                  Pedido {Math.min(partida.actual + 1, PEDIDOS)}/{PEDIDOS}
                </Text>
                <Text style={styles.puntos} testID="barman-puntos">
                  {partida.puntos}
                </Text>
                {multiplicadorActual(partida) > 4 ? (
                  // Lo que se llevaria este pedido si sale sin fallos (x1 si ya ha habido uno).
                  <Text style={styles.racha} testID="barman-racha">
                    ×{(multiplicadorActual(partida) / 4).toString().replace('.', ',')}
                  </Text>
                ) : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Ver la carta" onPress={() => setCarta((x) => !x)} hitSlop={10} style={styles.circulo}>
                <Ionicons name="book" size={20} color={colors.ink} />
              </Pressable>
            </View>

            {/* Cola: los dos siguientes, pequenos */}
            <View style={styles.cola}>
              <Text style={styles.colaTexto}>Siguen:</Text>
              {[1, 2].map((d) => {
                const sig = partida.comandas[partida.actual + d];
                return sig ? (
                  <Image key={d} source={cliente(sig.cliente)} style={styles.colaCliente} contentFit="contain" />
                ) : (
                  <View key={d} style={styles.colaCliente} />
                );
              })}
            </View>

            {/* El cliente actual, con su paciencia encima */}
            <View style={{ height: r.alturaCliente, alignItems: 'center', justifyContent: 'flex-end' }}>
              {c && !terminada(partida) ? (
                <>
                  <View style={styles.paciencia} accessibilityLabel={`Paciencia: ${Math.round(restante * 100)} %`}>
                    <View style={[styles.pacienciaRelleno, { width: `${Math.round(restante * 100)}%`, backgroundColor: colorPaciencia }]} />
                  </View>
                  <Image
                    source={cliente(c.cliente)}
                    style={{ height: r.alturaCliente - 18, aspectRatio: PROPORCION_CLIENTE }}
                    contentFit="contain"
                    contentPosition="bottom"
                  />
                </>
              ) : null}
              {aviso ? (
                <Text
                  style={[styles.aviso, aviso.tono === 'mal' ? styles.avisoMal : styles.avisoBien]}
                  testID="barman-aviso"
                  accessibilityLiveRegion="polite"
                >
                  {aviso.texto}
                </Text>
              ) : null}
            </View>

            {/* La comanda: cada bebida con un punto por paso */}
            <View style={styles.comanda} testID="barman-comanda">
              {c?.bebidas.map((b, i) => {
                const entregada = partida.entregadas[i] === true;
                const activa = enCurso === i && !entregada;
                const hechos = entregada ? RECETAS[b].length : activa ? partida.hechos : 0;
                return (
                  <ToqueRapido
                    key={i}
                    testID={`barman-bebida-${i}`}
                    accessibilityLabel={`${NOMBRE_BEBIDA[b]}${entregada ? ', servida' : activa ? `, preparando, paso ${hechos} de ${RECETAS[b].length}` : ''}`}
                    desactivado={entregada || (partida.hechos > 0 && !activa)}
                    onToque={() => elegir(i)}
                    style={[styles.ficha, activa && styles.fichaActiva, entregada && styles.fichaServida]}
                  >
                    <Image source={BEBIDA[b][RECETAS[b].length - 1]} style={styles.fichaDibujo} contentFit="contain" />
                    <View style={styles.fichaTextos}>
                      <Text style={[styles.fichaNombre, entregada && styles.tachado]} numberOfLines={1}>
                        {NOMBRE_BEBIDA[b]}
                      </Text>
                      <View style={styles.puntitos}>
                        {RECETAS[b].map((_, k) => (
                          <View key={k} style={[styles.puntito, k < hechos && styles.puntitoHecho]} />
                        ))}
                      </View>
                    </View>
                  </ToqueRapido>
                );
              })}
            </View>

            {/* La bebida que se prepara, sobre la barra */}
            <View style={{ height: r.alturaBebida, justifyContent: 'flex-end' }}>
              <Image source={BARRA} style={[styles.barra, { height: r.alturaBebida * 0.42 }]} contentFit="fill" />
              <View style={[StyleSheet.absoluteFill, styles.bebidaHueco, { bottom: r.alturaBebida * 0.3 }]}>
                {bebidaActual && partida.hechos > 0 ? (
                  <Image
                    testID="barman-preparando"
                    source={BEBIDA[bebidaActual][partida.hechos - 1]}
                    style={{ height: r.alturaBebida * 0.85, aspectRatio: PROPORCION_BEBIDA }}
                    contentFit="contain"
                    contentPosition="bottom"
                  />
                ) : null}
                {tirada && tirada.pasos > 0 ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      styles.bebidaHueco,
                      {
                        opacity: caida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                        transform: [
                          { translateY: caida.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
                          { rotate: caida.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '35deg'] }) },
                        ],
                      },
                    ]}
                  >
                    <Image
                      source={BEBIDA[tirada.bebida][tirada.pasos - 1]}
                      style={{ height: r.alturaBebida * 0.85, aspectRatio: PROPORCION_BEBIDA }}
                      contentFit="contain"
                      contentPosition="bottom"
                    />
                  </Animated.View>
                ) : null}
              </View>
            </View>

            {/* Los 12 ingredientes, SIEMPRE en el mismo sitio */}
            <View style={styles.rejilla} testID="barman-ingredientes">
              {INGREDIENTES.map((ing) => (
                <ToqueRapido
                  key={ing}
                  testID={`barman-ing-${ing}`}
                  accessibilityLabel={NOMBRE_LARGO_INGREDIENTE[ing]}
                  desactivado={!jugando}
                  onToque={() => tocar(ing)}
                  style={[styles.ingrediente, { width: r.botonAncho, height: r.botonAlto }]}
                >
                  <Image source={INGREDIENTE[ing]} style={{ width: r.icono, height: r.icono }} contentFit="contain" />
                  <Text style={styles.ingredienteNombre} numberOfLines={1}>
                    {NOMBRE_INGREDIENTE[ing]}
                  </Text>
                </ToqueRapido>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {carta && jugando ? <Carta onCerrar={() => setCarta(false)} /> : null}
      {!jugando && !terminada(partida) ? <Inicio onAbrir={abrir} /> : null}
      {terminada(partida) ? (
        <View style={styles.capa} pointerEvents="none">
          <View style={styles.tarjeta} testID="barman-cierre">
            <Text style={styles.tarjetaTitulo}>¡Se acabó el turno!</Text>
            <Text style={styles.cierrePuntos} testID="barman-nota-final">
              {partida.puntos}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Las recetas. Se puede mirar en cualquier momento, pero el reloj no para. */
function Carta({ onCerrar }: { onCerrar(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar la carta" onPress={onCerrar} style={styles.capa}>
      <View style={styles.tarjeta} testID="barman-carta">
        <Text style={styles.tarjetaTitulo}>La carta</Text>
        <Recetas />
        <Text style={styles.tarjetaPie}>El reloj no se para. Toca para cerrar.</Text>
      </View>
    </Pressable>
  );
}

function Recetas() {
  return (
    <View style={styles.recetas}>
      {(Object.keys(RECETAS) as Bebida[]).map((b) => (
        <Text key={b} style={styles.receta}>
          <Text style={styles.recetaNombre}>{NOMBRE_BEBIDA[b]}: </Text>
          {RECETAS[b].map((i) => NOMBRE_LARGO_INGREDIENTE[i].toLowerCase()).join(' → ')}
        </Text>
      ))}
    </View>
  );
}

function Inicio({ onAbrir }: { onAbrir(): void }) {
  return (
    <View style={styles.capa}>
      <View style={styles.tarjeta} testID="barman-inicio">
        <Text style={styles.tarjetaTitulo}>Barman Express</Text>
        <Text style={styles.tarjetaTexto}>
          20 clientes con sed. Toca los ingredientes en orden para preparar cada bebida, en el orden que quieras: lo que
          echas en el vaso decide qué bebida es. Si te equivocas con algo ya en el vaso, va a la basura. Sirve rápido para
          llevarte propina, y que no se te vaya nadie.
        </Text>
        <Recetas />
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir la barra" onPress={onAbrir} style={styles.botonAbrir}>
          <Text style={styles.botonAbrirTexto}>Abrir la barra</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#2a1810' },
  medida: { flex: 1, alignItems: 'center' },
  columna: { flex: 1, paddingHorizontal: MARGEN, paddingTop: HUECO, gap: HUECO },
  cabecera: { height: ALTO_CABECERA, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 44 px: lo minimo comodo para un dedo (en web el hitSlop no agranda nada).
  circulo: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246, 239, 226, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circuloHueco: { width: 44, height: 44 },
  marcador: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  marcadorTexto: { color: colors.paper, fontSize: 14, fontWeight: '700' },
  puntos: { color: colors.paper, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  racha: { color: '#ffd27a', fontSize: 15, fontWeight: '900' },
  cola: { height: ALTO_COLA, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  colaTexto: { color: colors.paper, fontSize: 13, fontWeight: '700' },
  colaCliente: { width: 44, height: ALTO_COLA, opacity: 0.85 },
  paciencia: {
    width: '60%',
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(36, 26, 18, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(246, 239, 226, 0.7)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  pacienciaRelleno: { height: '100%', borderRadius: radius.pill },
  aviso: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    fontSize: 20,
    fontWeight: '900',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  avisoBien: { backgroundColor: colors.green, color: colors.white },
  avisoMal: { backgroundColor: colors.stamp, color: colors.white },
  comanda: {
    height: ALTO_COMANDA,
    flexDirection: 'row',
    gap: space.xs,
    backgroundColor: 'rgba(255, 253, 248, 0.95)',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.beerDark,
    padding: space.xs,
  },
  ficha: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.sm, paddingHorizontal: 2 },
  fichaActiva: { backgroundColor: colors.beerSoft, borderWidth: 2, borderColor: colors.beer },
  fichaServida: { opacity: 0.45 },
  fichaDibujo: { width: 30, height: 40 },
  fichaTextos: { flex: 1, minWidth: 0, gap: 4 },
  fichaNombre: { fontSize: 12, fontWeight: '800', color: colors.ink },
  tachado: { textDecorationLine: 'line-through' },
  puntitos: { flexDirection: 'row', gap: 3 },
  puntito: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  puntitoHecho: { backgroundColor: colors.green },
  barra: { width: '100%' },
  bebidaHueco: { alignItems: 'center', justifyContent: 'flex-end' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: HUECO },
  ingrediente: {
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.beerDark,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  ingredienteNombre: { fontSize: 10, fontWeight: '700', color: colors.ink },
  capa: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20, 10, 5, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.beerDark,
    padding: space.lg,
    gap: space.md,
  },
  tarjetaTitulo: { fontFamily: fonts.title, fontSize: 26, fontWeight: '900', color: colors.beerDark },
  tarjetaTexto: { fontSize: 15, lineHeight: 21, color: colors.ink },
  tarjetaPie: { fontSize: 12, color: colors.inkSoft },
  recetas: { gap: 4 },
  receta: { fontSize: 13, lineHeight: 18, color: colors.ink },
  recetaNombre: { fontWeight: '800' },
  botonAbrir: { backgroundColor: colors.beer, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  botonAbrirTexto: { color: colors.white, fontSize: 17, fontWeight: '800' },
  cierrePuntos: { fontSize: 48, fontWeight: '900', color: colors.beerDark, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
