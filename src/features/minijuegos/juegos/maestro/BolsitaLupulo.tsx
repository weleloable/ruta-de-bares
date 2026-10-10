import { memo, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '../../../../lib/theme';
import type { EstadoBolsa, MarcaId } from './lupulo';
import { ANCHO_OLLA, MOSTO_ARRIBA, NATIVO, useBucle } from './OllaMaceracion';

/**
 * Bolsitas de lupulo, como las de te: una etiqueta de papel, el hilo y la
 * bolsa de tela con el lupulo dentro. Hay tres usos:
 *  - `BolsaColgante`: la de arriba, sobre su marca de la barra;
 *  - `BolsaVolando`: la que cae a la olla cuando se toca;
 *  - `BolsaEnOlla`: la que se queda flotando en el mosto, con el hilo fuera.
 *
 * Que bolsa toca y cual se perdio lo decide `estadoBolsa` (lupulo.ts); aqui
 * solo se dibuja. La bolsa de AMARGOR es mas oscura y grande (mucho lupulo, el
 * del principio); la de AROMA, mas clara y pequena (un puno, el del final).
 */

export const BOLSA_ANCHO = 38;
/** Alto de todo el conjunto: etiqueta, hilo y bolsa. */
export const BOLSA_ALTO = 70;
/**
 * Las bolsas de arriba se dibujan mas pequenas que las de la olla: el paso tiene
 * que caber en la pantalla sin scroll y arriba solo hace falta reconocerlas.
 */
export const ESCALA_BOLSA_ARRIBA = 0.72;
/** Lo que se mete en el mosto: donde aterriza, respecto a su superficie. */
const HUNDIDA = 30;
/** A cada lado del centro de la olla, para que las dos bolsas no se pisen. */
export const SEPARACION_EN_OLLA = 26;

const TELA: Record<MarcaId, { fondo: string; borde: string; hoja: string }> = {
  amargor: { fondo: '#8DA05A', borde: '#5C6B35', hoja: '#445024' },
  aroma: { fondo: '#C2D08A', borde: '#8A9A55', hoja: '#6C7C3A' },
};

/** La bolsa dibujada y quieta. `suave` es la que aun no toca; `apagada`, la que se perdio. */
export const Bolsita = memo(function Bolsita({
  id,
  apagada = false,
  suave = false,
}: {
  id: MarcaId;
  apagada?: boolean;
  suave?: boolean;
}) {
  const tela = TELA[id];
  const grande = id === 'amargor';
  return (
    <View style={[styles.bolsa, suave && styles.suave, apagada && styles.apagada]}>
      <View style={styles.etiqueta}>
        <View style={styles.agujero} />
      </View>
      <View style={styles.hilo} />
      <View
        style={[
          styles.tela,
          { backgroundColor: tela.fondo, borderColor: tela.borde, height: grande ? 38 : 32, width: grande ? 36 : 30 },
        ]}
      >
        <View style={[styles.pliegue, { backgroundColor: tela.borde }]} />
        {/* Lupulo entrevisto a traves de la tela: dos hojas y un cono. */}
        <View
          style={[styles.hoja, { backgroundColor: tela.hoja, left: 5, top: 12, transform: [{ rotate: '-35deg' }] }]}
        />
        <View
          style={[styles.hoja, { backgroundColor: tela.hoja, right: 5, top: 14, transform: [{ rotate: '35deg' }] }]}
        />
        <View style={[styles.cono, { backgroundColor: tela.borde }]} />
      </View>
    </View>
  );
});

/**
 * La bolsa de arriba. La que toca echar se balancea colgada de su hilo; las
 * demas, quietas. `perdida`: apagada y sin moverse.
 */
export const BolsaColgante = memo(function BolsaColgante({
  id,
  estado,
  escala = ESCALA_BOLSA_ARRIBA,
}: {
  id: MarcaId;
  estado: EstadoBolsa;
  escala?: number;
}) {
  const v = useBucle(1500, id === 'amargor' ? 0 : 400);
  const mover = estado === 'siguiente';
  return (
    <Animated.View
      style={[
        styles.colgante,
        // transformOrigin: la bolsa cuelga del extremo de ARRIBA, no de su centro.
        { transformOrigin: '50% 0%' },
        {
          transform: [
            { scale: escala },
            ...(mover
              ? [
                  {
                    rotate: v.interpolate({
                      inputRange: [0, 0.25, 0.5, 0.75, 1],
                      outputRange: ['0deg', '7deg', '0deg', '-7deg', '0deg'],
                    }),
                  },
                ]
              : []),
          ],
        },
      ]}
    >
      <Bolsita id={id} apagada={estado === 'perdida'} suave={estado === 'pendiente'} />
    </Animated.View>
  );
});

/**
 * Posicion de la bolsa YA en la olla, relativa a la escena de la olla: se usa
 * igual para dibujarla dentro y para saber a donde tiene que llegar la que
 * vuela, asi que aterrizan en el mismo sitio.
 */
export function posicionEnOlla(id: MarcaId): { izquierda: number; arriba: number } {
  const lado = id === 'amargor' ? -1 : 1;
  return {
    izquierda: ANCHO_OLLA / 2 + lado * SEPARACION_EN_OLLA - BOLSA_ANCHO / 2,
    arriba: MOSTO_ARRIBA - (BOLSA_ALTO - HUNDIDA),
  };
}

/** La bolsa que ya esta en el mosto: sube y baja un poco, como flotando en el hervor. */
export const BolsaEnOlla = memo(function BolsaEnOlla({ id }: { id: MarcaId }) {
  const { izquierda, arriba } = posicionEnOlla(id);
  const v = useBucle(1100, id === 'amargor' ? 0 : 300);
  return (
    <Animated.View
      style={[
        styles.enOlla,
        {
          left: izquierda,
          top: arriba,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 3, 0] }) }],
        },
      ]}
    >
      <Bolsita id={id} />
    </Animated.View>
  );
});

