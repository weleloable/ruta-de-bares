import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../../components/ui';
import { colors, radius, space } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { formatearNota } from '../../nota';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { textoMotivo } from '../cana/inclinacion';
import { useTecladoCana } from '../cana/teclado';
import { useInclinacion } from '../cana/useInclinacion';
import { camara as camaraDe, obstaculos as obstaculosDe, proyectar, HORIZONTE } from './escena';
import {
  anguloBandeja,
  avanzar,
  AVISO_EMPUJON,
  AVISO_ESQUIVA,
  bebidaMasDificil,
  bebidasTiradas,
  BEBIDAS,
  crearRecorrido,
  empuje,
  fraccionSalvada,
  ID_PULSO,
  NIVEL_TIRADA,
  nuevaRonda,
  NOMBRE_BEBIDA,
  notaPartida,
  puntosRonda,
  RONDAS,
  TAU_GIRO_PULSO,
  type EstadoRonda,
  type Recorrido,
  type ResultadoRonda,
} from './modelo';
import { colocarBebidas, INCLINACION_DIBUJO, MARGEN, repartir, type Reparto } from './pantalla';
import { SelectorGiro, GIRO_MAX_DESLIZADOR } from './SelectorGiro';
import { BANDEJA, BEBIDA, CHARCO, cliente, FONDO, GOTA, MESA, SUELO, TABURETE } from './sprites';
import { ESCENA_ANCHO, FONDO_ALTO, INTERIOR, PROPORCION_CLIENTE, PROPORCION_MESA, PROPORCION_TABURETE, SUELO_ALTO } from './spritesGeometria';

/*
 * APARTA!!! (antes Pulso de Camarero; el id sigue siendo `pulso-de-camarero`): cruzas un bar lleno con una bandeja de bebidas, visto desde
 * los ojos del camarero. Aqui solo se pinta y se llama al modelo (modelo.ts, puro
 * y con tests). Vertical y a pantalla completa: dentro del menu, a 740 px de
 * alto, quedaban ~328 px y no cabian el bar y la bandeja. El reparto de la
 * pantalla lo decide pantalla.ts y la perspectiva, escena.ts.
 *
 * El jugador solo controla el giro del movil (el sensor y el deslizador de
 * respaldo son los de La Caña); la ronda es una partida a pasos fijos que se
 * alimenta con el tiempo real de cada fotograma, asi que va igual a 30 que a 144
 * fps. Si la app pasa a segundo plano a mitad de una ronda, el reloj se para.
 */

type Fase = 'inicio' | 'cuenta' | 'ronda' | 'entre' | 'fin';

const CUENTA_S = 3;
const ENTRE_S = 2.6;
const FIN_S = 1.6;
/** Un fotograma largo (la pestana se queda en segundo plano) no debe adelantar la ronda de golpe. */
const DT_MAX = 0.05;
const AVISOS = { esquiva: AVISO_ESQUIVA, empujon: AVISO_EMPUJON };

const NOMBRE_RONDA = ['Calentamiento', 'Copas y empujones', 'Botella y giros en S'];

/**
 * MILISEGUNDOS de un reloj que no salta hacia atras (el del sistema puede). Son milisegundos porque
 * `pasoDeTiempo` (reloj.ts) los espera asi y los divide por 1000: con segundos, `dt` salia mil veces
 * mas pequeno y la cuenta atras se quedaba en 3 (lo cazo el usuario al jugar; lo vigila
 * tests/pulso-cableado.test.ts y `verificar:juego`).
 */
function ahoraMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const semilla = () => Math.floor(Math.random() * 2 ** 32);
const limitar = (x: number, m: number) => Math.min(Math.max(x, -m), m);

