import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PEvent } from 'react';

import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { direccionDeGesto } from '../conga/giros';
import { avanzarBocadillos, crearBocadillos, type Motivo } from './bocadillos';
import { Escena3D, hayWebGL } from './escena3d';
import {
  aplicarAccion,
  avanzar,
  CONFIG,
  crearEstado,
  embestidaLista,
  embistiendo,
  ID_QUIJOTE,
  metros,
  puntuacion,
  type Accion,
  type Estado,
} from './modelo';

/**
 * Don Quijote Cervecero (solo web): endless runner en 3D, en VERTICAL y con una
 * mano. Un toque a un lado (o deslizar) cambia de carril, deslizar arriba
 * salta y abajo agacha; con 10 jarras se llena la barra y el boton de abajo
 * lanza la Embestida. En PC, flechas o WASD y espacio.
 *
 * Todo es DOM y canvas (como ¿Conduces tu?): el marcador, los bocadillos y los
 * botones van en HTML por encima del canvas, nunca en 3D. La escena esta en
 * escena3d.ts y modelos/; la logica, en modelo.ts.
 */

const DT_MAX = 0.05;
/** Tope de densidad de pixeles: mas de 2 no se nota en el movil y cuesta mucho. */
const DENSIDAD_MAX = 2;
/** Pixeles de arrastre para que cuente como gesto; al soltar, basta con algo menos (un golpe rapido). */
const UMBRAL = 20;
const UMBRAL_SOLTAR = 12;
/** Un toque (sin arrastrar y corto) en una mitad de la pantalla mueve un carril hacia ese lado. */
const TOQUE_MAX_MS = 300;
/** Segundos que se ve "¡GIGANTE DERRIBADO!". */
const CARTEL_GIGANTE = 1.6;

type Fase = 'inicio' | 'jugando' | 'fin';
type Dedo = { id: number; x: number; y: number; x0: number; y0: number; desde: number; usado: boolean };
type Hud = {
  puntos: number;
  metros: number;
  vidas: number;
  carga: number;
  lista: boolean;
  embistiendo: boolean;
  escudo: boolean;
  fps: number;
  bocadillo: string | null;
  gigante: boolean;
};

const HUD_INICIAL: Hud = {
  puntos: 0,
  metros: 0,
  vidas: CONFIG.vidas,
  carga: 0,
  lista: false,
  embistiendo: false,
  escudo: false,
  fps: 0,
  bocadillo: null,
  gigante: false,
};

const TECLAS: Record<string, Accion> = {
  ArrowLeft: 'izquierda',
  KeyA: 'izquierda',
  ArrowRight: 'derecha',
  KeyD: 'derecha',
  ArrowUp: 'arriba',
  KeyW: 'arriba',
  ArrowDown: 'abajo',
  KeyS: 'abajo',
  Space: 'embestida',
  Enter: 'embestida',
};

/** Lo que ha pasado en el fotograma, en motivos para los bocadillos. */
function motivosDe(e: Estado): Motivo[] {
  const m: Motivo[] = [];
  for (const ev of e.eventos) {
    if (ev === 'molino-cerca') m.push('molino');
    else if (ev === 'embestida' || ev === 'gigante' || ev === 'choque' || ev === 'escudo' || ev === 'yelmo' || ev === 'queso') m.push(ev);
  }
  return m;
}

