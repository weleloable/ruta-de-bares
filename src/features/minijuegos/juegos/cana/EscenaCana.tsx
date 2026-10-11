import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../../../lib/theme';
import { bordesDeDerrame, impactoChorro, profundidadSuperficie, regueroPared } from './escena';

/**
 * El dibujo de La Caña Perfecta: el tirador, la jarra y el chorro. Solo pinta;
 * lo que hay en la jarra lo decide `modelo.ts` y donde cae el chorro, `escena.ts`.
 *
 * Con Views y no con SVG, por lo mismo que `VasoCana`: react-native-svg es un
 * modulo nativo y obligaria a recompilar el development build.
 *
 * Todo cuelga de un punto: el centro de la boca de la jarra (PIVOTE). La jarra
 * gira sobre el (asi sigue bajo el grifo), el chorro cae en vertical hasta el y
 * la cerveza se pinta en el marco del MUNDO, plana aunque la jarra se incline.
 *
 * Lo que hace que se lea cada cosa (lo cazo un critico en frio sobre capturas):
 *  - tirador: la torre que baja y la palanca ALTA; una palanca corta parecia un
 *    grano de cafe y un brazo lateral, un toallero;
 *  - chorro: ambar macizo que sale de un cuello mas ancho; con rayas blancas
 *    parecia una pajita, y con un disco blanco al final, el embolo de una cafetera;
 *  - jarra: achaparrada, vidrio translucido y culo gordo; alta y con un borde
 *    saliente parecia una jarra medidora.
 */

/** Interior de la jarra (donde cabe la cerveza), en px. Proporcion de jarra, no de tubo. */
export const INTERIOR = { ancho: 132, alto: 186 } as const;
const PARED = 6;
/** Culo de vidrio grueso. */
const BASE = 14;
const ANCHO_JARRA = INTERIOR.ancho + 2 * PARED;
const ALTO_JARRA = INTERIOR.alto + BASE;

const ANCHO = 260;
const PIVOTE_X = ANCHO / 2;
/** Donde acaba la boquilla del grifo (ver `cuerpoGrifo`, `pico` y `boquilla`). */
const PICO_Y = 102;
/**
 * Del pico a la boca de la jarra. A 60 grados la esquina alta de la boca sube
 * 61 px: con menos caida se metia en el cuerpo del grifo.
 */
const CAIDA = 30;
const PIVOTE_Y = PICO_Y + CAIDA;
/** La barra del bar: la jarra se sirve en el aire, encima de ella, y ahi cae lo derramado. */
const BARRA_Y = PIVOTE_Y + ALTO_JARRA + 14;
/** Alto total reservado: el charco ya tiene su hueco y su aparicion no mueve nada. */
export const ALTO_ESCENA = BARRA_Y + 4;

/** Cuanto gira el tirador cuando se abre (sobre su base). */
const GIRO_PALANCA = 28;

/** Burbujas que suben por la cerveza: posicion x (respecto al centro) y desfase. */
const BURBUJAS = [
  [-48, 0],
  [-28, 70],
  [-8, 140],
  [12, 30],
  [32, 110],
  [52, 180],
  [-38, 200],
  [22, 160],
] as const;
/** Puntitos de la espuma (x, y desde su borde de arriba, tamano). */
const POROS = [
  [-54, 4, 4],
  [-34, 9, 3],
  [-16, 3, 5],
  [4, 8, 3],
  [22, 2, 4],
  [40, 7, 5],
  [56, 3, 3],
  [-44, 15, 3],
  [10, 16, 4],
  [46, 14, 3],
] as const;
/** Regueros por fuera de la pared al derramar: (y desde la boca, largo). */
const CHORRETONES = [
  [0, 30],
  [0, 16],
  [0, 46],
] as const;

