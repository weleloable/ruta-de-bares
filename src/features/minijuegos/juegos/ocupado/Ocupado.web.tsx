import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { space, typography } from '../../../../lib/theme';
import type { PropsJuego } from '../../tipos';
import {
  formatoTiempo,
  leerMensajeOcupado,
  origenDe,
  puntuacionOcupado,
  resultadoOcupado,
  urlOcupado,
  type FinOcupado,
} from './mensaje';

const URL_JUEGO = urlOcupado(process.env.EXPO_PUBLIC_OCUPADO_URL);
const ORIGEN = origenDe(URL_JUEGO);
/** Si nadie pulsa "Ver resultado", el record se guarda solo al rato: salir sin pulsarlo no lo pierde. */
const GUARDAR_SOLO_MS = 12000;

/**
 * Ocupado en la WEB (y la PWA): el juego de Godot, publicado en su propia web,
 * en un iframe. El juego es suyo de principio a fin (menu, pistas, pausa,
 * pantalla final); la app solo escucha el aviso de que se gano (`postMessage`,
 * ver mensaje.ts) para guardar el record.
 *
 * SE JUEGA A PANTALLA COMPLETA, por encima de la app: dentro de la pantalla del
 * juego, con la barra de arriba, las pestanas y la cabecera, en un movil en
 * horizontal al iframe le quedaban ~120 px de alto (se midio). La capa es un
 * `div` fijo que tapa toda la ventana (vale tambien en iPhone, donde Safari no
 * deja poner nada a pantalla completa) y, donde se puede, ademas se pide
 * pantalla completa de verdad y girar a horizontal. El iframe solo se monta al
 * pulsar Jugar: abrir la ficha no descarga los ~10 MB del juego.
 *
 * Al ganar no se salta al resultado de la app enseguida: el juego tiene su
 * propia pantalla final. Sale "Ver resultado" y, si nadie lo pulsa, se guarda solo.
 */
