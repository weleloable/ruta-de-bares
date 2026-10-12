import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { alcancePx, anguloBrazo, ARRASTRE_MINIMO_PX, crearEscala, hayQueGirar } from './escena';
import { EscenaTapon } from './EscenaTapon';
import {
  ALTURA_SALIDA,
  avanzarVuelo,
  CAMPO,
  crearPartida,
  dianaFavorita,
  ficha,
  FUERZA_MINIMA,
  lanzar,
  multiplicador,
  previsualizar,
  puntosAcierto,
  registrarTiro,
  terminada,
  tiroActual,
  TIRO_MOVIMIENTO,
  TIRO_VIENTO,
  TIROS,
  totalAciertos,
  velocidadDesdeArrastre,
  vientoActual,
  type Partida,
  type Resultado,
  type Vuelo,
} from './modelo';
import { entrarEnHorizontal, salirDeHorizontal } from './pantallaCompleta';
import { LARGO_BRAZO, PIVOTE } from './spritesGeometria';
import { ZonaArrastre } from './ZonaArrastre';

export const ID_TAPON = 'tapon-al-vuelo';

type Fase = 'inicio' | 'apuntar' | 'volando' | 'resultado' | 'fin';

/** Un fotograma largo no adelanta el reloj de golpe (la fisica igual va a pasos fijos). */
const DT_MAX = 0.1;
/** Cuanto se deja ver lo que paso con la chapa antes del siguiente tiro. */
const PAUSA_RESULTADO_MS = 1100;
/** Angulo del brazo en reposo: del eje a la cuchara, donde sale la chapa (grados). */
const BRAZO_REPOSO = (Math.atan2(ALTURA_SALIDA - PIVOTE.y, -PIVOTE.x) * 180) / Math.PI;

type Arrastre = { x0: number; y0: number; x: number; y: number };