type Props = {
  /** Giro de la jarra en grados (positivo = a la derecha, sentido horario). */
  inclinado: number;
  /** 0 cerrado, 1 abierto del todo (ya suavizado). */
  palanca: number;
  /** Segundos desde que se monto: mueve las burbujas y el chorro. */
  tiempo: number;
  /** Fracciones de la jarra, como en `modelo.ts`. */
  liquido: number;
  espuma: number;
  sirviendo: boolean;
  derramando: boolean;
  /** 0..1: lo grande que es el charco. */
  derramado: number;
};

export function EscenaCana(props: Props) {
  // Encima van la cabecera del juego y el aviso; debajo, los controles. En un movil bajo no
  // cabe a tamano real y, sin escalar, se montaba sobre la cabecera. Nunca crece de 1.
  const [hueco, setHueco] = useState(ALTO_ESCENA);
  const escala = Math.min(1, Math.max(hueco, 1) / ALTO_ESCENA);
  return (
    <View style={styles.hueco} onLayout={(e) => setHueco(e.nativeEvent.layout.height)}>
      <View style={{ width: ANCHO * escala, height: ALTO_ESCENA * escala }}>
        <View
          style={[styles.escena, { transform: [{ scale: escala }], transformOrigin: 'left top' }]}
          pointerEvents="none"
          aria-hidden
          importantForAccessibility="no-hide-descendants"
        >
          <Dibujo {...props} />
        </View>
      </View>
    </View>
  );
}

