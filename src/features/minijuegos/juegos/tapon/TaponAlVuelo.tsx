import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../../../../components/ui';
import { colors, radius, space, typography } from '../../../../lib/theme';
import { feedback } from '../../feedback';
import { pasoDeTiempo } from '../../reloj';
import type { PropsJuego } from '../../tipos';
import { agarraChapa, ALCANCE_PX, crearEscala } from './escena';
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
  puntosAcierto,
  registrarTiro,
  terminada,
  tiroActual,
  TIRO_MOVIMIENTO,
  TIROS,
  totalAciertos,
  velocidadDesdeArrastre,
  vientoActual,
  type Partida,
  type Resultado,
  type Vuelo,
} from './modelo';
import { ZonaArrastre } from './ZonaArrastre';

export const ID_TAPON = 'tapon-al-vuelo';

type Fase = 'inicio' | 'apuntar' | 'volando' | 'resultado' | 'fin';

/** Un fotograma largo no adelanta el reloj de golpe (la fisica igual va a pasos fijos). */
const DT_MAX = 0.1;
/** Cuanto se deja ver lo que paso con la chapa antes del siguiente tiro. */
const PAUSA_RESULTADO_MS = 900;

export function TaponAlVuelo({ onFinish }: PropsJuego) {
  const [partida, setPartida] = useState<Partida>(() => crearPartida(Math.floor(Math.random() * 2 ** 32)));
  const [fase, setFase] = useState<Fase>('inicio');
  const [area, setArea] = useState({ w: 0, h: 0 });
  // El reloj y el vuelo viven en refs (el bucle los lee); `cuadro` solo fuerza el repintado.
  const [, setCuadro] = useState(0);
  const [apuntando, setApuntando] = useState<{ dedoX: number; dedoY: number; fuerza: number } | null>(null);
  const [ultimo, setUltimo] = useState<{ r: Resultado; puntos: number } | null>(null);

  const partidaRef = useRef(partida);
  const faseRef = useRef<Fase>('inicio');
  const reloj = useRef(0);
  const vuelo = useRef<Vuelo | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alAcabar = useRef(onFinish);
  alAcabar.current = onFinish;

  const cambiarFase = useCallback((f: Fase) => {
    faseRef.current = f;
    setFase(f);
  }, []);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

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

  // Un solo bucle: avanza el reloj (las dianas que se mueven) y el vuelo, a pasos fijos.
  useEffect(() => {
    let raf = 0;
    let ultimoMs = Date.now();
    const bucle = () => {
      const ahora = Date.now();
      const dt = pasoDeTiempo(ahora, ultimoMs, DT_MAX);
      ultimoMs = ahora;
      const f = faseRef.current;
      if (f === 'apuntar' || f === 'volando') {
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

  const esc = crearEscala(area.w, area.h, CAMPO);
  const arrastre = useRef<{ x0: number; y0: number } | null>(null);

  const onInicio = useCallback(
    (x: number, y: number) => {
      if (faseRef.current !== 'apuntar' || !esc || !agarraChapa(esc, 0, ALTURA_SALIDA, x, y)) return false;
      // La goma sale del botellin, no de donde cayo el dedo: un toque algo torcido no cuenta como arrastre.
      arrastre.current = { x0: esc.px(0), y0: esc.py(ALTURA_SALIDA) };
      setApuntando({ dedoX: x, dedoY: y, fuerza: 0 });
      feedback.toque();
      return true;
    },
    [esc],
  );
  const onMover = useCallback((x: number, y: number) => {
    const a = arrastre.current;
    if (!a) return;
    const { fuerza } = velocidadDesdeArrastre(x - a.x0, y - a.y0, ALCANCE_PX);
    setApuntando({ dedoX: x, dedoY: y, fuerza });
  }, []);
  const onSoltar = useCallback(
    (x: number, y: number) => {
      const a = arrastre.current;
      arrastre.current = null;
      setApuntando(null);
      if (!a || faseRef.current !== 'apuntar') return;
      const { vx, vy, fuerza } = velocidadDesdeArrastre(x - a.x0, y - a.y0, ALCANCE_PX);
      // Un toque sin arrastrar no gasta el tiro.
      if (fuerza < FUERZA_MINIMA) return;
      vuelo.current = lanzar(partidaRef.current, vx, vy, reloj.current);
      cambiarFase('volando');
    },
    [cambiarFase],
  );
  const onCancelar = useCallback(() => {
    arrastre.current = null;
    setApuntando(null);
  }, []);

  const empezar = useCallback(() => {
    reloj.current = 0;
    cambiarFase('apuntar');
  }, [cambiarFase]);

  const n = tiroActual(partida);
  const viento = vientoActual(partida);
  const v = vuelo.current;
  const chapa = fase === 'volando' || fase === 'resultado' ? (v ? { x: v.x, y: v.y } : null) : { x: 0, y: ALTURA_SALIDA };
  const resaltada = ultimo?.r.tipo === 'dentro' ? ultimo.r.diana : null;

  return (
    <View style={styles.raiz}>
      <View style={styles.hud}>
        <Dato etiqueta="Tiro" valor={`${Math.min(partida.tiro + (fase === 'fin' ? 0 : 1), TIROS)}/${TIROS}`} />
        <Dato etiqueta="Puntos" valor={partida.puntos} />
        <Dato etiqueta="Racha" valor={partida.racha > 0 ? `×${(multiplicador(partida.racha + 1) / 10).toLocaleString('es-ES')}` : '×1'} />
      </View>

      <View style={styles.aviso} accessibilityLiveRegion="polite">
        {viento !== 0 ? (
          <View style={styles.viento} accessibilityLabel={`Viento hacia la ${viento > 0 ? 'derecha' : 'izquierda'}, fuerza ${Math.abs(viento)}`}>
            <Ionicons name="cloud-outline" size={16} color={colors.inkSoft} />
            <View style={[styles.flechaViento, { width: 10 + Math.abs(viento) * 24, flexDirection: viento > 0 ? 'row' : 'row-reverse' }]}>
              <View style={styles.flechaVientoLinea} />
              <Ionicons name={viento > 0 ? 'caret-forward' : 'caret-back'} size={14} color={colors.beerDark} />
            </View>
            <Text style={styles.avisoTexto}>{Math.abs(viento).toLocaleString('es-ES')}</Text>
          </View>
        ) : (
          <Text style={styles.avisoTexto}>Sin viento</Text>
        )}
        {n >= TIRO_MOVIMIENTO ? (
          <Text style={styles.avisoTexto}>· Las dianas se mueven</Text>
        ) : null}
      </View>

      <ZonaArrastre
        accessibilityLabel="Zona de lanzamiento: arrastra la chapa hacia atrás y suelta"
        style={styles.area}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setArea({ w: width, h: height });
        }}
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
            apuntando={apuntando}
            resaltada={resaltada}
          />
        ) : null}
      </ZonaArrastre>

      <Text style={styles.pie} numberOfLines={1}>
        {ultimo
          ? ultimo.r.tipo === 'dentro'
            ? `¡Dentro! ${ficha(ultimo.r.diana).nombre} · +${ultimo.puntos}`
            : ultimo.r.tipo === 'borde'
              ? `Ha tocado el borde: ${ficha(ultimo.r.diana).nombre.toLowerCase()}`
              : 'Fuera'
          : fase === 'apuntar'
            ? 'Arrastra la chapa hacia atrás y suelta'
            : ' '}
      </Text>

      {fase === 'inicio' ? (
        <View style={styles.velo}>
          <Card style={styles.inicio}>
            <Text style={typography.sectionTitle}>Tapón al Vuelo</Text>
            <Text style={typography.body}>
              Arrastra la chapa hacia atrás y suelta para colarla. Tienes {TIROS} tiros.
            </Text>
            <Text style={typography.muted}>
              Vaso {puntosAcierto('vaso', 1)} · Jarra {puntosAcierto('jarra', 1)} · Caja {puntosAcierto('caja', 1)} · Oreja{' '}
              {puntosAcierto('oreja', 1)}. Aciertos seguidos multiplican hasta ×3. Desde el tiro 4 hay viento y desde el{' '}
              {TIRO_MOVIMIENTO} se mueve todo.
            </Text>
            <Button title="Empezar" onPress={empezar} />
          </Card>
        </View>
      ) : null}
    </View>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <View style={styles.dato}>
      <Text style={typography.overline}>{etiqueta}</Text>
      <Text style={styles.datoValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, gap: space.sm },
  hud: { flexDirection: 'row', justifyContent: 'space-between' },
  dato: { alignItems: 'center', minWidth: 70 },
  datoValor: { fontSize: 20, fontWeight: '800', color: colors.beerDark },
  aviso: { height: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  viento: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flechaViento: { alignItems: 'center' },
  flechaVientoLinea: { flex: 1, height: 3, backgroundColor: colors.beerDark, borderRadius: 2 },
  avisoTexto: { ...typography.muted, fontSize: 13 },
  area: {
    flex: 1,
    minHeight: 180,
    backgroundColor: colors.paperDeep,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  pie: { ...typography.muted, height: 20, textAlign: 'center' },
  velo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', padding: space.md },
  inicio: { gap: space.md },
});
