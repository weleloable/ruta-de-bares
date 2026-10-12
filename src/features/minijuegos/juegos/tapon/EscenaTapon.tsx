import { StyleSheet, View } from 'react-native';

import { colors } from '../../../../lib/theme';
import { BARRA_PX, type Escala } from './escena';
import { ALTURA_SALIDA, ficha, PARED, posicionDiana, RADIO_CHAPA, type DianaEnJuego, type IdDiana } from './modelo';

/**
 * El dibujo de Tapon al Vuelo, con Views (sin assets ni SVG): la barra, el
 * botellin de salida, las cuatro dianas, la chapa y la flecha del tirachinas.
 * Solo pinta: lo que se ve sale de lo que manda el modelo, en metros.
 */

const CERVEZA = '#E8B04A';
const ESPUMA = '#FFF8EA';
const VIDRIO = 'rgba(255,255,255,0.55)';
const MADERA = '#7A4A1E';
const CAJA = '#B5462E';
const PIEL = '#E9B48F';
const BOTELLA = '#5B3A1A';

export type PropsEscena = {
  esc: Escala;
  dianas: readonly DianaEnJuego[];
  /** Numero de tiro (1..10): decide que diana se mueve. */
  n: number;
  /** Reloj del tiro (s). */
  t: number;
  /** Donde esta la chapa (m), o null si aun no hay chapa en el botellin. */
  chapa: { x: number; y: number } | null;
  /** Arrastre en curso: el dedo (px) y la fuerza (0..1). */
  apuntando: { dedoX: number; dedoY: number; fuerza: number } | null;
  /** La diana que acaba de recibir la chapa, para resaltarla. */
  resaltada: IdDiana | null;
};

export function EscenaTapon({ esc, dianas, n, t, chapa, apuntando, resaltada }: PropsEscena) {
  const { px, py, e } = esc;
  const rChapa = Math.max(6, RADIO_CHAPA * e);
  const salidaX = px(0);
  const salidaY = py(ALTURA_SALIDA);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Fondo esc={esc} />

      {/* Barra */}
      <View style={[styles.barra, { top: py(0), height: BARRA_PX }]} />

      {/* La oreja primero: el camarero esta DETRAS de la barra y no debe tapar los vasos. */}
      {[...dianas].sort((a, b) => Number(b.id === 'oreja') - Number(a.id === 'oreja')).map((d) => (
        <Diana key={d.id} esc={esc} id={d.id} cx={posicionDiana(d, n, t)} resaltada={resaltada === d.id} />
      ))}

      {/* Botellin de salida */}
      <View
        style={[
          styles.botella,
          { left: salidaX - 0.035 * e, width: 0.07 * e, top: salidaY + rChapa * 0.6, height: py(0) - salidaY - rChapa * 0.6 },
        ]}
      />

      {apuntando ? <Tirachinas x0={salidaX} y0={salidaY} {...apuntando} /> : null}

      {chapa ? <Chapa x={px(chapa.x)} y={py(chapa.y)} r={rChapa} /> : null}
    </View>
  );
}

/** Colores de las botellas de la estanteria (decorado: no chocan con nada). */
const BOTELLAS = ['#5B3A1A', '#2F6B4F', '#9A5A11', '#5B3A1A', '#A82C24', '#2F6B4F', '#9A5A11', '#5B3A1A'];

/** El bar de fondo: azulejo bajo, estanteria con botellas y una lampara. Solo decorado, apagado. */
function Fondo({ esc }: { esc: Escala }) {
  const { py, e, ancho } = esc;
  // La estanteria va por encima de lo mas alto que se juega (oreja a 0,9 m), o a media altura si sobra cielo.
  const yEstante = Math.min(py(1.15), py(0) * 0.45);
  const altoBotella = Math.min(0.32 * e, 46);
  const hueco = ancho / BOTELLAS.length;
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.azulejo, { top: py(0.5), height: py(0) - py(0.5) }]} />
      {BOTELLAS.map((c, i) => (
        <View
          key={i}
          style={[
            styles.botellaFondo,
            {
              left: hueco * i + hueco * 0.3,
              top: yEstante - altoBotella * (i % 3 === 1 ? 1.15 : 1),
              width: hueco * 0.38,
              height: altoBotella * (i % 3 === 1 ? 1.15 : 1),
              backgroundColor: c,
            },
          ]}
        />
      ))}
      <View style={[styles.estante, { top: yEstante }]} />
      <View style={[styles.lampara, { left: ancho / 2 - 18, top: Math.max(0, yEstante * 0.25) }]} />
    </View>
  );
}

function Chapa({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    // testID: `npm run verificar:juego` la busca para arrastrarla y ver que vuela.
    <View testID="tapon-chapa" style={[styles.chapa, { left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r }]}>
      <View style={[styles.chapaDentro, { borderRadius: r }]} />
    </View>
  );
}

/** La goma (del botellin al dedo) y la flecha de direccion y fuerza, hacia el lado contrario. */
function Tirachinas({ x0, y0, dedoX, dedoY, fuerza }: { x0: number; y0: number; dedoX: number; dedoY: number; fuerza: number }) {
  const dx = dedoX - x0;
  const dy = dedoY - y0;
  const largo = Math.hypot(dx, dy);
  if (largo < 1) return null;
  const angGoma = Math.atan2(dy, dx);
  const angFlecha = angGoma + Math.PI;
  const largoFlecha = 24 + fuerza * 80;
  const color = fuerza >= 1 ? colors.stamp : colors.beerDark;
  return (
    <>
      <Segmento x={x0} y={y0} largo={largo} angulo={angGoma} grosor={2} color={colors.inkFaint} />
      <Segmento x={x0} y={y0} largo={largoFlecha} angulo={angFlecha} grosor={4} color={color} />
      <View
        style={[
          styles.punta,
          {
            left: x0 + Math.cos(angFlecha) * largoFlecha - 7,
            top: y0 + Math.sin(angFlecha) * largoFlecha - 7,
            borderLeftColor: color,
            transform: [{ rotate: `${angFlecha}rad` }],
          },
        ]}
      />
    </>
  );
}