export function TaponAlVuelo({ onFinish, onSalir }: PropsJuego) {
  const ventana = useWindowDimensions();
  const girar = hayQueGirar(ventana.width, ventana.height);
  // Siempre en horizontal: con el movil en vertical se pinta tumbado (90 grados a la derecha).
  const ancho = girar ? ventana.height : ventana.width;
  const alto = girar ? ventana.width : ventana.height;

  const [partida, setPartida] = useState<Partida>(() => crearPartida(Math.floor(Math.random() * 2 ** 32)));
  const [fase, setFase] = useState<Fase>('inicio');
  // El reloj y el vuelo viven en refs (el bucle los lee); `cuadro` solo fuerza el repintado.
  const [, setCuadro] = useState(0);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [ultimo, setUltimo] = useState<{ r: Resultado; puntos: number } | null>(null);

  const partidaRef = useRef(partida);
  const faseRef = useRef<Fase>('inicio');
  const reloj = useRef(0);
  const soltadoEn = useRef<number | null>(null);
  const vuelo = useRef<Vuelo | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;

  const cambiarFase = useCallback((f: Fase) => {
    faseRef.current = f;
    setFase(f);
  }, []);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      salirDeHorizontal();
    },
    [],
  );

  const cerrarTiro = useCallback(
    (r: Resultado) => {
      const antes = partidaRef.current;
      const despues = registrarTiro(antes, r);
      partidaRef.current = despues;
      setPartida(despues);
      setUltimo({ r, puntos: despues.puntos - antes.puntos });
      if (r.tipo === 'dentro') feedback.acierto();
      else feedback.fallo();
      cambiarFase('resultado');
      temporizador.current = setTimeout(() => {
        vuelo.current = null;
        setUltimo(null);
        if (!terminada(despues)) {
          cambiarFase('apuntar');
          return;
        }
        cambiarFase('fin');
        salirDeHorizontal();
        const fav = dianaFavorita(despues);
        alAcabar.current({
          juego: ID_TAPON,
          puntuacion: despues.puntos,
          detalles: { aciertos: totalAciertos(despues), mejorRacha: despues.mejorRacha, favorita: fav ?? '' },
        });
      }, PAUSA_RESULTADO_MS);
    },
    [cambiarFase],
  );

  // Un solo bucle: avanza el reloj (dianas que se mueven, brazo) y el vuelo, a pasos fijos.
  useEffect(() => {
    let raf = 0;
    let ultimoMs = Date.now();
    const bucle = () => {
      const ahora = Date.now();
      const dt = pasoDeTiempo(ahora, ultimoMs, DT_MAX);
      ultimoMs = ahora;
      const f = faseRef.current;
      if (f === 'apuntar' || f === 'volando' || f === 'resultado') {
        reloj.current += dt;
        const v = vuelo.current;
        if (f === 'volando' && v) {
          const sig = avanzarVuelo(v, partidaRef.current.dianas, dt);
          vuelo.current = sig;
          if (sig.resultado) cerrarTiro(sig.resultado);
        }
        setCuadro((c) => (c + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(bucle);
    };
    raf = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(raf);
  }, [cerrarTiro]);

  // La zona de juego es la ventana entera (en horizontal) menos nada: el HUD va encima.
  const esc = crearEscala(ancho, alto, CAMPO);
  const alcance = esc ? alcancePx(esc) : 100;
  const tiro = arrastre ? velocidadDesdeArrastre(arrastre.x - arrastre.x0, arrastre.y - arrastre.y0, alcance) : null;

  // Se agarra en CUALQUIER sitio: el arrastre cuenta desde donde se puso el dedo.
  // (La primera version exigia empezar en la chapa, pegada al borde izquierdo, y no
  // quedaba sitio para estirar.)
  // Ref ademas del estado: soltar LANZA, y eso no puede ir en un actualizador de
  // estado (React los repite en modo estricto: saldrian dos chapas).
  const arrastreRef = useRef<Arrastre | null>(null);
  const ponerArrastre = useCallback((a: Arrastre | null) => {
    arrastreRef.current = a;
    setArrastre(a);
  }, []);
  const onInicio = useCallback(
    (x: number, y: number) => {
      if (faseRef.current !== 'apuntar') return false;
      ponerArrastre({ x0: x, y0: y, x, y });
      return true;
    },
    [ponerArrastre],
  );
  const onMover = useCallback(
    (x: number, y: number) => {
      const a = arrastreRef.current;
      if (a) ponerArrastre({ ...a, x, y });
    },
    [ponerArrastre],
  );
  const onSoltar = useCallback(
    (x: number, y: number) => {
      const a = arrastreRef.current;
      ponerArrastre(null);
      if (!a || faseRef.current !== 'apuntar') return;
      const dx = x - a.x0;
      const dy = y - a.y0;
      const { vx, vy, fuerza } = velocidadDesdeArrastre(dx, dy, alcance);
      // Un toque, o un arrastre que no llega, no gasta el tiro.
      if (Math.hypot(dx, dy) < ARRASTRE_MINIMO_PX || fuerza < FUERZA_MINIMA) return;
      vuelo.current = lanzar(partidaRef.current, vx, vy, reloj.current);
      soltadoEn.current = reloj.current;
      feedback.toque();
      cambiarFase('volando');
    },
    [alcance, cambiarFase, ponerArrastre],
  );
  const onCancelar = useCallback(() => ponerArrastre(null), [ponerArrastre]);

  const empezar = useCallback(() => {
    entrarEnHorizontal();
    reloj.current = 0;
    soltadoEn.current = null;
    cambiarFase('apuntar');
  }, [cambiarFase]);

  const salir = useCallback(() => {
    salirDeHorizontal();
    onSalir?.();
  }, [onSalir]);

  const n = tiroActual(partida);
  const viento = vientoActual(partida);
  const v = vuelo.current;

  // Brazo: tenso con el arrastre, latigazo al soltar.
  const trasSoltar = soltadoEn.current !== null && (fase === 'volando' || fase === 'resultado') ? reloj.current - soltadoEn.current : null;
  const brazo = anguloBrazo(BRAZO_REPOSO, tiro?.fuerza ?? 0, trasSoltar);
  const rad = (brazo * Math.PI) / 180;
  const enCuchara = { x: PIVOTE.x + LARGO_BRAZO * Math.cos(rad), y: PIVOTE.y + LARGO_BRAZO * Math.sin(rad), giro: 0 };
  const chapa =
    (fase === 'volando' || fase === 'resultado') && v
      ? { x: v.x, y: v.y, giro: (v.t - v.t0) * 900 }
      : fase === 'apuntar' || fase === 'inicio'
        ? enCuchara
        : null;
  const puntos = tiro && tiro.fuerza >= FUERZA_MINIMA ? previsualizar(tiro.vx, tiro.vy, 0.32, 9) : [];
  const resaltada = ultimo?.r.tipo === 'dentro' ? ultimo.r.diana : null;

  const contenedor = girar
    ? { position: 'absolute' as const, width: ancho, height: alto, left: (ventana.width - ancho) / 2, top: (ventana.height - alto) / 2, transform: [{ rotate: '90deg' }] }
    : { flex: 1 };

  return (
    <View style={styles.raiz}>
      <View style={[contenedor, styles.juego]}>
        <ZonaArrastre
          accessibilityLabel="Zona de lanzamiento: arrastra hacia atrás en cualquier sitio y suelta"
          girado={girar}
          style={StyleSheet.absoluteFill}
          onInicio={onInicio}
          onMover={onMover}
          onSoltar={onSoltar}
          onCancelar={onCancelar}
        >
          {esc ? (
            <EscenaTapon
              esc={esc}
              dianas={partida.dianas}
              n={n}
              // En vuelo, el reloj de la fisica: las dianas se ven donde la chapa choca con ellas.
              t={v ? v.t : reloj.current}
              chapa={chapa}
              brazo={brazo}
              puntos={puntos}
              resaltada={resaltada}
            />
          ) : null}
          {arrastre && tiro ? <Goma a={arrastre} fuerza={tiro.fuerza} /> : null}
          {fase === 'apuntar' && partida.tiro === 0 && !arrastre ? <Pista t={reloj.current} ancho={ancho} alto={alto} /> : null}
        </ZonaArrastre>

        {/* HUD encima del juego; no se queda los toques salvo en sus botones. */}
        <View style={styles.hud} pointerEvents="box-none">
          <View style={styles.marcador}>
            <Dato etiqueta="Tiro" valor={`${Math.min(partida.tiro + (fase === 'fin' ? 0 : 1), TIROS)}/${TIROS}`} />
            <Dato etiqueta="Puntos" valor={partida.puntos} />
            <Dato
              etiqueta="Racha"
              valor={partida.racha > 0 ? `×${(multiplicador(partida.racha + 1) / 10).toLocaleString('es-ES')}` : '×1'}
            />
          </View>
          <Viento viento={viento} mueve={n >= TIRO_MOVIMIENTO} />
          {onSalir ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Salir del juego" onPress={salir} hitSlop={10} style={styles.salir}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          ) : null}
        </View>

        {tiro ? (
          <View style={styles.fuerza} pointerEvents="none">
            <View style={[styles.fuerzaRelleno, { width: `${Math.round(tiro.fuerza * 100)}%`, backgroundColor: tiro.fuerza >= 1 ? colors.stamp : colors.beer }]} />
          </View>
        ) : null}

        {ultimo ? (
          <View style={styles.cartel} pointerEvents="none" accessibilityLiveRegion="polite">
            <Text style={[styles.cartelTexto, ultimo.r.tipo === 'dentro' ? styles.cartelBien : styles.cartelMal]}>{textoResultado(ultimo)}</Text>
          </View>
        ) : null}

        {fase === 'inicio' ? (
          <View style={styles.velo}>
            <Card style={styles.inicio}>
              <Text style={typography.sectionTitle}>Tapón al Vuelo</Text>
              <Text style={typography.body}>
                Pon el dedo en cualquier sitio, tira hacia atrás como si tensaras la catapulta y suelta. Tienes {TIROS}{' '}
                chapas.
              </Text>
              <Text style={typography.muted}>
                Caña {puntosAcierto('vaso', 1)} · Jarra {puntosAcierto('jarra', 1)} · Caja {puntosAcierto('caja', 1)} · Oreja del
                camarero {puntosAcierto('oreja', 1)} (¡a la cabeza no!). Seguidas multiplican hasta ×3. Viento desde el tiro{' '}
                {TIRO_VIENTO}; desde el {TIRO_MOVIMIENTO}, todo se mueve.
              </Text>
              <Button title="Empezar" onPress={empezar} />
              {onSalir ? <Button title="Salir" variant="ghost" onPress={salir} /> : null}
            </Card>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function textoResultado({ r, puntos }: { r: Resultado; puntos: number }): string {
  if (r.tipo === 'dentro') return `¡Dentro! ${ficha(r.diana).nombre} +${puntos}`;
  if (r.tipo === 'camarero') return '¡Al camarero no!';
  if (r.tipo === 'borde') return `Rebota en el borde`;
  return 'Fuera';
}

/** La goma: del punto donde se puso el dedo hasta el dedo. */
function Goma({ a, fuerza }: { a: Arrastre; fuerza: number }) {
  const dx = a.x - a.x0;
  const dy = a.y - a.y0;
  const largo = Math.hypot(dx, dy);
  if (largo < 2) return null;
  const ang = Math.atan2(dy, dx);
  const color = fuerza >= 1 ? colors.stamp : colors.beerDark;
  return (
    <>
      <View
        style={{
          position: 'absolute',
          left: a.x0 + dx / 2 - largo / 2,
          top: a.y0 + dy / 2 - 2,
          width: largo,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          opacity: 0.55,
          transform: [{ rotate: `${ang}rad` }],
        }}
      />
      <View style={[styles.dedo, { left: a.x0 - 9, top: a.y0 - 9 }]} />
      <View style={[styles.dedo, styles.dedoActual, { left: a.x - 12, top: a.y - 12, borderColor: color }]} />
    </>
  );
}

/** La primera vez: una mano que tira hacia atras y abajo, en bucle, hasta que se toca. */
function Pista({ t, ancho, alto }: { t: number; ancho: number; alto: number }) {
  const ciclo = (t % 1.6) / 1.6;
  const avance = Math.min(1, ciclo / 0.7);
  const x = ancho * 0.42 - avance * 70;
  const y = alto * 0.42 + avance * 55;
  return (
    <>
      <View style={[styles.pista, { left: ancho * 0.42 - 130, top: alto * 0.42 - 70 }]}>
        <Text style={styles.pistaTexto}>Tira hacia atrás y suelta</Text>
      </View>
      <View style={{ position: 'absolute', left: x - 16, top: y - 6, opacity: ciclo < 0.85 ? 1 : 0 }}>
        <Ionicons name="hand-left" size={34} color={colors.beerDark} />
      </View>
    </>
  );
}

function Viento({ viento, mueve }: { viento: number; mueve: boolean }) {
  return (
    <View style={styles.viento} accessibilityLabel={viento ? `Viento hacia la ${viento > 0 ? 'derecha' : 'izquierda'}, fuerza ${Math.abs(viento)}` : 'Sin viento'}>
      {viento !== 0 ? (
        <>
          <Ionicons name="flag" size={18} color={colors.stamp} style={viento < 0 ? { transform: [{ scaleX: -1 }] } : null} />
          <View style={[styles.flecha, { width: 14 + Math.abs(viento) * 30, flexDirection: viento > 0 ? 'row' : 'row-reverse' }]}>
            <View style={styles.flechaLinea} />
            <Ionicons name={viento > 0 ? 'caret-forward' : 'caret-back'} size={16} color={colors.beerDark} />
          </View>
          <Text style={styles.vientoTexto}>Viento {Math.abs(viento).toLocaleString('es-ES')}</Text>
        </>
      ) : (
        <Text style={styles.vientoTexto}>Sin viento</Text>
      )}
      {mueve ? <Text style={styles.vientoTexto}> · ¡Se mueven!</Text> : null}
    </View>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.datoValor}>{valor}</Text>
    </View>
  );
}

const PANEL = 'rgba(255, 250, 238, 0.88)';

const styles = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colors.paper, overflow: 'hidden' },
  juego: { overflow: 'hidden' },
  hud: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    right: space.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  marcador: { flexDirection: 'row', gap: space.xs, backgroundColor: PANEL, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: 4 },
  dato: { alignItems: 'center', minWidth: 54 },
  datoEtiqueta: { ...typography.overline, fontSize: 10 },
  datoValor: { fontSize: 18, fontWeight: '800', color: colors.beerDark },
  viento: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PANEL, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  flecha: { alignItems: 'center' },
  flechaLinea: { flex: 1, height: 3, backgroundColor: colors.beerDark, borderRadius: 2 },
  vientoTexto: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  salir: { width: 40, height: 40, borderRadius: 20, backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center' },
  fuerza: { position: 'absolute', left: space.md, bottom: space.md, width: 120, height: 10, borderRadius: 5, backgroundColor: PANEL, overflow: 'hidden' },
  fuerzaRelleno: { height: '100%' },
  cartel: { position: 'absolute', top: '30%', left: 0, right: 0, alignItems: 'center' },
  cartelTexto: { fontSize: 26, fontWeight: '900', paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: PANEL, overflow: 'hidden' },
  cartelBien: { color: colors.green },
  cartelMal: { color: colors.stamp },
  dedo: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.inkFaint, backgroundColor: 'rgba(255,255,255,0.5)' },
  dedoActual: { width: 24, height: 24, borderRadius: 12, borderWidth: 3 },
  pista: { position: 'absolute', width: 260, alignItems: 'center' },
  pistaTexto: { fontSize: 16, fontWeight: '800', color: colors.beerDark, backgroundColor: PANEL, paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
  velo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', padding: space.md },
  inicio: { gap: space.sm, maxWidth: 520, width: '100%' },
});