export function QuijoteCervecero({ onFinish, onSalir }: PropsJuego) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  // Una escena 3D para todas las partidas (crear un WebGL por partida gasta y a veces falla).
  const escena = useRef<Escena3D | null>(null);
  const [webgl] = useState(hayWebGL);
  const [fase, setFase] = useState<Fase>('inicio');
  const [pausa, setPausa] = useState(false);
  const pausaRef = useRef(false);
  const [partidaId, setPartidaId] = useState(0);
  const [hud, setHud] = useState<Hud>(HUD_INICIAL);
  const [verFps, setVerFps] = useState(false);
  /** Gestos pendientes: se aplican al principio del siguiente fotograma, en orden (no se pierde ninguno). */
  const cola = useRef<Accion[]>([]);
  const dedo = useRef<Dedo | null>(null);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;

  const pausar = useCallback((si: boolean) => {
    pausaRef.current = si;
    setPausa(si);
  }, []);

  // Pausa sola si la app pasa a segundo plano o pierde el foco.
  useEffect(() => {
    if (fase !== 'jugando') return;
    const fuera = () => {
      if (document.visibilityState === 'hidden') pausar(true);
    };
    const sinFoco = () => pausar(true);
    document.addEventListener('visibilitychange', fuera);
    window.addEventListener('blur', sinFoco);
    return () => {
      document.removeEventListener('visibilitychange', fuera);
      window.removeEventListener('blur', sinFoco);
    };
  }, [fase, pausar]);

  // Teclado para probar en PC (una pulsacion, un gesto; mantener no repite).
  useEffect(() => {
    const abajo = (ev: KeyboardEvent) => {
      if (ev.code === 'KeyP' || ev.code === 'Escape') {
        if (fase === 'jugando') pausar(!pausaRef.current);
        return;
      }
      const a = TECLAS[ev.code];
      if (!a) return;
      ev.preventDefault();
      if (!ev.repeat) cola.current.push(a);
    };
    window.addEventListener('keydown', abajo);
    return () => window.removeEventListener('keydown', abajo);
  }, [fase, pausar]);

  // Al salir del juego: sin escena 3D y la pantalla como estaba.
  useEffect(
    () => () => {
      escena.current?.liberar();
      escena.current = null;
      salirDePantallaCompleta();
    },
    [],
  );

  const terminar = useCallback((est: Estado) => {
    salirDePantallaCompleta();
    alAcabar.current({
      juego: ID_QUIJOTE,
      puntuacion: puntuacion(est),
      detalles: { metros: metros(est), jarras: est.jarras, molinos: est.molinos },
    });
  }, []);

  // El bucle de la partida.
  useEffect(() => {
    if (fase !== 'jugando') return;
    const canvas = lienzo.current;
    if (!canvas) return;
    escena.current ??= new Escena3D(canvas);
    const pintor = escena.current;
    const est = crearEstado();
    const bocas = crearBocadillos(Math.random);
    cola.current = [];
    let ultimo = performance.now();
    let ultimoHud = 0;
    let temblor = 0;
    let fotogramas = 0;
    let desdeFps = ultimo;
    let fps = 0;
    let giganteHasta = -1;
    let dichoInicio = false;
    let raf = 0;
    let fin: ReturnType<typeof setTimeout> | null = null;

    const bucle = (ahora: number) => {
      const dt = pausaRef.current ? 0 : pasoDeTiempo(ahora, ultimo, DT_MAX);
      ultimo = ahora;
      if (!pausaRef.current) {
        for (const a of cola.current) aplicarAccion(est, a);
        // Lo que ha pasado al aplicar los gestos (la Embestida) se suma a lo del paso.
        const deGestos = est.eventos;
        avanzar(est, dt, Math.random);
        if (deGestos.includes('embestida')) est.eventos.push('embestida');
        cola.current = [];

        const ev = est.eventos;
        if (ev.includes('choque')) {
          temblor = 0.6;
          feedback.fallo();
        }
        if (ev.includes('escudo')) {
          temblor = 0.35;
          feedback.acierto();
        }
        if (ev.includes('embestida')) feedback.acierto();
        if (ev.includes('gigante')) {
          temblor = 0.9;
          giganteHasta = est.t + CARTEL_GIGANTE;
          feedback.record();
        }
        if (ev.includes('fin')) fin = setTimeout(() => terminar(est), 1200);

        const motivos = motivosDe(est);
        if (!dichoInicio && est.t > 0.6) {
          motivos.push('inicio');
          dichoInicio = true;
        }
        avanzarBocadillos(bocas, est.t, motivos, Math.random);
      } else {
        cola.current = [];
      }
      temblor *= Math.exp(-7 * dt);

      const densidad = Math.min(window.devicePixelRatio || 1, DENSIDAD_MAX);
      pintor.dibujar(est, canvas.clientWidth, canvas.clientHeight, densidad, temblor, dt);

      fotogramas++;
      if (ahora - desdeFps >= 1000) {
        fps = Math.round((fotogramas * 1000) / (ahora - desdeFps));
        fotogramas = 0;
        desdeFps = ahora;
      }
      if (ahora - ultimoHud > 100) {
        ultimoHud = ahora;
        setHud({
          puntos: puntuacion(est),
          metros: metros(est),
          vidas: est.vidas,
          carga: est.carga,
          lista: embestidaLista(est),
          embistiendo: embistiendo(est),
          escudo: est.escudo,
          fps,
          bocadillo: bocas.texto,
          gigante: est.t < giganteHasta,
        });
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => {
      cancelAnimationFrame(raf);
      if (fin) clearTimeout(fin);
    };
  }, [fase, partidaId, terminar]);

  const arrancar = () => {
    entrarEnVertical();
    feedback.toque();
    pausar(false);
    setHud(HUD_INICIAL);
    setPartidaId((n) => n + 1);
    setFase('jugando');
  };

  const salir = () => {
    salirDePantallaCompleta();
    onSalir?.();
  };

  // --- Gestos: cada vez que el dedo recorre el umbral cuenta uno y se vuelve a medir desde ahi ---
  const dedoAbajo = (ev: PEvent<HTMLDivElement>) => {
    if (dedo.current) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dedo.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, desde: performance.now(), usado: false };
  };
  const dedoMover = (ev: PEvent<HTMLDivElement>) => {
    const d = dedo.current;
    if (!d || d.id !== ev.pointerId) return;
    const dir = direccionDeGesto(ev.clientX - d.x, ev.clientY - d.y, UMBRAL);
    if (!dir) return;
    cola.current.push(dir);
    d.x = ev.clientX;
    d.y = ev.clientY;
    d.usado = true;
  };
  const dedoArriba = (ev: PEvent<HTMLDivElement>) => {
    const d = dedo.current;
    if (!d || d.id !== ev.pointerId) return;
    if (!d.usado) {
      // Un golpe muy rapido puede soltar antes de llegar al umbral: al soltar vale con menos.
      const dir = direccionDeGesto(ev.clientX - d.x, ev.clientY - d.y, UMBRAL_SOLTAR);
      if (dir) {
        cola.current.push(dir);
      } else if (performance.now() - d.desde < TOQUE_MAX_MS && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < UMBRAL_SOLTAR) {
        // Un toque suelto: un carril hacia el lado de la pantalla que se ha tocado.
        const caja = ev.currentTarget.getBoundingClientRect();
        cola.current.push(ev.clientX < caja.left + caja.width / 2 ? 'izquierda' : 'derecha');
      }
    }
    dedo.current = null;
  };

  const embestir = (ev: PEvent<HTMLButtonElement>) => {
    // Que el toque no llegue tambien a la zona de gestos (seria un cambio de carril).
    ev.stopPropagation();
    ev.preventDefault();
    cola.current.push('embestida');
  };

  return (
    <div style={e.raiz} onContextMenu={(ev) => ev.preventDefault()}>
      <canvas ref={lienzo} style={e.lienzo} />

      {fase === 'jugando' ? (
        <>
          <div
            style={e.zonaGestos}
            onPointerDown={dedoAbajo}
            onPointerMove={dedoMover}
            onPointerUp={dedoArriba}
            onPointerCancel={() => (dedo.current = null)}
          />

          <div style={e.marcador}>
            <div style={e.puntos}>{hud.puntos.toLocaleString('es-ES')}</div>
            <div style={e.metros}>
              {hud.metros} m{verFps ? ` · ${hud.fps} fps` : ''}
            </div>
          </div>
          <div style={e.derecha}>
            <div style={e.vidas} aria-label={`Vidas: ${hud.vidas} de ${CONFIG.vidas}${hud.escudo ? ', con el yelmo puesto' : ''}`}>
              {hud.escudo ? <Ionicons name="shield" size={22} color={PLATA} /> : null}
              {Array.from({ length: CONFIG.vidas }, (_, k) => (
                <Ionicons key={k} name={k < hud.vidas ? 'heart' : 'heart-outline'} size={24} color={k < hud.vidas ? ROJO : CREMA} />
              ))}
            </div>
            <button type="button" aria-label="Pausa" style={e.icono} onClick={() => pausar(true)}>
              <Ionicons name="pause" size={22} color={CREMA} />
            </button>
          </div>

          {/* La barra de Embestida: se llena con las jarras. */}
          <div style={e.barra} aria-label={`Embestida: ${hud.carga} de ${CONFIG.jarrasEmbestida} jarras`}>
            <div
              style={{
                ...e.barraLlena,
                width: `${hud.embistiendo ? 100 : (hud.carga / CONFIG.jarrasEmbestida) * 100}%`,
                ...(hud.lista || hud.embistiendo ? e.barraBrilla : null),
              }}
            />
          </div>

          {hud.bocadillo ? <div style={e.bocadillo}>{hud.bocadillo}</div> : null}
          {hud.gigante ? <div style={e.gigante}>¡GIGANTE DERRIBADO!</div> : null}

          <button
            type="button"
            aria-label="Embestida"
            disabled={!hud.lista}
            style={{ ...e.embestida, ...(hud.lista ? e.embestidaLista : null), ...(hud.embistiendo ? e.embestidaActiva : null) }}
            onPointerDown={embestir}
          >
            {hud.embistiendo ? '¡A LA CARGA!' : '¡EMBESTIDA!'}
          </button>
        </>
      ) : null}

      {fase === 'jugando' && pausa ? (
        <div style={e.velo}>
          <div style={e.titulo}>En pausa</div>
          <div style={e.texto}>Rocinante aprovecha para pastar.</div>
          <button type="button" style={e.boton} onClick={() => pausar(false)}>
            Seguir
          </button>
          <button type="button" style={{ ...e.boton, ...e.botonSecundario }} onClick={salir}>
            Salir
          </button>
        </div>
      ) : null}

      {fase === 'inicio' ? (
        <div style={e.velo}>
          <div style={e.titulo}>Don Quijote Cervecero</div>
          <div style={e.texto}>
            Toca a un lado de la pantalla (o desliza) para cambiar de carril. Desliza arriba para saltar y abajo para agacharte.
          </div>
          <div style={e.texto}>
            Las jarras llenan la barra de arriba. Cuando esté llena, pulsa <b>¡EMBESTIDA!</b> y derriba lo que encuentres, gigantes incluidos.
          </div>
          <div style={e.nota}>En pruebas · en el ordenador, flechas o WASD y espacio.</div>
          {!webgl ? <div style={e.nota}>Este navegador no puede pintar en 3D: prueba con Chrome o Safari actualizados.</div> : null}
          <button type="button" style={{ ...e.boton, ...(webgl ? null : e.apagado) }} disabled={!webgl} onClick={arrancar}>
            ¡A galopar!
          </button>
          <label style={e.casilla}>
            <input type="checkbox" checked={verFps} onChange={(ev) => setVerFps(ev.target.checked)} /> Ver fotogramas por segundo
          </label>
          <button type="button" style={{ ...e.boton, ...e.botonSecundario }} onClick={salir}>
            Salir
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pantalla completa y, si el navegador deja, bloqueo en vertical (Chrome en
 * Android si; iPhone no). Hay que llamarlo dentro de un toque: el navegador
 * solo la concede como respuesta a un gesto.
 */
type Orientacion = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

function entrarEnVertical() {
  void (async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      await (screen.orientation as Orientacion | undefined)?.lock?.('portrait');
    } catch {
      // Sin permiso: se juega igual.
    }
  })();
}

function salirDePantallaCompleta() {
  try {
    (screen.orientation as Orientacion | undefined)?.unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {
    // Nada que deshacer.
  }
}

const AMBAR = '#E8A32C';
const ORO = '#FFB52E';
const CREMA = '#FFF3DC';
const ROJO = '#E0483C';
const PLATA = '#E6ECF2';
const MADERA = '#3b2414';

// Sin gestos del navegador sobre el juego: ni recargar al deslizar abajo, ni scroll, ni zoom.
const sinGestos: CSSProperties = {
  touchAction: 'none',
  overscrollBehavior: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  WebkitTapHighlightColor: 'transparent',
};

const sombra = '0 2px 6px rgba(0,0,0,.6)';

const e: Record<string, CSSProperties> = {
  raiz: { ...sinGestos, position: 'fixed', inset: 0, background: '#1a0f14', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', zIndex: 10 },
  lienzo: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  zonaGestos: { ...sinGestos, position: 'absolute', inset: 0 },
  marcador: { position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 16, pointerEvents: 'none' },
  puntos: { color: CREMA, fontSize: 30, fontWeight: 900, lineHeight: 1, textShadow: sombra },
  metros: { color: AMBAR, fontSize: 14, fontWeight: 800, marginTop: 2, textShadow: sombra },
  derecha: { position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 12, display: 'flex', alignItems: 'center', gap: 10 },
  vidas: { display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' },
  icono: {
    ...sinGestos,
    width: 40,
    height: 40,
    borderRadius: 20,
    border: 'none',
    background: 'rgba(0,0,0,.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  barra: {
    position: 'absolute',
    top: 'calc(max(12px, env(safe-area-inset-top)) + 54px)',
    left: 16,
    right: 16,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    background: 'rgba(255,243,220,.22)',
    pointerEvents: 'none',
  },
  barraLlena: { height: '100%', borderRadius: 4, background: ORO, transition: 'width .15s linear' },
  barraBrilla: { boxShadow: `0 0 10px ${ORO}` },
  bocadillo: {
    position: 'absolute',
    left: '50%',
    bottom: '38%',
    transform: 'translateX(-50%)',
    maxWidth: '78%',
    padding: '8px 14px',
    borderRadius: 14,
    background: CREMA,
    color: MADERA,
    fontSize: 16,
    fontWeight: 800,
    fontStyle: 'italic',
    textAlign: 'center',
    boxShadow: '0 4px 14px rgba(0,0,0,.35)',
    pointerEvents: 'none',
  },
  gigante: {
    position: 'absolute',
    top: '28%',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: ORO,
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: 1,
    textShadow: '0 3px 0 #5a2a00, 0 0 18px rgba(255,181,46,.8)',
    pointerEvents: 'none',
  },
  embestida: {
    ...sinGestos,
    position: 'absolute',
    left: '50%',
    bottom: 'calc(max(18px, env(safe-area-inset-bottom)) + 8px)',
    transform: 'translateX(-50%)',
    minWidth: 220,
    padding: '16px 28px',
    borderRadius: 999,
    border: `2px solid rgba(255,243,220,.35)`,
    background: 'rgba(0,0,0,.35)',
    color: 'rgba(255,243,220,.45)',
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 1,
  },
  embestidaLista: { background: ORO, color: MADERA, border: `2px solid ${CREMA}`, boxShadow: `0 0 22px ${ORO}`, cursor: 'pointer' },
  embestidaActiva: { background: ROJO, color: CREMA, border: `2px solid ${CREMA}`, boxShadow: `0 0 22px ${ROJO}` },
  velo: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    background: 'rgba(20,10,14,.72)',
    textAlign: 'center',
  },
  titulo: { color: AMBAR, fontSize: 30, fontWeight: 900, lineHeight: 1.1 },
  texto: { color: CREMA, fontSize: 17, maxWidth: 360, lineHeight: 1.35 },
  nota: { color: CREMA, opacity: 0.75, fontSize: 13, maxWidth: 340 },
  boton: {
    minWidth: 220,
    padding: '14px 28px',
    borderRadius: 999,
    border: 'none',
    background: AMBAR,
    color: MADERA,
    fontSize: 19,
    fontWeight: 900,
    cursor: 'pointer',
  },
  botonSecundario: { background: 'transparent', color: CREMA, border: `2px solid ${CREMA}`, fontSize: 16, padding: '10px 24px' },
  apagado: { opacity: 0.4, cursor: 'default' },
  casilla: { color: CREMA, fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' },
};