/** Una linea de (x, y) con ese largo y angulo (rad), girando alrededor de su inicio. */
function Segmento({ x, y, largo, angulo, grosor, color }: { x: number; y: number; largo: number; angulo: number; grosor: number; color: string }) {
  // RN gira desde el centro: se coloca centrada en su punto medio.
  const mx = x + (Math.cos(angulo) * largo) / 2;
  const my = y + (Math.sin(angulo) * largo) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: mx - largo / 2,
        top: my - grosor / 2,
        width: largo,
        height: grosor,
        borderRadius: grosor / 2,
        backgroundColor: color,
        transform: [{ rotate: `${angulo}rad` }],
      }}
    />
  );
}

function Diana({ esc, id, cx, resaltada }: { esc: Escala; id: IdDiana; cx: number; resaltada: boolean }) {
  const { px, py, e } = esc;
  const f = ficha(id);
  const izq = px(cx - f.boca / 2 - PARED);
  const ancho = (f.boca + PARED * 2) * e;
  const arriba = py(f.alturaBoca);
  const alto = py(0) - arriba;
  const brillo = resaltada ? { borderColor: colors.green, borderWidth: 3 } : null;

  if (id === 'oreja') {
    // La cabeza del camarero asoma detras de la barra; la oreja es un aro en su lado izquierdo.
    const cabeza = 0.26 * e;
    const orejaAncho = f.boca * e;
    return (
      <>
        <View style={[styles.cuerpoCamarero, { left: px(cx) + orejaAncho * 0.3, width: cabeza, top: py(0.66), height: py(0) - py(0.66) }]} />
        <View
          style={[
            styles.cabeza,
            { left: px(cx) + orejaAncho * 0.3, top: py(f.alturaBoca) - cabeza * 0.55, width: cabeza, height: cabeza, borderRadius: cabeza / 2 },
          ]}
        />
        <View
          style={[
            styles.oreja,
            { left: px(cx) - orejaAncho / 2, top: py(f.alturaBoca) - orejaAncho * 0.35, width: orejaAncho, height: orejaAncho * 0.9 },
            brillo,
          ]}
        />
      </>
    );
  }

  if (id === 'caja') {
    return (
      <View style={[styles.caja, { left: izq, width: ancho, top: arriba, height: alto }, brillo]}>
        <View style={styles.cajaHueco} />
        <View style={styles.cajaFranja} />
      </View>
    );
  }

  const nivel = id === 'vaso' ? 0.72 : 0.65;
  return (
    <>
      {id === 'jarra' ? (
        <View style={[styles.asa, { left: izq + ancho - 2, top: arriba + alto * 0.2, width: ancho * 0.35, height: alto * 0.55 }]} />
      ) : null}
      <View style={[styles.vaso, { left: izq, width: ancho, top: arriba, height: alto }, brillo]}>
        <View style={[styles.liquido, { height: `${nivel * 100}%` }]} />
        <View style={[styles.espuma, { bottom: `${nivel * 100}%` }]} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  azulejo: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.border, opacity: 0.45 },
  estante: { position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: MADERA, opacity: 0.55 },
  botellaFondo: { position: 'absolute', borderTopLeftRadius: 6, borderTopRightRadius: 6, opacity: 0.3 },
  lampara: {
    position: 'absolute',
    width: 36,
    height: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#E7C26A',
    opacity: 0.6,
  },
  barra: { position: 'absolute', left: 0, right: 0, backgroundColor: MADERA, borderTopWidth: 3, borderTopColor: colors.beerDark },
  botella: { position: 'absolute', backgroundColor: BOTELLA, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  chapa: {
    position: 'absolute',
    backgroundColor: colors.stamp,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E7C26A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapaDentro: { width: '45%', height: '45%', backgroundColor: '#E7C26A' },
  punta: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  vaso: {
    position: 'absolute',
    backgroundColor: VIDRIO,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: colors.borderStrong,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  liquido: { backgroundColor: CERVEZA },
  espuma: { position: 'absolute', left: 0, right: 0, height: 5, backgroundColor: ESPUMA },
  asa: { position: 'absolute', borderWidth: 3, borderLeftWidth: 0, borderColor: colors.borderStrong, borderTopRightRadius: 8, borderBottomRightRadius: 8 },
  caja: { position: 'absolute', backgroundColor: CAJA, borderRadius: 2, overflow: 'hidden' },
  cajaHueco: { height: 5, backgroundColor: '#5E2215' },
  cajaFranja: { marginTop: 4, height: 4, backgroundColor: '#E7C26A', opacity: 0.8 },
  cuerpoCamarero: { position: 'absolute', backgroundColor: colors.white, borderTopLeftRadius: 8, borderTopRightRadius: 8, opacity: 0.9 },
  cabeza: { position: 'absolute', backgroundColor: PIEL },
  oreja: { position: 'absolute', borderWidth: 3, borderColor: '#C98563', backgroundColor: PIEL, borderRadius: 999 },
});
