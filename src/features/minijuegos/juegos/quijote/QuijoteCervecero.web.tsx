import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PEvent } from 'react';

import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { direccionDeGesto } from '../conga/giros';
import { Escena3D, hayWebGL } from './escena3d';
import { aplicarAccion, avanzar, CONFIG, crearEstado, ID_QUIJOTE, metros, type Accion, type Estado } from './modelo';

/**
 * Don Quijote Cervecero (solo web): endless runner en 3D, en VERTICAL y con una
 * mano. Deslizar a los lados cambia de carril, arriba salta y abajo agacha. En
 * PC, flechas o WASD.
 *
 * Fase 1: camino, cubos, gestos, choques, vidas y velocidad creciente. Todo es
 * DOM y canvas (como ¿Conduces tu?): el marcador y los botones van en HTML por
 * encima del canvas, nunca en 3D.
 */

const DT_MAX = 0.05;
/** Tope de densidad de pixeles: mas de 2 no se nota en el movil y cuesta mucho. */
const DENSIDAD_MAX = 2;
/** Pixeles de arrastre para que cuente como gesto; al soltar, basta con algo menos (un golpe rapido). */
const UMBRAL = 26;
const UMBRAL_SOLTAR = 16;

type Fase = 'inicio' | 'jugando' | 'fin';
type Dedo = { id: number; x: number; y: number; usado: boolean };

const TECLAS: Record<string, Accion> = {
  ArrowLeft: 'izquierda',
  KeyA: 'izquierda',
  ArrowRight: 'derecha',
  KeyD: 'derecha',
  ArrowUp: 'arriba',
  KeyW: 'arriba',
  ArrowDown: 'abajo',
  KeyS: 'abajo',
};

export function QuijoteCervecero({ onFinish, onSalir }: PropsJuego) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  // Una escena 3D para todas las partidas (crear un WebGL por partida gasta y a veces falla).
  const escena = useRef<Escena3D | null>(null);
  const [webgl] = useState(hayWebGL);
  const [fase, setFase] = useState<Fase>('inicio');
  const [pausa, setPausa] = useState(false);
  const pausaRef = useRef(false);
  const [partidaId, setPartidaId] = useState(0);
  const [hud, setHud] = useState<{ metros: number; vidas: number; fps: number }>({ metros: 0, vidas: CONFIG.vidas, fps: 0 });
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
    alAcabar.current({ juego: ID_QUIJOTE, puntuacion: metros(est), detalles: { metros: metros(est) } });
  }, []);

  // El bucle de la partida.
  useEffect(() => {
    if (fase !== 'jugando') return;
    const canvas = lienzo.current;
    if (!canvas) return;
    escena.current ??= new Escena3D(canvas);
    const pintor = escena.current;
    const est = crearEstado();
    cola.current = [];
    let ultimo = performance.now();
    let ultimoHud = 0;
    let temblor = 0;
    let fotogramas = 0;
    let desdeFps = ultimo;
    let fps = 0;
    let raf = 0;
    let fin: ReturnType<typeof setTimeout> | null = null;

    const bucle = (ahora: number) => {
      const dt = pausaRef.current ? 0 : pasoDeTiempo(ahora, ultimo, DT_MAX);
      ultimo = ahora;
      if (!pausaRef.current) {
        for (const a of cola.current) aplicarAccion(est, a);
        cola.current = [];
        avanzar(est, dt, Math.random);
        if (est.eventos.includes('choque')) {
          temblor = 0.6;
          feedback.fallo();
        }
        if (est.eventos.includes('fin')) fin = setTimeout(() => terminar(est), 1200);
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
        setHud({ metros: metros(est), vidas: est.vidas, fps });
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
    setHud({ metros: 0, vidas: CONFIG.vidas, fps: 0 });
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
    dedo.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, usado: false };
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
    // Un golpe muy rapido puede soltar antes de llegar al umbral: al soltar vale con menos.
    if (!d.usado) {
      const dir = direccionDeGesto(ev.clientX - d.x, ev.clientY - d.y, UMBRAL_SOLTAR);
      if (dir) cola.current.push(dir);
    }
    dedo.current = null;
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
            <div style={e.metros}>{hud.metros} m</div>
            {verFps ? <div style={e.fps}>{hud.fps} fps</div> : null}
          </div>
          <div style={e.derecha}>
            <div style={e.vidas} aria-label={`Vidas: ${hud.vidas} de ${CONFIG.vidas}`}>
              {Array.from({ length: CONFIG.vidas }, (_, k) => (
                <Ionicons key={k} name={k < hud.vidas ? 'heart' : 'heart-outline'} size={24} color={k < hud.vidas ? ROJO : CREMA} />
              ))}
            </div>
            <button type="button" aria-label="Pausa" style={e.icono} onClick={() => pausar(true)}>
              <Ionicons name="pause" size={22} color={CREMA} />
            </button>
          </div>
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
          <div style={e.texto}>Desliza a los lados para cambiar de carril, arriba para saltar y abajo para agacharte.</div>
          <div style={e.nota}>Fase 1 de pruebas: cubos en vez de Quijote. En el ordenador, flechas o WASD.</div>
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
const CREMA = '#FFF3DC';
const ROJO = '#E0483C';
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

const e: Record<string, CSSProperties> = {
  raiz: { ...sinGestos, position: 'fixed', inset: 0, background: '#1a0f14', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', zIndex: 10 },
  lienzo: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  zonaGestos: { ...sinGestos, position: 'absolute', inset: 0 },
  marcador: { position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 16, pointerEvents: 'none' },
  metros: { color: CREMA, fontSize: 30, fontWeight: 900, textShadow: '0 2px 6px rgba(0,0,0,.6)' },
  fps: { color: AMBAR, fontSize: 13, fontWeight: 700 },
  derecha: { position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 12, display: 'flex', alignItems: 'center', gap: 10 },
  vidas: { display: 'flex', gap: 4, pointerEvents: 'none' },
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