/**
 * La bolsa que cae de su sitio de arriba a la olla. Las coordenadas son las de
 * quien la pinta (un overlay absoluto sobre toda la pantalla del paso):
 * `desde` y `hasta` son el punto de ARRIBA en el CENTRO de la bolsa (de ahi
 * cuelga, y es lo que no se mueve al escalar). Va cambiando de tamano de
 * `escalaDesde` (la de arriba) a `escalaHasta` (la de la olla). Al llegar avisa
 * con `alTerminar`, y entonces se quita esta y aparece `BolsaEnOlla`.
 */
export function BolsaVolando({
  id,
  desde,
  hasta,
  escalaDesde = ESCALA_BOLSA_ARRIBA,
  escalaHasta,
  alTerminar,
}: {
  id: MarcaId;
  desde: { x: number; y: number };
  hasta: { x: number; y: number };
  escalaDesde?: number;
  escalaHasta: number;
  alTerminar: () => void;
}) {
  const p = useRef(new Animated.Value(0)).current;
  const fin = useRef(alTerminar);
  fin.current = alTerminar;

  useEffect(() => {
    let vivo = true;
    let animacion: Animated.CompositeAnimation | null = null;
    // Con "reducir movimiento" la bolsa aparece ya en la olla, sin viaje.
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reducir) => {
        if (!vivo) return;
        animacion = Animated.timing(p, {
          toValue: 1,
          duration: reducir ? 1 : 620,
          // Arranca despacio (se despega del hilo) y acelera al caer.
          easing: Easing.in(Easing.cubic),
          useNativeDriver: NATIVO,
        });
        animacion.start(({ finished }) => {
          if (finished) fin.current();
        });
      });
    return () => {
      vivo = false;
      animacion?.stop();
    };
  }, [p]);

  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.volando,
        {
          left: desde.x - BOLSA_ANCHO / 2,
          top: desde.y,
          transformOrigin: '50% 0%',
          transform: [
            { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            // Primero un saltito hacia arriba (-14) y luego cae: se nota que la sueltan.
            { translateY: p.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, -14, dy] }) },
            { rotate: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-14deg', '6deg'] }) },
            { scale: p.interpolate({ inputRange: [0, 1], outputRange: [escalaDesde, escalaHasta] }) },
          ],
        },
      ]}
    >
      <Bolsita id={id} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bolsa: { width: BOLSA_ANCHO + 14, height: BOLSA_ALTO, alignItems: 'center' },
  apagada: { opacity: 0.4 },
  suave: { opacity: 0.8 },
  colgante: { width: BOLSA_ANCHO + 14, height: BOLSA_ALTO, alignItems: 'center' },
  enOlla: { position: 'absolute', width: BOLSA_ANCHO, height: BOLSA_ALTO, alignItems: 'center' },
  volando: { position: 'absolute', width: BOLSA_ANCHO, height: BOLSA_ALTO, alignItems: 'center' },
  etiqueta: {
    width: 14,
    height: 15,
    borderRadius: 2,
    backgroundColor: colors.beerSoft,
    borderWidth: 1,
    borderColor: colors.beerDark,
    alignItems: 'center',
    paddingTop: 2,
  },
  agujero: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.beerDark },
  hilo: { width: 1.5, height: 9, backgroundColor: colors.inkSoft },
  tela: {
    borderWidth: 2,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
    overflow: 'hidden',
  },
  // Costura de arriba: la tela se pliega y se cose, como en una bolsita de te.
  pliegue: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, opacity: 0.55 },
  hoja: { position: 'absolute', width: 11, height: 17, borderRadius: 8, opacity: 0.8 },
  cono: {
    position: 'absolute',
    left: '50%',
    top: 14,
    width: 9,
    height: 12,
    marginLeft: -4.5,
    borderRadius: 5,
    opacity: 0.6,
  },
});