function Dibujo({ inclinado, palanca, tiempo, liquido, espuma, sirviendo, derramando, derramado }: Props) {
  const supLiquido = profundidadSuperficie(inclinado, liquido, INTERIOR);
  const supArriba = profundidadSuperficie(inclinado, liquido + espuma, INTERIOR);
  const impacto = impactoChorro(inclinado, supArriba, INTERIOR);
  const reguero = sirviendo ? regueroPared(inclinado, impacto, supArriba, INTERIOR) : null;
  const largoChorro = CAIDA + impacto.distancia;
  const hayCerveza = liquido > 0.01;
  // Por donde se sale: el borde bajo (recto, los dos). En el marco de la jarra es solo un lado.
  const bordes = bordesDeDerrame(inclinado, ANCHO_JARRA / 2);
  const ladosDerrame: (1 | -1)[] = bordes.length === 2 ? [-1, 1] : [inclinado > 0 ? 1 : -1];
  const anchoCharco = 30 + Math.min(derramado, 1) * 90;
  const oscila = Math.sin(tiempo * 18);

  return (
    <>
      {/* ---- Barra del bar. */}
      <View style={styles.barra} />

      {/* ---- Tirador: torre cromada que baja, cuerpo con el pico y palanca alta. */}
      <View style={styles.torre}>
        <View style={styles.torreBrillo} />
      </View>
      {/* Soporte arriba: sin el, la torre empezaba en el aire. */}
      <View style={styles.soporte} />
      <View
        style={[styles.palanca, { transform: [{ rotate: `${palanca * GIRO_PALANCA}deg` }], transformOrigin: 'bottom' }]}
      >
        <View style={styles.palancaTapa} />
        <View style={styles.palancaMango}>
          <View style={styles.etiqueta} />
          <View style={styles.mangoBrillo} />
        </View>
        <View style={styles.casquillo} />
      </View>
      <View style={styles.cuerpoGrifo}>
        <View style={styles.cuerpoBrillo} />
      </View>
      <View style={styles.pico} />
      <View style={styles.boquilla} />

      {/* ---- Jarra. Gira sobre la boca (transformOrigin 'top' = centro de la boca). */}
      <View
        testID="vaso-cana"
        style={[styles.jarra, { transform: [{ rotate: `${inclinado}deg` }], transformOrigin: 'top' }]}
      >
        {/* Lo que se sale resbala por FUERA de la pared baja: detras del asa. */}
        {derramando
          ? ladosDerrame.flatMap((lado) =>
              CHORRETONES.map(([y, largo], i) => (
                <View
                  key={`${lado}${i}`}
                  style={[
                    styles.chorreton,
                    lado > 0 ? { left: ANCHO_JARRA - 2 + i * 1.5 } : { left: -2 - i * 1.5 },
                    { top: y, height: largo + 6 * Math.sin(tiempo * 4 + i) },
                  ]}
                />
              )),
            )
          : null}
        <View style={styles.asa} />
        <View style={styles.cristal}>
          <View testID="vaso-cana-interior" style={styles.interior}>
            {/* El MUNDO: deshace el giro de la jarra para que la cerveza quede plana.
                El recorte lo pone `interior` (overflow hidden), no este. */}
            <View style={[styles.mundo, { transform: [{ rotate: `${-inclinado}deg` }] }]}>
              <View style={[styles.liquido, { top: supLiquido }]} />
              {/* Una lamina de crema siempre: la cerveza recien tirada nunca es un bloque liso. */}
              {hayCerveza ? <View style={[styles.crema, { top: supLiquido - 2 }]} /> : null}
              {hayCerveza
                ? BURBUJAS.map(([x, fase], i) => {
                    const y = supLiquido + 6 + ((((fase - tiempo * 34) % 220) + 220) % 220);
                    return <View key={i} style={[styles.burbuja, { left: x, top: y }]} />;
                  })
                : null}
              {supLiquido - supArriba > 0.5 ? (
                <View style={[styles.espuma, { top: supArriba, height: supLiquido - supArriba }]}>
                  {POROS.map(([x, y, t], i) =>
                    y + t < supLiquido - supArriba ? (
                      <View key={i} style={[styles.poro, { left: 150 + x, top: y, width: t, height: t }]} />
                    ) : null,
                  )}
                </View>
              ) : null}
            </View>
            {reguero ? (
              <>
                {/* El golpe contra la pared, por dentro (aqui recorta el interior). */}
                <View
                  style={[
                    styles.golpePared,
                    reguero.lado > 0 ? { right: 0 } : { left: 0 },
                    { top: reguero.desde - 5, width: 14 + 2 * oscila },
                  ]}
                />
                <View
                  style={[
                    styles.reguero,
                    reguero.lado > 0 ? { right: 0 } : { left: 0 },
                    { top: reguero.desde, height: reguero.hasta - reguero.desde },
                  ]}
                />
                {/* Donde el reguero entra en la cerveza: espuma y burbujas. */}
                <View
                  style={[
                    styles.entrada,
                    reguero.lado > 0 ? { right: 0 } : { left: 0 },
                    { top: reguero.hasta - 5, width: 16 + 3 * oscila },
                  ]}
                />
              </>
            ) : null}
            {/* Brillos del cristal, por encima de la cerveza: es lo que la hace parecer de vidrio. */}
            <View style={styles.reflejo} />
            <View style={styles.reflejoFino} />
          </View>
        </View>
        <View style={styles.borde} />
      </View>

      {/* ---- Chorro: cae en vertical y acaba donde choca (ver escena.ts). Encima de la jarra. */}
      {sirviendo ? (
        <>
          <View testID="chorro-cana" style={[styles.chorro, { height: largoChorro }]}>
            <View style={styles.chorroBrillo} />
          </View>
          <View style={styles.chorroCuello} />
        </>
      ) : null}
      {sirviendo && impacto.contra !== 'pared' ? (
        <>
          {/* El chorro removiendo la espuma: se mete en ella, no se posa encima. */}
          <View style={[styles.salpicadura, { top: PIVOTE_Y + impacto.distancia - 3, width: 20 + 3 * oscila, marginLeft: -10 - 1.5 * oscila }]} />
          <View style={[styles.gotita, { top: PIVOTE_Y + impacto.distancia - 9 - 2 * oscila, marginLeft: -11 }]} />
          <View style={[styles.gotita, { top: PIVOTE_Y + impacto.distancia - 11 + 2 * oscila, marginLeft: 7 }]} />
        </>
      ) : null}

      {/* ---- Derrame: gotas que caen del borde bajo y el charco en la barra, debajo. */}
      {derramando
        ? bordes.map((b, i) => {
            const desde = PIVOTE_Y + b.y;
            const caida = BARRA_Y - desde;
            return [0, 0.5].map((fase) => (
              <View
                key={`${i}-${fase}`}
                style={[styles.gota, { left: PIVOTE_X + b.x - 2.5, top: desde + (((tiempo * 1.6 + fase) % 1) * caida) }]}
              />
            ));
          })
        : null}
      {derramado > 0
        ? bordes.map((b, i) => (
            <View
              key={i}
              style={[styles.charco, { left: PIVOTE_X + b.x - anchoCharco / 2, width: anchoCharco }]}
            />
          ))
        : null}
    </>
  );
}

