import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PEvent } from 'react';

import type { ConducesRankingRow } from '../../../../types/database';
import { cargarRankingConduces, enviarDistancia, type ResultadoConduces } from '../../api';
import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { avanzarBorrachera, intensidad, mandosBorrachos, nuevaBorrachera, visuales, type EstadoBorrachera } from './borrachera';
import { Ciudad, COLORES_COCHE } from './ciudad';
import { nivelPorDefecto, useDatosRuta } from './compostelana';
import { Escena3D, hayWebGL, vistaPara, type CocheDibujo } from './escena3d';
import { avanzarParticulas, bocanada, chispas, Derrapes, type Particula } from './efectos';
import { cajaDeEscena, puntoLocal } from './orientacion';
import { comoVas, MENSAJE_SEGURIDAD, mensajeFinal, metrosTexto, nombreNivel } from './mensajes';
import {
  avanzarCoche,
  bolaDelJoystick,
  CHOQUES_MAX,
  COCHE,
  giroDelJoystick,
  PASO,
  registrarGolpe,
  resolverChoques,
  seguirCoche,
  velocidadAdelante,
  velocidadLateral,
  type Camara,
  type Coche,
  type Entrada,
  type EstadoChoques,
  type Vec,
} from './modelo';
import { recordLocal, registrarDistanciaLocal } from './records';
import { guardarSonido, SonidoCoche, sonidoGuardado } from './sonido';
import { avanzarTrafico, cajaDe, situar, type CocheTrafico } from './trafico';

/**
 * "¿Conduces tú?" (solo web): eliges cuantas cañas llevas y conduces de noche
 * por un Alcala sin fin hasta tu tercer choque. La puntuacion son los metros.
 * Con humor, pero el final siempre dice lo mismo: si bebes, no conduzcas.
 *
 * Pantallas: selector de nivel -> partida -> resultado -> rankings por nivel.
 * El resultado y los rankings los pone el propio juego (el ranking es por
 * nivel, 0041); al terminar llama igualmente a `onFinish`.
 *
 * Todo es DOM y canvas a proposito, sin componentes de React Native: hace falta
 * girar Y acelerar a la vez, y el sistema de toques de RN solo da un dedo.
 *
 * Se pinta en 3D con three.js (escena3d.ts), con la camara inclinada detras del
 * coche. La fisica y todo lo demas sigue en 2D, sobre el suelo.
 */

const RADIO_JOY = 56;
const DT_MAX = 0.1;
/** Tope de densidad: con efectos a pantalla completa, 2x ya va justo en moviles modestos. */
const DENSIDAD_MAX = 1.5;
const COLOR_JUGADOR = '#C67A1E';

type Fase = 'nivel' | 'jugando' | 'resultado' | 'ranking';
type Joystick = { id: number; ox: number; oy: number; x: number; y: number };

type Partida = {
  ciudad: Ciudad;
  coche: Coche;
  cam: Camara;
  choques: EstadoChoques;
  t: number;
  acumulado: number;
  trafico: CocheTrafico[];
  borrachera: EstadoBorrachera;
  particulas: Particula[];
  derrapes: Derrapes;
  inicio: number;
  metros: number;
  sJugador: number;
  temblor: number;
  humo: number;
  terminada: boolean;
};

type Final = {
  metros: number;
  nivel: number;
  choques: number;
  servidor: ResultadoConduces | null;
  error: string | null;
  recordLocal: { esRecord: boolean; anterior: number | null };
};

const medidaVentana = () => ({ ancho: typeof window !== 'undefined' ? window.innerWidth : 844, alto: typeof window !== 'undefined' ? window.innerHeight : 390 });
let siguienteId = 0;

function nuevaPartida(): Partida {
  const ciudad = new Ciudad(Math.random);
  const salida = ciudad.salida();
  const coche: Coche = { ...salida, vx: 0, vy: 0 };
  const inicio = ciudad.recorrido(coche) ?? 0;
  return {
    ciudad,
    coche,
    cam: { x: coche.x, y: coche.y, ang: coche.ang },
    choques: { choques: 0, invulnerableHasta: 0 },
    t: 0,
    acumulado: 0,
    trafico: [],
    borrachera: nuevaBorrachera(Math.random),
    particulas: [],
    derrapes: new Derrapes(),
    inicio,
    metros: 0,
    sJugador: inicio,
    temblor: 0,
    humo: 0,
    terminada: false,
  };
}