export function PulsoDeCamarero({ onFinish, onSalir }: PropsJuego) {
  const insets = useSafeAreaInsets();
  const [fase, setFaseEstado] = useState<Fase>('inicio');
  const faseRef = useRef<Fase>('inicio');
  const [ronda, setRonda] = useState(0);
  const [, setTic] = useState(0);
  const [hueco, setHueco] = useState<{ ancho: number; alto: number } | null>(null);
  const [pausado, setPausado] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const pausadoRef = useRef(false);
  const { modo, motivo, giro, avanzarGiro, empezar, usarManual, fijar, fijarConSigno, objetivo } = useInclinacion();

  const semillaPartida = useRef(semilla());
  const rec = useRef<Recorrido>(crearRecorrido(0, semillaPartida.current));
  const estado = useRef<EstadoRonda>(nuevaRonda(0));
  const cuenta = useRef(CUENTA_S);
  const espera = useRef(0);
  const resultados = useRef<ResultadoRonda[]>([]);
  const puntos = useRef<number[]>([]);
  const empujonesSonados = useRef(0);
  const caidasSonadas = useRef(0);
  const entregado = useRef(false);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;
  const tiempoDibujo = useRef(0);

  const irA = useCallback((f: Fase) => {
    faseRef.current = f;
    setFaseEstado(f);
  }, []);

  const prepararRonda = useCallback(
    (r: number) => {
      rec.current = crearRecorrido(r, semillaPartida.current);
      estado.current = nuevaRonda(r);
      cuenta.current = CUENTA_S;
      empujonesSonados.current = 0;
      caidasSonadas.current = 0;
      setRonda(r);
      irA('cuenta');
    },
    [irA],
  );

  const pausar = useCallback((p: boolean) => {
    pausadoRef.current = p;
    setPausado(p);
  }, []);

  // El bucle: un fotograma, un trozo de tiempo real. La app pasa a segundo plano -> pausa.
  useEffect(() => {
    let raf = 0;
    let ultimo = ahoraMs();
    const bucle = () => {
      const t = ahoraMs();
      const dt = pasoDeTiempo(t, ultimo, DT_MAX);
      ultimo = t;
      const f = faseRef.current;
      if (!pausadoRef.current) {
        // El giro del movil se acerca al sensor segun el TIEMPO (filtrado), tambien en la cuenta atras:
        // asi se ve como responde la bandeja antes de que empiece la ronda.
        avanzarGiro(dt, TAU_GIRO_PULSO);
        tiempoDibujo.current += dt;
        if (f === 'cuenta') {
          cuenta.current -= dt;
          if (cuenta.current <= 0) irA('ronda');
        } else if (f === 'ronda') {
          const e = estado.current;
          avanzar(e, rec.current, dt, () => giro.current);
          // Un empujon que acaba de llegar: una sacudida corta en la mano.
          const llegados = rec.current.empujones.filter((x) => x.t <= e.t).length;
          if (llegados > empujonesSonados.current) {
            empujonesSonados.current = llegados;
            feedback.toque();
          }
          const caidas = e.caidas.filter(Boolean).length;
          if (caidas > caidasSonadas.current) {
            caidasSonadas.current = caidas;
            feedback.fallo();
          }
          if (e.terminada) {
            const r = e.ronda;
            resultados.current.push({ ronda: r, niveles: [...e.niveles], caidas: [...e.caidas] });
            puntos.current.push(puntosRonda(r, e.niveles));
            if (r < RONDAS.length - 1) {
              espera.current = ENTRE_S;
              irA('entre');
            } else {
              espera.current = FIN_S;
              irA('fin');
            }
          }
        } else if (f === 'entre') {
          espera.current -= dt;
          if (espera.current <= 0) prepararRonda(estado.current.ronda + 1);
        } else if (f === 'fin') {
          espera.current -= dt;
          if (espera.current <= 0 && !entregado.current) {
            entregado.current = true;
            const rondas = resultados.current;
            const dificil = bebidaMasDificil(rondas);
            alAcabar.current({
              juego: ID_PULSO,
              puntuacion: notaPartida(puntos.current),
              detalles: {
                ronda1: Math.round(fraccionSalvada(0, (rondas[0] as ResultadoRonda).niveles) * 1000) / 10,
                ronda2: Math.round(fraccionSalvada(1, (rondas[1] as ResultadoRonda).niveles) * 1000) / 10,
                ronda3: Math.round(fraccionSalvada(2, (rondas[2] as ResultadoRonda).niveles) * 1000) / 10,
                dificil: dificil ? NOMBRE_BEBIDA[dificil] : '',
                tiradas: bebidasTiradas(rondas),
              },
            });
          }
        }
        setTic((n) => (n + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && (faseRef.current === 'cuenta' || faseRef.current === 'ronda')) pausar(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      sub.remove();
    };
  }, [avanzarGiro, giro, irA, pausar, prepararRonda]);

  // Teclado (PC): flechas inclinan el "movil" del deslizador, a pasos. Espacio no hace nada aqui.
  useTecladoCana(
    {
      abrir: () => undefined,
      cerrar: () => undefined,
      ajustar: (delta) => modo === 'manual' && fijarConSigno(limitar(objetivo.current + delta, GIRO_MAX_DESLIZADOR)),
    },
    modo !== 'inicio',
  );

  const medir = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setHueco({ ancho: Math.round(width), alto: Math.round(height) });
  }, []);

  const empezarJuego = useCallback(() => {
    void empezar();
    prepararRonda(0);
  }, [empezar, prepararRonda]);

  const pedirSalir = useCallback(() => {
    pausar(true);
    setSaliendo(true);
  }, [pausar]);

  const r = hueco ? repartir(hueco.ancho, hueco.alto) : null;
  const e = estado.current;
  const recorrido = rec.current;
  const config = RONDAS[ronda] as (typeof RONDAS)[number];
  const empujeAhora = fase === 'ronda' || fase === 'entre' || fase === 'fin' ? empuje(recorrido, e.t) : 0;
  const angulo = limitar(anguloBandeja(fase === 'ronda' ? empujeAhora : 0, giro.current), INCLINACION_DIBUJO);
  const liquido = Math.round(fraccionSalvada(ronda, e.niveles) * 100);
  const progreso = Math.min(e.t / config.duracion, 1);

  return (
    <View style={[styles.raiz, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }]} testID="pulso-raiz">
      <View style={styles.medida} onLayout={medir}>
        {r ? (
          <View style={{ width: r.ancho, alignSelf: 'center', flex: 1 }}>
            <Cabecera
              r={r}
              ronda={ronda}
              fase={fase}
              liquido={liquido}
              progreso={progreso}
              onSalir={onSalir ? pedirSalir : undefined}
            />
            {/* La escena es TODO lo que hay bajo la cabecera: el suelo del bar llega hasta abajo del todo y la
                bandeja va encima, sujeta por el camarero (si el suelo se cortaba, la bandeja parecia flotar). */}
            <View style={{ width: r.ancho, height: r.alturaBar + r.alturaBandeja }}>
            <Escena r={r} recorrido={recorrido} e={e} fase={fase} tiempoDibujo={tiempoDibujo.current}>
              {fase === 'cuenta' ? (
                <View style={styles.centrado} pointerEvents="none">
                  <Text style={styles.rondaTitulo}>RONDA {ronda + 1} DE {RONDAS.length}</Text>
                  <Text style={styles.rondaNombre}>{NOMBRE_RONDA[ronda]}</Text>
                  <Text style={styles.cuentaNumero} testID="pulso-cuenta">
                    {Math.max(1, Math.ceil(cuenta.current))}
                  </Text>
                </View>
              ) : null}
              {fase === 'fin' ? (
                <View style={styles.centrado} pointerEvents="none">
                  <Text style={styles.rondaTitulo}>¡SE ACABÓ!</Text>
                  <Text style={styles.finNota} testID="pulso-nota">
                    {formatearNota(ID_PULSO, notaPartida(puntos.current))}
                  </Text>
                </View>
              ) : null}
              {fase === 'entre' ? <ResumenRonda ronda={e.ronda} niveles={e.niveles} caidas={e.caidas} /> : null}
            </Escena>
            <View style={{ position: 'absolute', left: 0, top: r.alturaBar }}>
            <ZonaBandeja
              r={r}
              ronda={ronda}
              e={e}
              angulo={angulo}
              tiempoDibujo={tiempoDibujo.current}
              manual={modo === 'manual'}
              motivo={textoMotivo(motivo)}
              giroManual={objetivo.current}
              onGiro={fijarConSigno}
              jugando={fase === 'cuenta' || fase === 'ronda'}
            />
            </View>
            </View>
          </View>
        ) : null}
      </View>

      {fase === 'inicio' ? <Intro onEmpezar={empezarJuego} onSalir={onSalir} /> : null}
      {pausado && !saliendo && fase !== 'inicio' ? (
        <Velo>
          <Text style={styles.veloTitulo}>En pausa</Text>
          <Text style={styles.veloTexto}>La ronda se ha parado: no se vacía nada mientras estás en otra cosa.</Text>
          <Button title="Seguir" onPress={() => pausar(false)} />
        </Velo>
      ) : null}
      {saliendo ? (
        <Velo>
          <Text style={styles.veloTitulo}>¿Salir de la partida?</Text>
          <Text style={styles.veloTexto}>Si sales ahora, esta partida no cuenta.</Text>
          <Button
            title="Seguir jugando"
            onPress={() => {
              setSaliendo(false);
              pausar(false);
            }}
          />
          <Button title="Salir" variant="secondary" onPress={() => onSalir?.()} />
        </Velo>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

function Velo({ children }: { children: ReactNode }) {
  return (
    <View style={styles.velo} testID="pulso-velo">
      <View style={styles.veloTarjeta}>{children}</View>
    </View>
  );
}

function Intro({ onEmpezar, onSalir }: { onEmpezar: () => void; onSalir?: () => void }) {
  // En web, sin https el navegador no da el sensor de movimiento: se avisa ANTES de empezar (se usa el deslizador).
  const sinHttps = Platform.OS === 'web' && typeof window !== 'undefined' && window.isSecureContext === false;
  return (
    <View style={styles.velo} testID="pulso-intro">
      <View style={styles.veloTarjeta}>
        <Text style={styles.veloTitulo}>APARTA!!!</Text>
        <Text style={styles.veloTexto}>
          Cruzas el bar con una bandeja llena. Al esquivar a la gente, se inclina y se derrama. Endereza la bandeja
          girando el móvil.
        </Text>
        <Text style={styles.veloTexto}>
          Si cae a la derecha, inclina el móvil a la izquierda, y al revés: levanta el lado que cae. Tres rondas, cada
          una más difícil. Gana quien más líquido salva.
        </Text>
        {sinHttps ? (
          <Text style={styles.avisoHttp} testID="pulso-aviso-http">
            Estás en una web sin https: el navegador no da el giro del móvil. Jugarás con un deslizador. Para usar el
            móvil de verdad, abre la web con https.
          </Text>
        ) : null}
        <Button title="Empezar" onPress={onEmpezar} testID="pulso-empezar" />
        {onSalir ? <Button title="Volver" variant="ghost" onPress={onSalir} /> : null}
      </View>
    </View>
  );
}

function Cabecera({
  r,
  ronda,
  fase,
  liquido,
  progreso,
  onSalir,
}: {
  r: Reparto;
  ronda: number;
  fase: Fase;
  liquido: number;
  progreso: number;
  onSalir?: () => void;
}) {
  return (
    <View style={{ height: 44 }} testID="pulso-cabecera">
      <View style={styles.cabecera}>
        {onSalir ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Salir del juego" onPress={onSalir} hitSlop={10} style={styles.circulo}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={styles.circuloHueco} />
        )}
        <Text style={styles.cabeceraTexto}>
          Ronda {ronda + 1}/{RONDAS.length}
        </Text>
        <Text style={styles.cabeceraLiquido} testID="pulso-liquido">
          {fase === 'inicio' ? '' : `${liquido} %`}
        </Text>
      </View>
      <View style={{ height: 3, width: r.ancho, backgroundColor: 'rgba(255,255,255,0.18)' }}>
        <View testID="pulso-progreso" style={{ height: 3, width: r.ancho * progreso, backgroundColor: colors.beer }} />
      </View>
    </View>
  );
}

/** El bar visto desde los ojos del camarero: pared, suelo y lo que se cruza, con parallax. */
function Escena({
  r,
  recorrido,
  e,
  fase,
  tiempoDibujo,
  children,
}: {
  r: Reparto;
  recorrido: Recorrido;
  e: EstadoRonda;
  fase: Fase;
  tiempoDibujo: number;
  children: ReactNode;
}) {
  const ancho = r.ancho;
  const alto = r.alturaBar;
  // La escena llega hasta abajo del todo (donde esta la bandeja): el suelo no se corta.
  const altoTotal = r.alturaBar + r.alturaBandeja;
  const t = fase === 'ronda' ? e.t : 0;
  const maximo = (RONDAS[recorrido.ronda] as { empuje: number }).empuje;
  const cam = fase === 'ronda' ? camaraDe(empuje(recorrido, t), maximo) : 0;
  const horizonte = alto * HORIZONTE;
  const escalaFondo = Math.max(horizonte / FONDO_ALTO, (ancho * 1.5) / ESCENA_ANCHO);
  const escalaSuelo = Math.max((altoTotal - horizonte) / SUELO_ALTO, (ancho * 1.7) / ESCENA_ANCHO);
  const anchoRef = ancho * 0.5;
  const lista = fase === 'ronda' ? obstaculosDe(recorrido, t, AVISOS) : [];
  return (
    <View style={{ width: ancho, height: altoTotal, overflow: 'hidden', backgroundColor: '#2a1a10' }} testID="pulso-escena">
      <Image
        source={FONDO}
        style={{
          position: 'absolute',
          top: 0,
          left: (ancho - ESCENA_ANCHO * escalaFondo) / 2 - cam * ancho * 0.12,
          width: ESCENA_ANCHO * escalaFondo,
          height: FONDO_ALTO * escalaFondo,
        }}
        contentFit="fill"
      />
      <Image
        source={SUELO}
        style={{
          position: 'absolute',
          top: horizonte,
          left: (ancho - ESCENA_ANCHO * escalaSuelo) / 2 - cam * ancho * 0.35,
          width: ESCENA_ANCHO * escalaSuelo,
          height: SUELO_ALTO * escalaSuelo,
        }}
        contentFit="fill"
      />
      {lista.map((o, orden) => {
        const p = proyectar(o, { ancho, alto }, cam, anchoRef);
        const base = o.tipo === 'mesa' ? ancho * 0.62 : o.tipo === 'taburete' ? ancho * 0.26 : ancho * 0.36;
        const proporcion = o.tipo === 'mesa' ? PROPORCION_MESA : o.tipo === 'taburete' ? PROPORCION_TABURETE : PROPORCION_CLIENTE;
        const w = base * p.escala;
        const h = w / proporcion;
        const fuente = o.tipo === 'mesa' ? MESA : o.tipo === 'taburete' ? TABURETE : cliente(o.variante);
        return (
          <Image
            key={o.clave}
            testID={o.roce ? 'pulso-roce' : 'pulso-obstaculo'}
            source={fuente}
            contentFit="contain"
            style={{ position: 'absolute', left: p.x - w / 2, top: p.y - h, width: w, height: h, zIndex: orden }}
          />
        );
      })}
      <View style={styles.sombraAlto} pointerEvents="none" />
      {/* Los rotulos (cuenta atras, resumen, fin) van en la parte del bar, no sobre la bandeja. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: alto }} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}

function ZonaBandeja({
  r,
  ronda,
  e,
  angulo,
  tiempoDibujo,
  manual,
  motivo,
  giroManual,
  onGiro,
  jugando,
}: {
  r: Reparto;
  ronda: number;
  e: EstadoRonda;
  angulo: number;
  tiempoDibujo: number;
  manual: boolean;
  motivo: string | null;
  giroManual: number;
  onGiro: (g: number) => void;
  jugando: boolean;
}) {
  const tipos = (RONDAS[ronda] as { bebidas: readonly string[] }).bebidas;
  const huecos = colocarBebidas(tipos, r.bandejaAncho, r.bandejaAlto);
  const reservaDeslizador = manual ? 96 : 0;
  const centroY = (r.alturaBandeja - reservaDeslizador) / 2;
  const perdido = 1 - fraccionSalvada(ronda, e.niveles);
  return (
    <View style={{ height: r.alturaBandeja, width: r.ancho }} testID="pulso-zona-bandeja">
      <View
        testID="pulso-bandeja"
        accessibilityLabel={`Bandeja inclinada ${angulo.toFixed(1)} grados`}
        style={{
          position: 'absolute',
          left: (r.ancho - r.bandejaAncho) / 2,
          top: centroY - r.bandejaAlto / 2,
          width: r.bandejaAncho,
          height: r.bandejaAlto,
          transform: [{ rotate: `${angulo}deg` }],
        }}
      >
        <Image source={BANDEJA} style={StyleSheet.absoluteFill} contentFit="fill" />
        {/* El charco crece con lo que se ha derramado. */}
        {[0.2, 0.5].map((fx, i) => (
          <Image
            key={i}
            source={CHARCO}
            contentFit="fill"
            style={{
              position: 'absolute',
              left: r.bandejaAncho * fx,
              top: r.bandejaAlto * (i === 0 ? 0.6 : 0.69),
              width: r.bandejaAncho * 0.3,
              height: r.bandejaAncho * 0.3 * (70 / 180),
              opacity: Math.min(1, perdido * (i === 0 ? 2.2 : 1.4)),
            }}
          />
        ))}
        {tipos.map((tipo, i) => {
          const h = huecos[i];
          if (!h) return null;
          const t = tipo as keyof typeof BEBIDA;
          const nivel = e.niveles[i] as number;
          const caida = e.caidas[i] as boolean;
          return (
            <Bebida
              key={i}
              tipo={t}
              hueco={h}
              nivel={nivel}
              caida={caida}
              derramando={jugando && !caida && nivel < 0.999 && Math.abs(angulo) > (BEBIDAS[t].umbral - 0.5)}
              lado={e.ladoDerrame[i] as number}
              tiempo={tiempoDibujo + i * 0.37}
            />
          );
        })}
      </View>
      {manual ? (
        <View style={styles.deslizador} testID="pulso-deslizador">
          <Text style={styles.deslizadorTitulo}>Sin sensor de movimiento: arrastra para inclinar el móvil</Text>
          <SelectorGiro valor={giroManual} onChange={onGiro} />
          {motivo ? (
            <Text style={styles.motivo} numberOfLines={2}>
              {motivo}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Bebida({
  tipo,
  hueco,
  nivel,
  caida,
  derramando,
  lado,
  tiempo,
}: {
  tipo: keyof typeof BEBIDA;
  hueco: { x: number; y: number; ancho: number; alto: number; fila: 0 | 1 };
  nivel: number;
  caida: boolean;
  derramando: boolean;
  lado: number;
  tiempo: number;
}) {
  const g = INTERIOR[tipo];
  const interior = (g.abajo - g.arriba) * hueco.alto;
  const visible = interior * nivel;
  const base = g.abajo * hueco.alto;
  const conEspuma = (tipo === 'cana' || tipo === 'jarra') && nivel > 0.04;
  return (
    <View
      testID={`pulso-bebida-${tipo}`}
      accessibilityLabel={`${tipo} ${Math.round(nivel * 100)}%`}
      style={{
        position: 'absolute',
        left: hueco.x,
        top: hueco.y,
        width: hueco.ancho,
        height: hueco.alto,
        zIndex: hueco.fila,
        transform: caida ? [{ translateY: hueco.alto * 0.9 }, { rotate: `${lado * 80}deg` }] : undefined,
        opacity: caida ? 0.35 : 1,
      }}
    >
      {/* La sombra del vaso en la bandeja: lo asienta sobre ella. */}
      <View
        style={{
          position: 'absolute',
          left: hueco.ancho * 0.04,
          width: hueco.ancho * 0.92,
          top: hueco.alto * 0.93,
          height: hueco.alto * 0.1,
          borderRadius: hueco.alto,
          backgroundColor: 'rgba(30,20,10,0.32)',
        }}
      />
      {/* El liquido, recortado por arriba segun el nivel: la ventana crece desde la base del vaso. */}
      <View style={{ position: 'absolute', left: 0, width: hueco.ancho, top: base - visible, height: visible, overflow: 'hidden' }}>
        <Image
          source={BEBIDA[tipo].liquido}
          contentFit="fill"
          style={{ position: 'absolute', left: 0, top: -(base - visible), width: hueco.ancho, height: hueco.alto }}
        />
      </View>
      {conEspuma ? (
        <View
          style={{
            position: 'absolute',
            left: hueco.ancho * 0.2,
            width: hueco.ancho * 0.6,
            top: base - visible - 3,
            height: Math.max(5, hueco.alto * 0.04),
            borderRadius: 4,
            backgroundColor: '#FFF3CE',
          }}
        />
      ) : null}
      <Image source={BEBIDA[tipo].vidrio} contentFit="fill" style={StyleSheet.absoluteFill} />
      {derramando
        ? [0, 1].map((k) => {
            const fase = (tiempo * 2.2 + k * 0.5) % 1;
            return (
              <Image
                key={k}
                source={GOTA}
                contentFit="contain"
                style={{
                  position: 'absolute',
                  left: lado >= 0 ? hueco.ancho * (0.78 + 0.1 * k) : hueco.ancho * (0.1 - 0.06 * k),
                  top: hueco.alto * (0.08 + 0.55 * fase),
                  width: hueco.ancho * 0.14,
                  height: hueco.ancho * 0.2,
                  opacity: 1 - fase * 0.8,
                }}
              />
            );
          })
        : null}
    </View>
  );
}

/** Entre rondas: lo que ha quedado en cada bebida. */
function ResumenRonda({ ronda, niveles, caidas }: { ronda: number; niveles: number[]; caidas: boolean[] }) {
  const config = RONDAS[ronda] as (typeof RONDAS)[number];
  const salvado = Math.round(fraccionSalvada(ronda, niveles) * 1000) / 10;
  return (
    <View style={styles.resumen} testID="pulso-resumen" pointerEvents="none">
      <Text style={styles.rondaTitulo}>RONDA {ronda + 1} TERMINADA</Text>
      <Text style={styles.resumenPct}>{salvado.toFixed(1).replace('.', ',')} % salvado</Text>
      <View style={styles.resumenBarras}>
        {config.bebidas.map((tipo, i) => {
          const n = niveles[i] as number;
          return (
            <View key={i} style={styles.resumenFila}>
              <Text style={styles.resumenNombre} numberOfLines={1}>
                {NOMBRE_BEBIDA[tipo]}
              </Text>
              <View style={styles.resumenCarril}>
                <View
                  style={{
                    width: `${Math.round(n * 100)}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: caidas[i] || n < NIVEL_TIRADA ? colors.stamp : colors.beer,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#1b120b' },
  medida: { flex: 1, alignItems: 'center' },
  cabecera: { height: 41, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cabeceraTexto: { color: colors.paper, fontWeight: '800', fontSize: 15 },
  cabeceraLiquido: { color: colors.beer, fontWeight: '800', fontSize: 18, minWidth: 56, textAlign: 'right' },
  circulo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circuloHueco: { width: 34, height: 34 },
  centrado: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  rondaTitulo: {
    color: colors.paper,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.2,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  rondaNombre: { color: colors.beer, fontWeight: '800', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  cuentaNumero: {
    color: colors.paper,
    fontWeight: '900',
    fontSize: 96,
    lineHeight: 104,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  finNota: { color: colors.beer, fontWeight: '900', fontSize: 52, textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  sombraAlto: { position: 'absolute', left: 0, right: 0, top: 0, height: 24, backgroundColor: 'rgba(0,0,0,0.22)' },
  deslizador: { position: 'absolute', left: MARGEN, right: MARGEN, bottom: 6, backgroundColor: 'rgba(246,239,226,0.97)', borderRadius: radius.md, borderWidth: 2, borderColor: colors.beer, paddingHorizontal: space.md, paddingVertical: space.xs },
  deslizadorTitulo: { fontSize: 12, fontWeight: '800', color: colors.beerDark, textAlign: 'center' },
  avisoHttp: { fontSize: 13, fontWeight: '700', color: colors.stamp, textAlign: 'center', lineHeight: 18 },
  motivo: { fontSize: 11, color: colors.inkSoft, textAlign: 'center' },
  velo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20,12,6,0.82)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  veloTarjeta: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  veloTitulo: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  veloTexto: { fontSize: 14, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  resumen: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20,12,6,0.78)', alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.md },
  resumenPct: { color: colors.beer, fontWeight: '900', fontSize: 28 },
  resumenBarras: { width: '78%', gap: 3 },
  resumenFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resumenNombre: { color: colors.paper, fontSize: 11, width: 92 },
  resumenCarril: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
});
