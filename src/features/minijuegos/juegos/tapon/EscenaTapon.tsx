import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { colors } from '../../../../lib/theme';
import { colocar, type Escala } from './escena';
import { posicionDiana, type DianaEnJuego, type IdDiana } from './modelo';
import { PIVOTE, SPRITES } from './spritesGeometria';

/**
 * El dibujo de Tapon al Vuelo. Los dibujos son PNG generados por
 * scripts/generar-sprites-tapon.py, en metros y con las MISMAS medidas que la
 * fisica: se colocan por su punto de referencia (ver spritesGeometria.ts), asi
 * que la boca que se ve es la boca que choca. Aqui solo se pinta.
 */

const IMG = {
  fondo: require('../../../../../assets/tapon/fondo.jpg') as ImageSourcePropType,
  barra: require('../../../../../assets/tapon/barra.jpg') as ImageSourcePropType,
  vaso: require('../../../../../assets/tapon/vaso.png') as ImageSourcePropType,
  jarra: require('../../../../../assets/tapon/jarra.png') as ImageSourcePropType,
  caja: require('../../../../../assets/tapon/caja.png') as ImageSourcePropType,
  camarero: require('../../../../../assets/tapon/camarero.png') as ImageSourcePropType,
  base: require('../../../../../assets/tapon/catapulta-base.png') as ImageSourcePropType,
  brazo: require('../../../../../assets/tapon/catapulta-brazo.png') as ImageSourcePropType,
  chapa: require('../../../../../assets/tapon/chapa.png') as ImageSourcePropType,
};

/** Que dibujo lleva cada diana (la oreja va en el camarero). */
const DIBUJO: Record<IdDiana, keyof typeof SPRITES> = { vaso: 'vaso', jarra: 'jarra', caja: 'caja', oreja: 'camarero' };

export type PropsEscena = {
  esc: Escala;
  dianas: readonly DianaEnJuego[];
  /** Numero de tiro (1..10): decide que diana se mueve. */
  n: number;
  /** Reloj (s): donde esta cada diana que se mueve. */
  t: number;
  /** La chapa (m) y cuanto ha girado (grados), o null. */
  chapa: { x: number; y: number; giro: number } | null;
  /** Angulo del brazo de la catapulta (grados, contra las agujas del reloj desde la horizontal). */
  brazo: number;
  /** Mientras se apunta: los puntos del arranque de la trayectoria (m). */
  puntos: readonly { x: number; y: number }[];
  /** La diana que acaba de recibir la chapa, para resaltarla. */
  resaltada: IdDiana | null;
};

export function EscenaTapon({ esc, dianas, n, t, chapa, brazo, puntos, resaltada }: PropsEscena) {
  const { px, py, e } = esc;
  // Primero el camarero: esta DETRAS de la barra y no debe tapar los vasos.
  const orden = [...dianas].sort((a, b) => Number(b.id === 'oreja') - Number(a.id === 'oreja'));
  const camarero = orden[0]?.id === 'oreja' ? orden[0] : null;
  const enBarra = orden.filter((d) => d.id !== 'oreja');
  const rBrillo = 0.2 * e;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Ancho y alto explicitos: en web una Image con left/right no se estira (se quedaba corta). */}
      <Image source={IMG.fondo} resizeMode="cover" style={[styles.abs, { left: 0, top: 0, width: esc.ancho, height: py(0) + 2 }]} />

      {camarero ? (
        <Dibujo src={IMG.camarero} caja={colocar(esc, SPRITES.camarero, posicionDiana(camarero, n, t), 0)} />
      ) : null}

      <Image source={IMG.barra} resizeMode="stretch" style={[styles.abs, { left: 0, top: py(0) - 1, width: esc.ancho, height: esc.alto - py(0) + 1 }]} />

      {enBarra.map((d) => {
        const cx = posicionDiana(d, n, t);
        return (
          <View key={d.id} style={StyleSheet.absoluteFill}>
            {resaltada === d.id ? (
              <View
                style={[styles.brillo, { left: px(cx) - rBrillo, top: py(0.25) - rBrillo, width: rBrillo * 2, height: rBrillo * 2, borderRadius: rBrillo }]}
              />
            ) : null}
            <Dibujo src={IMG[DIBUJO[d.id] as 'vaso' | 'jarra' | 'caja']} caja={colocar(esc, SPRITES[DIBUJO[d.id]], cx, 0)} />
          </View>
        );
      })}
      {resaltada === 'oreja' && camarero ? (
        <View
          style={[
            styles.brillo,
            { left: px(posicionDiana(camarero, n, t)) - rBrillo * 0.6, top: py(0.9) - rBrillo * 0.6, width: rBrillo * 1.2, height: rBrillo * 1.2, borderRadius: rBrillo },
          ]}
        />
      ) : null}

      {/* Punteado del arranque de la trayectoria. */}
      {puntos.map((p, i) => {
        const r = Math.max(3, 5 - i * 0.25);
        return (
          <View
            key={i}
            style={[styles.punto, { left: px(p.x) - r, top: py(p.y) - r, width: r * 2, height: r * 2, borderRadius: r, opacity: 1 - i / (puntos.length + 2) }]}
          />
        );
      })}

      {/* Catapulta: el brazo gira desde su eje (el centro del PNG); la base, encima. */}
      <Dibujo src={IMG.brazo} caja={colocar(esc, SPRITES.brazo, PIVOTE.x, PIVOTE.y)} giro={-brazo} />
      <Dibujo src={IMG.base} caja={colocar(esc, SPRITES.base, 0, 0)} />

      {chapa ? (
        // testID: `npm run verificar:juego` la busca para arrastrar y ver que vuela.
        <View testID="tapon-chapa" style={[styles.abs, colocar(esc, SPRITES.chapa, chapa.x, chapa.y)]}>
          <Image source={IMG.chapa} style={[styles.lleno, { transform: [{ rotate: `${chapa.giro}deg` }] }]} />
        </View>
      ) : null}
    </View>
  );
}

function Dibujo({
  src,
  caja,
  giro,
}: {
  src: ImageSourcePropType;
  caja: { left: number; top: number; width: number; height: number };
  giro?: number;
}) {
  return <Image source={src} resizeMode="stretch" style={[styles.abs, caja, giro ? { transform: [{ rotate: `${giro}deg` }] } : null]} />;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  lleno: { width: '100%', height: '100%' },
  punto: { position: 'absolute', backgroundColor: colors.white, borderWidth: 2, borderColor: colors.beerDark },
  brillo: { position: 'absolute', backgroundColor: 'rgba(255, 236, 150, 0.55)' },
});