export function ConducesTu({ onFinish, onSalir }: PropsJuego) {
  const datos = useDatosRuta();
  const lienzo = useRef<HTMLCanvasElement>(null);
  // Una escena 3D para todas las partidas (crear un WebGL por partida gasta y a veces falla).
  const escena = useRef<Escena3D | null>(null);
  const joyBase = useRef<HTMLDivElement>(null);
  const joyBola = useRef<HTMLDivElement>(null);
  const [webgl] = useState(hayWebGL);
  const [fase, setFase] = useState<Fase>('nivel');
  const [nivel, setNivel] = useState(() => nivelPorDefecto(datos));
  const [nivelRanking, setNivelRanking] = useState(nivel);
  const [partidaId, setPartidaId] = useState(0);
  // Se juega siempre en horizontal: con el movil en vertical la escena se pinta tumbada (ver orientacion.ts).
  const [ventana, setVentana] = useState(medidaVentana);
  const escenaCaja = cajaDeEscena(ventana);
  const [hud, setHud] = useState({ metros: 0, kmh: 0, choques: 0, invertidos: false, hipo: false });
  const [acelerando, setAcelerando] = useState(false);
  const [frenando, setFrenando] = useState(false);
  const [sonidoActivo, setSonidoActivo] = useState(sonidoGuardado);
  const [final, setFinal] = useState<Final | null>(null);

  const joy = useRef<Joystick | null>(null);
  const botones = useRef({ acelerar: false, frenar: false });
  const teclas = useRef(new Set<string>());
  const sonido = useRef(new SonidoCoche());
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;

  // Si los sellos llegan despues de abrir (carga de la ruta), el selector parte de ellos.
  const tocado = useRef(false);
  useEffect(() => {
    if (!tocado.current) setNivel(nivelPorDefecto(datos));
  }, [datos]);

  useEffect(() => {
    const alGirar = () => setVentana(medidaVentana());
    window.addEventListener('resize', alGirar);
    return () => window.removeEventListener('resize', alGirar);
  }, []);

  // Teclado para probar en PC: flechas o WASD.
  useEffect(() => {
    const MANDO = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
    const abajo = (ev: KeyboardEvent) => {
      if (!MANDO.has(ev.code)) return;
      ev.preventDefault();
      teclas.current.add(ev.code);
    };
    const arriba = (ev: KeyboardEvent) => teclas.current.delete(ev.code);
    const perderFoco = () => teclas.current.clear();
    window.addEventListener('keydown', abajo);
    window.addEventListener('keyup', arriba);
    window.addEventListener('blur', perderFoco);
    return () => {
      window.removeEventListener('keydown', abajo);
      window.removeEventListener('keyup', arriba);
      window.removeEventListener('blur', perderFoco);
    };
  }, []);

  // Al salir del juego: sin sonido, sin la escena 3D y la pantalla como estaba.
  useEffect(() => {
    const s = sonido.current;
    return () => {
      s.apagar();
      escena.current?.liberar();
      escena.current = null;
      salirDePantallaCompleta();
    };
  }, []);

  const leerEntrada = useCallback((): Entrada => {
    const t = teclas.current;
    const izq = t.has('ArrowLeft') || t.has('KeyA');
    const der = t.has('ArrowRight') || t.has('KeyD');
    const j = joy.current;
    return {
      giro: j ? giroDelJoystick(j.x - j.ox, RADIO_JOY) : (der ? 1 : 0) - (izq ? 1 : 0),
      acelerar: botones.current.acelerar || t.has('ArrowUp') || t.has('KeyW'),
      frenar: botones.current.frenar || t.has('ArrowDown') || t.has('KeyS') || t.has('Space'),
    };
  }, []);

  /** Fin de partida: guarda en el movil y en la ruta, avisa a quien escuche y ensena el resultado. */
  const terminar = useCallback(
    async (p: Partida, nivelJugado: number) => {
      const metros = Math.round(p.metros);
      sonido.current.silencio();
      alAcabar.current({
        juego: 'conduces-tu',
        puntuacion: metros,
        detalles: { nivel: nivelJugado, choques: p.choques.choques, niveles: datos.numeroBares },
      });
      const local = await registrarDistanciaLocal(datos.rutaId, nivelJugado, metros);
      let servidor: ResultadoConduces | null = null;
      let error: string | null = null;
      if (datos.rutaId) {
        try {
          servidor = await enviarDistancia(datos.rutaId, nivelJugado, metros);
        } catch (err) {
          error = err instanceof Error ? err.message : 'No se pudo guardar en la ruta.';
        }
      }
      setFinal({ metros, nivel: nivelJugado, choques: p.choques.choques, servidor, error, recordLocal: local });
      setNivelRanking(nivelJugado);
      setFase('resultado');
    },
    [datos.numeroBares, datos.rutaId],
  );

  // El bucle de la partida.
  useEffect(() => {
    if (fase !== 'jugando') return;
    const canvas = lienzo.current;
    if (!canvas) return;
    escena.current ??= new Escena3D(canvas);
    const pintor = escena.current;
    const p = nuevaPartida();
    const I = intensidad(nivel, datos.numeroBares);
    let ultimo = performance.now();
    let ultimoHud = 0;
    let raf = 0;
    let fin: ReturnType<typeof setTimeout> | null = null;

    const bucle = (ahora: number) => {
      const dt = pasoDeTiempo(ahora, ultimo, DT_MAX);
      ultimo = ahora;
      const densidad = Math.min(window.devicePixelRatio || 1, DENSIDAD_MAX);
      const ancho = Math.round(canvas.clientWidth * densidad);
      const alto = Math.round(canvas.clientHeight * densidad);
      if (canvas.width !== ancho || canvas.height !== alto) {
        canvas.width = ancho;
        canvas.height = alto;
      }

      // La borrachera: decide rafagas y cambia lo que piden los mandos.
      p.borrachera = avanzarBorrachera(p.borrachera, I, dt, Math.random);
      const pedidos = p.terminada ? { giro: 0, acelerar: false, frenar: true } : leerEntrada();
      const borracho = mandosBorrachos(p.borrachera, I, pedidos);
      p.borrachera = borracho.estado;
      const mandos = borracho.mandos;
      const efectos = visuales(p.borrachera, I);

      // Fisica a paso fijo, chocando con la ciudad y con el trafico.
      const obstaculos = [...p.ciudad.obstaculos(), ...p.trafico.map((c) => cajaDe(c, p.ciudad))];
      p.acumulado += dt;
      let golpe = 0;
      let donde: Vec | null = null;
      while (p.acumulado >= PASO) {
        const r = resolverChoques(avanzarCoche(p.coche, mandos, PASO), obstaculos);
        p.coche = r.coche;
        if (r.impacto > golpe) {
          golpe = r.impacto;
          donde = r.punto;
        }
        p.acumulado -= PASO;
      }
      p.t += dt;

      // Un roce saca chispitas; un golpe de verdad cuenta como choque.
      if (donde && golpe > 1.5) p.particulas.push(...chispas(donde, golpe * 0.4, Math.random));
      const registro = registrarGolpe(p.choques, golpe, p.t);
      if (registro.choque && donde && !p.terminada) {
        p.choques = registro.estado;
        p.temblor = 18;
        p.particulas.push(...chispas(donde, golpe, Math.random));
        feedback.fallo();
        sonido.current.golpe(Math.min(golpe / 14, 1));
        // El coche del trafico al que has dado se queda ahi.
        const punto = donde;
        p.trafico = p.trafico.map((c) => {
          const s = situar(c, p.ciudad);
          return Math.hypot(s.x - punto.x, s.y - punto.y) < 3.5 ? { ...c, golpeado: true } : c;
        });
        if (p.choques.choques >= CHOQUES_MAX) {
          p.terminada = true;
          // Un momento para ver el golpe antes del resultado.
          fin = setTimeout(() => void terminar(p, nivel), 1300);
        }
      }

      // La ciudad crece por delante y cuenta los metros (solo hacia delante).
      const tramo = p.ciudad.tramoEn(p.coche);
      if (tramo) p.ciudad.asegurar(tramo.indice);
      const recorrido = p.ciudad.recorrido(p.coche);
      if (recorrido !== null) {
        p.sJugador = recorrido;
        if (!p.terminada) p.metros = Math.max(p.metros, recorrido - p.inicio);
      }
      p.trafico = avanzarTrafico(p.trafico, p.ciudad, p.coche, p.sJugador, dt, Math.random, COLORES_COCHE, () => ++siguienteId);

      // Humo del motor tocado, polvo al derrapar y las marcas en el asfalto.
      const vf = velocidadAdelante(p.coche);
      const vl = Math.abs(velocidadLateral(p.coche));
      const derrapando = (vl > 2.2 && Math.abs(vf) > 4) || (mandos.frenar && vf > 9);
      p.derrapes.seguir(p.coche, derrapando);
      p.humo -= dt;
      if (p.choques.choques > 0 && p.humo <= 0) {
        p.humo = p.choques.choques >= 2 ? 0.07 : 0.3;
        const morro = {
          x: p.coche.x + Math.sin(p.coche.ang) * COCHE.largo * 0.35,
          y: p.coche.y - Math.cos(p.coche.ang) * COCHE.largo * 0.35,
        };
        p.particulas.push(bocanada(morro, 'humo', Math.random));
      }
      if (derrapando && Math.random() < 0.5) {
        const atras = { x: p.coche.x - Math.sin(p.coche.ang) * 1.5, y: p.coche.y + Math.cos(p.coche.ang) * 1.5 };
        p.particulas.push(bocanada(atras, 'polvo', Math.random));
      }
      p.particulas = avanzarParticulas(p.particulas, dt);
      p.cam = seguirCoche(p.cam, p.coche, dt);
      p.temblor *= Math.exp(-6 * dt);
      sonido.current.actualizar(vf, mandos.acelerar, derrapando ? Math.min(vl / 6, 1) : 0);

      // Dibujar.
      const parpadeo = p.t < p.choques.invulnerableHasta && Math.floor(p.t * 8) % 2 === 0;
      const jugador: CocheDibujo = {
        id: 0,
        x: p.coche.x,
        y: p.coche.y,
        ang: p.coche.ang,
        color: COLOR_JUGADOR,
        frenando: mandos.frenar,
        danos: p.choques.choques,
        alfa: parpadeo ? 0.4 : 1,
      };
      const trafico: CocheDibujo[] = p.trafico.map((c) => ({
        id: c.id,
        ...situar(c, p.ciudad),
        color: c.color,
        frenando: c.frenando,
        danos: c.golpeado ? 1 : 0,
        alfa: 1,
      }));
      pintor.dibujar(
        {
          ciudad: p.ciudad,
          jugador,
          trafico,
          particulas: p.particulas,
          marcas: p.derrapes.marcas,
          cam: p.cam,
          temblor: { x: (Math.random() - 0.5) * p.temblor, y: (Math.random() - 0.5) * p.temblor },
        },
        vistaPara(ancho, alto, densidad),
        efectos,
      );
      ponerJoystick(joy.current, joyBase.current, joyBola.current);

      if (ahora - ultimoHud > 100) {
        ultimoHud = ahora;
        setHud({
          metros: Math.round(p.metros),
          kmh: Math.round(Math.abs(vf) * 3.6),
          choques: p.choques.choques,
          invertidos: efectos.invertidos,
          hipo: efectos.hipo,
        });
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => {
      cancelAnimationFrame(raf);
      if (fin) clearTimeout(fin);
    };
  }, [fase, partidaId, nivel, datos.numeroBares, leerEntrada, terminar]);

  const arrancar = () => {
    void pantallaCompletaHorizontal();
    if (sonidoActivo) sonido.current.encender();
    feedback.toque();
    joy.current = null;
    botones.current = { acelerar: false, frenar: false };
    setAcelerando(false);
    setFrenando(false);
    setHud({ metros: 0, kmh: 0, choques: 0, invertidos: false, hipo: false });
    setFinal(null);
    setPartidaId((n) => n + 1);
    setFase('jugando');
  };

  const cambiarNivel = (n: number) => {
    tocado.current = true;
    setNivel(Math.min(Math.max(n, 1), datos.numeroBares));
  };

  const alternarSonido = () => {
    const activo = !sonidoActivo;
    setSonidoActivo(activo);
    guardarSonido(activo);
    if (activo) sonido.current.encender();
    else sonido.current.apagar();
  };

  const salir = () => {
    sonido.current.apagar();
    salirDePantallaCompleta();
    onSalir?.();
  };

  // --- Joystick (mitad izquierda) y pedales (derecha), cada uno con su dedo ---
  const joyAbajo = (ev: PEvent<HTMLDivElement>) => {
    if (joy.current) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const caja = ev.currentTarget.getBoundingClientRect();
    const { x, y } = puntoLocal(ev.clientX, ev.clientY, caja, escenaCaja.girada);
    joy.current = { id: ev.pointerId, ox: x, oy: y, x, y };
  };
  const joyMover = (ev: PEvent<HTMLDivElement>) => {
    const j = joy.current;
    if (!j || j.id !== ev.pointerId) return;
    const caja = ev.currentTarget.getBoundingClientRect();
    const dedo = puntoLocal(ev.clientX, ev.clientY, caja, escenaCaja.girada);
    j.x = dedo.x;
    j.y = dedo.y;
  };
  const joySoltar = (ev: PEvent<HTMLDivElement>) => {
    if (joy.current?.id === ev.pointerId) joy.current = null;
  };
  const pedal = (cual: 'acelerar' | 'frenar', pulsado: boolean) => {
    botones.current[cual] = pulsado;
    (cual === 'acelerar' ? setAcelerando : setFrenando)(pulsado);
  };
  const manejadoresPedal = (cual: 'acelerar' | 'frenar') => ({
    onPointerDown: (ev: PEvent<HTMLDivElement>) => {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      pedal(cual, true);
    },
    onPointerUp: () => pedal(cual, false),
    onPointerCancel: () => pedal(cual, false),
    onLostPointerCapture: () => pedal(cual, false),
  });

  return (
    <div
      style={escenaCaja.girada ? { ...e.raiz, ...e.raizGirada, width: escenaCaja.ancho, height: escenaCaja.alto, transform: escenaCaja.transform ?? undefined } : e.raiz}
      onContextMenu={(ev) => ev.preventDefault()}>
      <canvas ref={lienzo} style={e.lienzo} />

      {fase === 'jugando' ? (
        <>
          <div
            style={e.zonaJoystick}
            onPointerDown={joyAbajo}
            onPointerMove={joyMover}
            onPointerUp={joySoltar}
            onPointerCancel={joySoltar}
          />
          {/* El joystick se dibuja con DOM: el canvas es WebGL. Lo coloca el bucle (ponerJoystick). */}
          <div ref={joyBase} style={e.joyBase}>
            <div ref={joyBola} style={e.joyBola} />
          </div>
          <div style={e.pedales}>
            <div
              role="button"
              aria-label="Freno y marcha atrás"
              style={{ ...e.pedal, ...e.freno, ...(frenando ? e.pulsado : null) }}
              {...manejadoresPedal('frenar')}
            >
              FRENO
            </div>
            <div
              role="button"
              aria-label="Acelerar"
              style={{ ...e.pedal, ...e.acelerador, ...(acelerando ? e.pulsado : null) }}
              {...manejadoresPedal('acelerar')}
            >
              ACELERAR
            </div>
          </div>
          <div style={e.marcador}>
            <div style={e.metros}>{metrosTexto(hud.metros)}</div>
            <div style={e.kmh}>
              {hud.kmh} km/h · {nombreNivel(nivel)}
            </div>
          </div>
          <div style={e.vidas} aria-label={`Choques: ${hud.choques} de ${CHOQUES_MAX}`}>
            {Array.from({ length: CHOQUES_MAX }, (_, k) => (
              <Ionicons key={k} name="car-sport" size={24} color={k < CHOQUES_MAX - hud.choques ? AMBAR : '#5a2a22'} />
            ))}
          </div>
          {hud.invertidos ? (
            <div style={e.aviso}>
              <Ionicons name="swap-horizontal" size={22} color={MADERA} /> ¡Volante al revés!
            </div>
          ) : hud.hipo ? (
            <div style={{ ...e.aviso, ...e.hipo }}>¡Hip!</div>
          ) : null}
        </>
      ) : null}

      {fase === 'nivel' ? (
        <div style={e.velo}>
          <div style={e.titulo}>¿Conduces tú?</div>
          <div style={e.texto}>¿Cuántas cañas llevas?</div>
          <div style={e.selector}>
            <button type="button" aria-label="Menos cañas" style={e.redondo} disabled={nivel <= 1} onClick={() => cambiarNivel(nivel - 1)}>
              <Ionicons name="remove" size={34} color={MADERA} />
            </button>
            <div style={e.nivel}>
              <div style={e.numero}>{nivel}</div>
              <div style={e.canas}>{nivel === 1 ? 'caña' : 'cañas'}</div>
            </div>
            <button
              type="button"
              aria-label="Más cañas"
              style={e.redondo}
              disabled={nivel >= datos.numeroBares}
              onClick={() => cambiarNivel(nivel + 1)}
            >
              <Ionicons name="add" size={34} color={MADERA} />
            </button>
          </div>
          <div style={e.comoVas}>{comoVas(nivel, datos.numeroBares)}</div>
          <div style={e.nota}>
            {datos.rutaId
              ? `Llevas ${datos.sellos} ${datos.sellos === 1 ? 'sello' : 'sellos'} en la Compostelana · máximo ${datos.numeroBares}`
              : 'Modo prueba: sin ruta, los récords se quedan en este móvil'}
          </div>
          {!webgl ? <div style={e.nota}>Este navegador no puede pintar en 3D: prueba con Chrome o Safari actualizados.</div> : null}
          <div style={e.fila}>
            <button type="button" style={{ ...e.boton, ...(webgl ? null : e.apagado) }} disabled={!webgl} onClick={arrancar}>
              Arrancar
            </button>
            <button
              type="button"
              style={{ ...e.boton, ...e.botonSecundario }}
              onClick={() => {
                setNivelRanking(nivel);
                setFase('ranking');
              }}
            >
              Rankings
            </button>
          </div>
        </div>
      ) : null}

      {fase === 'resultado' && final ? (
        <Resultado
          final={final}
          niveles={datos.numeroBares}
          conRuta={datos.rutaId !== null}
          onOtra={() => setFase('nivel')}
          onRanking={() => setFase('ranking')}
          onSalir={salir}
        />
      ) : null}

      {fase === 'ranking' ? (
        <Rankings
          rutaId={datos.rutaId}
          niveles={datos.numeroBares}
          nivel={nivelRanking}
          onNivel={setNivelRanking}
          onVolver={() => setFase(final ? 'resultado' : 'nivel')}
        />
      ) : null}

      <div style={e.arriba}>
        <button type="button" aria-label={sonidoActivo ? 'Quitar sonido' : 'Poner sonido'} style={e.icono} onClick={alternarSonido}>
          <Ionicons name={sonidoActivo ? 'volume-high' : 'volume-mute'} size={22} color={ESPUMA} />
        </button>
        <button type="button" aria-label="Salir" style={e.icono} onClick={salir}>
          <Ionicons name="close" size={26} color={ESPUMA} />
        </button>
      </div>

    </div>
  );
}

function Resultado({
  final,
  niveles,
  conRuta,
  onOtra,
  onRanking,
  onSalir,
}: {
  final: Final;
  niveles: number;
  conRuta: boolean;
  onOtra: () => void;
  onRanking: () => void;
  onSalir: () => void;
}) {
  const s = final.servidor;
  const esRecord = s ? s.isRecord : final.recordLocal.esRecord;
  const mejor = s ? s.best : Math.max(final.metros, final.recordLocal.anterior ?? 0);
  return (
    <div style={{ ...e.velo, ...e.veloResultado }}>
      <div style={e.columnas}>
        <div style={e.columna}>
          <div style={e.texto}>Has recorrido</div>
          <div style={e.grande}>{metrosTexto(final.metros)}</div>
          <div style={e.nota}>
            {nombreNivel(final.nivel)} · {final.choques} {final.choques === 1 ? 'choque' : 'choques'}
          </div>
          <div style={e.gracia}>{mensajeFinal(final.nivel, niveles, final.metros)}</div>
        </div>
        <div style={e.columna}>
          <div style={esRecord ? e.record : e.nota}>
            {esRecord ? `¡Nuevo récord con ${nombreNivel(final.nivel)}!` : `Tu récord con ${nombreNivel(final.nivel)}: ${metrosTexto(mejor)}`}
          </div>
          {s ? (
            <div style={e.puesto}>
              Puesto {s.position} de {s.total} en la ruta
            </div>
          ) : (
            <div style={e.nota}>{final.error ?? (conRuta ? '' : 'Sin ruta: guardado solo en este móvil.')}</div>
          )}
          <div style={e.seguridad}>
            <Ionicons name="car-outline" size={22} color={AMBAR} />
            <span>{MENSAJE_SEGURIDAD}</span>
          </div>
        </div>
      </div>
      <div style={e.fila}>
        <button type="button" style={e.boton} onClick={onOtra}>
          Otra vez
        </button>
        <button type="button" style={{ ...e.boton, ...e.botonSecundario }} onClick={onRanking}>
          Rankings
        </button>
        <button type="button" style={{ ...e.boton, ...e.botonSecundario }} onClick={onSalir}>
          Salir
        </button>
      </div>
    </div>
  );
}

/** Rankings por nivel: una pestaña por nivel, abierta en el que toca. */
function Rankings({
  rutaId,
  niveles,
  nivel,
  onNivel,
  onVolver,
}: {
  rutaId: string | null;
  niveles: number;
  nivel: number;
  onNivel: (n: number) => void;
  onVolver: () => void;
}) {
  const [filas, setFilas] = useState<ConducesRankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    setFilas(null);
    setError(null);
    void recordLocal(rutaId, nivel).then((r) => vigente && setLocal(r));
    if (rutaId) {
      cargarRankingConduces(rutaId, nivel)
        .then((f) => vigente && setFilas(f))
        .catch((err: unknown) => vigente && setError(err instanceof Error ? err.message : 'No se pudo cargar el ranking.'));
    }
    return () => {
      vigente = false;
    };
  }, [rutaId, nivel]);

  return (
    <div style={{ ...e.velo, ...e.veloRanking }}>
      <div style={e.cabeceraRanking}>
        <button type="button" aria-label="Volver" style={e.icono} onClick={onVolver}>
          <Ionicons name="chevron-back" size={26} color={ESPUMA} />
        </button>
        <div style={{ ...e.titulo, fontSize: 24 }}>Rankings · {nombreNivel(nivel)}</div>
      </div>
      <div style={e.pestanas} role="tablist">
        {Array.from({ length: niveles }, (_, k) => k + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={n === nivel}
            style={{ ...e.pestana, ...(n === nivel ? e.pestanaElegida : null) }}
            onClick={() => onNivel(n)}
          >
            {n} 🍺
          </button>
        ))}
      </div>
      <div style={e.lista}>
        {!rutaId ? (
          <div style={e.nota}>
            Sin ruta no hay ranking compartido. Tu récord aquí: {local === null ? 'ninguno todavía' : metrosTexto(local)}
          </div>
        ) : error ? (
          <div style={e.nota}>{error}</div>
        ) : filas === null ? (
          <div style={e.nota}>Cargando…</div>
        ) : filas.length === 0 ? (
          <div style={e.nota}>Nadie ha jugado aún con {nombreNivel(nivel)}. ¡Estrénalo!</div>
        ) : (
          filas.map((f) => (
            <div key={f.user_id} style={{ ...e.filaRanking, ...(f.is_me ? e.yo : null) }}>
              <span style={e.pos}>{f.pos}</span>
              <span style={e.nombre}>
                {f.display_name}
                {f.is_me ? ' (tú)' : ''}
              </span>
              <span style={e.dist}>{metrosTexto(f.distance)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Coloca el aro y la bola del joystick donde esta el dedo (o los esconde). */
function ponerJoystick(j: Joystick | null, base: HTMLDivElement | null, bola: HTMLDivElement | null) {
  if (!base || !bola) return;
  if (!j) {
    base.style.display = 'none';
    return;
  }
  const b = bolaDelJoystick(j.x - j.ox, j.y - j.oy, RADIO_JOY);
  base.style.display = 'block';
  base.style.transform = `translate(${j.ox - RADIO_JOY}px, ${j.oy - RADIO_JOY}px)`;
  bola.style.transform = `translate(${RADIO_JOY - RADIO_JOY * 0.42 + b.x}px, ${RADIO_JOY - RADIO_JOY * 0.42 + b.y}px)`;
}

async function pantallaCompletaHorizontal() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    const orientacion = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientacion.lock?.('landscape');
  } catch {
    // iPhone y escritorio no dejan: se pide girar el movil y listo.
  }
}

function salirDePantallaCompleta() {
  try {
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {
    // Nada que deshacer.
  }
}

const AMBAR = '#E8A32C';
const ESPUMA = '#FFFDF8';
const MADERA = '#3b2414';

const sinGestos: CSSProperties = {
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  WebkitTapHighlightColor: 'transparent',
};

const e: Record<string, CSSProperties> = {
  raiz: { ...sinGestos, position: 'fixed', inset: 0, background: '#0b0a09', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', zIndex: 10 },
  // En vertical: la escena girada ocupa su propio tamano (alto x ancho de ventana), no `inset: 0`.
  raizGirada: { inset: 'auto', left: 0, top: 0, transformOrigin: '0 0' },
  lienzo: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  zonaJoystick: { ...sinGestos, position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%' },
  joyBase: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: RADIO_JOY * 2,
    height: RADIO_JOY * 2,
    borderRadius: '50%',
    background: 'rgba(255, 253, 248, 0.08)',
    border: '3px solid rgba(255, 253, 248, 0.35)',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    display: 'none',
  },
  joyBola: {
    position: 'absolute',
    left: -3,
    top: -3,
    width: RADIO_JOY * 0.84,
    height: RADIO_JOY * 0.84,
    borderRadius: '50%',
    background: 'rgba(232, 163, 44, 0.85)',
    pointerEvents: 'none',
  },
  apagado: { opacity: 0.4 },
  pedales: { position: 'absolute', right: 'max(16px, env(safe-area-inset-right))', bottom: 18, display: 'flex', alignItems: 'flex-end', gap: 16 },
  pedal: {
    ...sinGestos,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    letterSpacing: 1,
    color: ESPUMA,
    border: `3px solid ${MADERA}`,
    boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
  },
  acelerador: { width: 128, height: 128, background: AMBAR, fontSize: 15, color: MADERA },
  freno: { width: 100, height: 100, background: '#7a3b26', fontSize: 14 },
  pulsado: { transform: 'scale(0.9)', filter: 'brightness(0.8)' },
  marcador: { position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' },
  metros: { color: ESPUMA, fontSize: 30, fontWeight: 900, textShadow: '0 2px 6px rgba(0,0,0,0.9)' },
  kmh: { color: ESPUMA, fontSize: 13, fontWeight: 600, opacity: 0.85, textShadow: '0 1px 4px rgba(0,0,0,0.9)' },
  vidas: { position: 'absolute', top: 14, left: 'max(16px, env(safe-area-inset-left))', display: 'flex', gap: 6, pointerEvents: 'none' },
  aviso: {
    position: 'absolute',
    top: 78,
    left: '50%',
    transform: 'translateX(-50%)',
    background: AMBAR,
    color: MADERA,
    fontWeight: 900,
    fontSize: 18,
    padding: '8px 16px',
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'none',
    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
  },
  hipo: { background: ESPUMA },
  arriba: { position: 'absolute', top: 10, right: 'max(12px, env(safe-area-inset-right))', display: 'flex', gap: 8, zIndex: 3 },
  icono: {
    width: 44,
    height: 44,
    borderRadius: 22,
    border: 'none',
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  velo: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: 'radial-gradient(circle at 50% 35%, #2a1a0e 0%, #0b0a09 75%)',
    padding: '16px 24px',
    textAlign: 'center',
    overflowY: 'auto',
  },
  veloResultado: { background: 'rgba(11, 10, 9, 0.88)' },
  veloRanking: { justifyContent: 'flex-start', paddingTop: 12 },
  titulo: { color: AMBAR, fontSize: 30, fontWeight: 900 },
  texto: { color: ESPUMA, fontSize: 17, opacity: 0.9 },
  nota: { color: ESPUMA, fontSize: 14, opacity: 0.7 },
  selector: { display: 'flex', alignItems: 'center', gap: 22 },
  redondo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    border: 'none',
    background: AMBAR,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  nivel: { minWidth: 90 },
  numero: { color: ESPUMA, fontSize: 52, fontWeight: 900, lineHeight: 1 },
  canas: { color: AMBAR, fontSize: 15, fontWeight: 700 },
  comoVas: { color: AMBAR, fontSize: 16, fontWeight: 700 },
  fila: { display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' },
  boton: {
    ...sinGestos,
    padding: '14px 32px',
    fontSize: 19,
    fontWeight: 800,
    color: MADERA,
    background: AMBAR,
    border: 'none',
    borderRadius: 999,
    cursor: 'pointer',
  },
  botonSecundario: { background: 'transparent', color: ESPUMA, border: `2px solid ${AMBAR}` },
  columnas: { display: 'flex', gap: 28, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', maxWidth: 820 },
  columna: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', maxWidth: 380 },
  grande: { color: AMBAR, fontSize: 56, fontWeight: 900, lineHeight: 1 },
  gracia: { color: ESPUMA, fontSize: 18, fontWeight: 700 },
  record: { color: MADERA, background: AMBAR, fontWeight: 900, fontSize: 16, padding: '6px 14px', borderRadius: 999 },
  puesto: { color: ESPUMA, fontSize: 18, fontWeight: 800 },
  seguridad: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    textAlign: 'left',
    color: ESPUMA,
    fontSize: 16,
    fontWeight: 800,
    background: 'rgba(232, 163, 44, 0.12)',
    border: `2px solid ${AMBAR}`,
    borderRadius: 14,
    padding: '10px 14px',
  },
  cabeceraRanking: { display: 'flex', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  pestanas: { display: 'flex', gap: 8, overflowX: 'auto', alignSelf: 'stretch', paddingBottom: 4 },
  pestana: {
    flex: '0 0 auto',
    padding: '8px 14px',
    borderRadius: 999,
    border: `2px solid ${AMBAR}`,
    background: 'transparent',
    color: ESPUMA,
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  pestanaElegida: { background: AMBAR, color: MADERA },
  lista: { display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'stretch', maxWidth: 620, margin: '0 auto', width: '100%' },
  filaRanking: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 14px',
    borderRadius: 12,
    background: 'rgba(255, 253, 248, 0.06)',
    color: ESPUMA,
  },
  yo: { background: 'rgba(232, 163, 44, 0.25)', border: `2px solid ${AMBAR}` },
  pos: { width: 28, fontWeight: 900, color: AMBAR, fontSize: 18 },
  nombre: { flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dist: { fontWeight: 900, fontSize: 17 },
};