export function Ocupado({ onFinish }: PropsJuego) {
  const capa = useRef<HTMLDivElement | null>(null);
  const marco = useRef<HTMLIFrameElement | null>(null);
  const [jugando, setJugando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [fin, setFin] = useState<FinOcupado | null>(null);
  // Espejo de `fin` para el desmontaje, que no ve el estado de despues.
  const finPendiente = useRef<FinOcupado | null>(null);
  finPendiente.current = fin;
  const terminado = useRef(false);
  const alTerminar = useRef(onFinish);
  alTerminar.current = onFinish;
  const { width, height } = useWindowDimensions();
  const vertical = height > width;

  const salirDePantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const entregar = (f: FinOcupado) => {
    if (terminado.current) return;
    terminado.current = true;
    salirDePantallaCompleta();
    alTerminar.current(resultadoOcupado(f));
  };

  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      // Ademas del origen, que lo mande NUESTRO iframe: publicados, la app y el juego
      // comparten origen (weleloable.github.io) y el origen solo no los distingue.
      if (!marco.current || e.source !== marco.current.contentWindow) return;
      const f = leerMensajeOcupado(e.origin, ORIGEN, e.data);
      if (f) setFin((anterior) => anterior ?? f);
    };
    window.addEventListener('message', alMensaje);
    return () => window.removeEventListener('message', alMensaje);
  }, []);

  useEffect(() => {
    if (!fin) return;
    const t = setTimeout(() => entregar(fin), GUARDAR_SOLO_MS);
    return () => clearTimeout(t);
  }, [fin]);

  // Si se desmonta desde fuera (atras del navegador, otra pestana, cerrar sesion; el
  // Volver del menu queda tapado por la capa) no se queda la pantalla completa puesta,
  // y una partida ganada sin pulsar "Ver resultado" no pierde el record.
  useEffect(
    () => () => {
      if (finPendiente.current) entregar(finPendiente.current);
      salirDePantallaCompleta();
    },
    [],
  );

  /**
   * Desde el toque en "Jugar" (la pantalla completa solo se concede dentro de un
   * gesto): por eso la capa existe siempre, oculta, y no se crea despues.
   */
  const jugar = () => {
    setJugando(true);
    setCargado(false);
    setFin(null);
    const el = capa.current;
    if (el && typeof el.requestFullscreen === 'function' && document.fullscreenEnabled) {
      el.requestFullscreen()
        .then(() => {
          // En Android se puede fijar en horizontal; si el navegador no deja, no pasa nada.
          const orientacion = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
          return orientacion.lock?.('landscape');
        })
        .catch(() => {});
    }
  };

  /**
   * Con la partida ya ganada, salir ES ver el resultado: si no, el aviso viejo se
   * quedaba esperando y, al volver a Jugar, su temporizador cortaba la partida nueva.
   */
  const salir = () => {
    if (fin) return entregar(fin);
    salirDePantallaCompleta();
    setJugando(false);
  };

  return (
    <View style={styles.raiz}>
      <Card style={styles.tarjeta}>
        <Text style={typography.cardTitle}>Escápate del baño del bar</Text>
        <Text style={typography.muted}>
          Te has quedado encerrado en el baño y tu cerveza se calienta mientras buscas la salida. Cuanto más fría la
          rescates, más puntos.
        </Text>
        <Text style={typography.muted}>
          Se juega en horizontal y a pantalla completa. En el móvil: izquierda para moverte, arrastra a la derecha para
          mirar y toca para usar. La primera vez descarga unos 10 MB.
        </Text>
        <Button title="Jugar" icon="play" onPress={jugar} />
      </Card>

      {/* En un portal en <body>: si algun contenedor de la navegacion tiene un `transform`
          (las animaciones de pantalla lo usan), un `position: fixed` dentro de el solo
          cubriria ese contenedor y no la ventana (la barra de pestanas quedaria encima). */}
      {createPortal(
        <div ref={capa} style={{ ...estiloCapa, display: jugando ? 'block' : 'none' }}>
          {jugando ? (
            <iframe
              ref={marco}
              title="Ocupado"
              src={URL_JUEGO}
              onLoad={() => setCargado(true)}
              allow="fullscreen; autoplay"
              allowFullScreen
              style={estiloMarco}
            />
          ) : null}
          {jugando && !cargado ? <div style={estiloCargando}>Cargando el juego…</div> : null}
          {jugando && vertical && !fin ? <div style={estiloGirar}>Gira el móvil: se juega en horizontal</div> : null}
          <button type="button" aria-label="Salir del juego" onClick={salir} style={estiloSalir}>
            ✕
          </button>
          {fin ? (
            // Arriba a la izquierda y compacto: el centro es el titulo de la pantalla final del juego.
            <button
              type="button"
              role="status"
              aria-label={`¡Has salido! Cerveza a ${fin.temperatura} grados en ${formatoTiempo(fin.segundos)}. Ver resultado: ${puntuacionOcupado(fin.temperatura)} puntos`}
              onClick={() => entregar(fin)}
              style={estiloVerResultado}
            >
              Ver resultado · {puntuacionOcupado(fin.temperatura)} puntos
            </button>
          ) : null}
        </div>,
        document.body,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, justifyContent: 'center' },
  tarjeta: { gap: space.md },
});

// La capa es DOM a proposito (solo existe en web): `position: fixed` por encima de la
// barra de pestanas, y un elemento al que pedirle pantalla completa.
const estiloCapa: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  backgroundColor: '#000',
};
const estiloMarco: CSSProperties = { border: 0, width: '100%', height: '100%', display: 'block' };
const estiloCargando: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#EDE2CE',
  font: '600 16px system-ui, sans-serif',
  pointerEvents: 'none',
};
const estiloGirar: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 12px',
  borderRadius: 999,
  backgroundColor: 'rgba(0,0,0,0.7)',
  color: '#fff',
  font: '600 13px system-ui, sans-serif',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
};
// Arriba a la derecha: a la izquierda estan los botones Movil y pausa del juego.
const estiloSalir: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 36,
  height: 36,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.4)',
  backgroundColor: 'rgba(0,0,0,0.55)',
  color: '#fff',
  font: '700 16px system-ui, sans-serif',
  cursor: 'pointer',
};
const estiloVerResultado: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  border: '2px solid #F3E1C6',
  borderRadius: 999,
  padding: '9px 16px',
  backgroundColor: '#C67A1E',
  color: '#fff',
  font: '800 14px system-ui, sans-serif',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
};