const CROMO = '#C9C4BC';
const CROMO_OSCURO = '#8F8A82';
const CROMO_BRILLO = '#F4F1EC';
const VIDRIO = 'rgba(112, 96, 80, 0.7)';
const CERVEZA = '#D98A1E';
const ESPUMA = '#FFFCF5';

const styles = StyleSheet.create({
  hueco: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end' },
  escena: { position: 'absolute', left: 0, top: 0, width: ANCHO, height: ALTO_ESCENA },

  barra: { position: 'absolute', left: 0, right: 0, top: BARRA_Y, height: 3, borderRadius: 2, backgroundColor: colors.borderStrong },

  // Tirador. La torre baja desde arriba al lado izquierdo del cuerpo; la palanca, al derecho.
  torre: {
    position: 'absolute',
    left: PIVOTE_X - 27,
    top: 0,
    width: 18,
    height: 62,
    backgroundColor: CROMO,
    borderLeftWidth: 1,
    borderRightWidth: 2,
    borderColor: CROMO_OSCURO,
  },
  soporte: { position: 'absolute', left: PIVOTE_X - 50, top: 0, width: 64, height: 9, borderRadius: 4, backgroundColor: CROMO_OSCURO },
  torreBrillo: { position: 'absolute', left: 3, top: 0, bottom: 0, width: 3, backgroundColor: CROMO_BRILLO },
  palanca: { position: 'absolute', left: PIVOTE_X + 4, top: 2, width: 18, height: 58, alignItems: 'center' },
  palancaTapa: { width: 18, height: 7, borderRadius: 3, backgroundColor: '#2A1A0E' },
  palancaMango: {
    width: 14,
    height: 44,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    backgroundColor: '#3A2414',
    overflow: 'hidden',
  },
  etiqueta: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 3,
    height: 14,
    backgroundColor: colors.beer,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.beerSoft,
  },
  mangoBrillo: { position: 'absolute', left: 2, top: 20, bottom: 6, width: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  casquillo: { width: 10, height: 7, backgroundColor: CROMO_OSCURO },
  cuerpoGrifo: {
    position: 'absolute',
    left: PIVOTE_X - 32,
    top: 58,
    width: 64,
    height: 26,
    borderRadius: 11,
    backgroundColor: CROMO,
    borderBottomWidth: 3,
    borderBottomColor: CROMO_OSCURO,
    overflow: 'hidden',
  },
  cuerpoBrillo: { position: 'absolute', left: 6, right: 6, top: 3, height: 3, borderRadius: 2, backgroundColor: CROMO_BRILLO },
  pico: {
    position: 'absolute',
    left: PIVOTE_X - 6,
    top: 82,
    width: 12,
    height: 16,
    backgroundColor: CROMO_OSCURO,
    borderLeftWidth: 3,
    borderLeftColor: CROMO,
  },
  boquilla: { position: 'absolute', left: PIVOTE_X - 9, top: PICO_Y - 7, width: 18, height: 7, borderRadius: 3, backgroundColor: CROMO },

  // Jarra
  jarra: { position: 'absolute', left: PIVOTE_X - ANCHO_JARRA / 2, top: PIVOTE_Y, width: ANCHO_JARRA, height: ALTO_JARRA },
  asa: {
    position: 'absolute',
    // Se mete 6 px en la pared: unida, no pegada al lado.
    left: ANCHO_JARRA - 6,
    top: 30,
    width: 50,
    height: 124,
    borderWidth: 12,
    borderLeftWidth: 0,
    borderColor: VIDRIO,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
  },
  cristal: {
    width: ANCHO_JARRA,
    height: ALTO_JARRA,
    borderWidth: PARED,
    borderTopWidth: 0,
    borderBottomWidth: BASE,
    borderColor: VIDRIO,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  // Recorta la cerveza a la forma de la jarra. Hijo aparte (y no overflow en `cristal`):
  // en nativo los hijos pintan encima del borde del padre.
  interior: {
    width: INTERIOR.ancho,
    height: INTERIOR.alto,
    overflow: 'hidden',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    // Vidrio: mas claro y frio que el papel. Aun asi la espuma lleva borde para no perderse.
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  mundo: { position: 'absolute', left: INTERIOR.ancho / 2, top: 0, width: 0, height: 0, transformOrigin: 'left top' },
  liquido: { position: 'absolute', left: -300, width: 600, height: 600, backgroundColor: colors.beer },
  crema: { position: 'absolute', left: -300, width: 600, height: 5, backgroundColor: '#F3D9A8' },
  burbuja: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 236, 190, 0.75)' },
  espuma: {
    position: 'absolute',
    left: -150,
    width: 300,
    backgroundColor: ESPUMA,
    borderTopWidth: 2,
    borderTopColor: '#E9D5B0',
    borderBottomWidth: 2,
    borderBottomColor: '#F3D9A8',
    overflow: 'hidden',
  },
  poro: { position: 'absolute', borderRadius: 3, backgroundColor: '#EFE2CB' },
  reguero: { position: 'absolute', width: 5, backgroundColor: CERVEZA },
  golpePared: { position: 'absolute', height: 10, borderRadius: 5, backgroundColor: ESPUMA, borderWidth: 1, borderColor: '#E9D5B0' },
  entrada: { position: 'absolute', height: 7, borderRadius: 4, backgroundColor: ESPUMA, borderWidth: 1, borderColor: '#E9D5B0' },
  reflejo: { position: 'absolute', left: 9, top: 10, bottom: 14, width: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  reflejoFino: { position: 'absolute', left: 21, top: 18, bottom: 26, width: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.4)' },
  // El canto de la boca: del ancho de la jarra, sin sobresalir, y mas claro que las paredes.
  borde: { position: 'absolute', left: 0, right: 0, top: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(170, 156, 140, 0.95)' },
  chorreton: { position: 'absolute', width: 4, borderRadius: 2, backgroundColor: CERVEZA, opacity: 0.9 },

  // Chorro
  chorro: {
    position: 'absolute',
    left: PIVOTE_X - 4,
    top: PICO_Y,
    width: 8,
    backgroundColor: CERVEZA,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    overflow: 'hidden',
  },
  // Nucleo mas claro: el chorro tiene volumen, no es una linea plana.
  chorroBrillo: { position: 'absolute', left: 3, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255, 214, 140, 0.85)' },
  // Sale mas ancho de la boquilla y se estrecha: se ve que brota de ahi.
  chorroCuello: { position: 'absolute', left: PIVOTE_X - 5.5, top: PICO_Y, width: 11, height: 10, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, backgroundColor: CERVEZA },
  salpicadura: { position: 'absolute', left: PIVOTE_X, height: 6, borderRadius: 3, backgroundColor: ESPUMA, borderWidth: 1, borderColor: '#E9D5B0' },
  gotita: { position: 'absolute', left: PIVOTE_X, width: 4, height: 4, borderRadius: 2, backgroundColor: ESPUMA, borderWidth: 1, borderColor: '#E9D5B0' },
  gota: { position: 'absolute', width: 5, height: 8, borderRadius: 3, backgroundColor: CERVEZA },
  charco: { position: 'absolute', top: BARRA_Y - 4, height: 6, borderRadius: 3, backgroundColor: CERVEZA, opacity: 0.85 },
});
