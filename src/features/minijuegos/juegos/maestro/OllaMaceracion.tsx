import { memo, useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../../../../lib/theme';
import { climaOlla, colorMosto, particulaVisible, particulasVisibles } from './maceracion';

/**
 * Olla de maceracion animada, al lado del termometro. Dice lo mismo que la
 * aguja pero se ve de reojo: nieve que cae si el mosto se enfria, vapor que
 * sale si se pasa, burbujas suaves si esta en su punto, y una llamarada debajo
 * cada vez que se toca Calentar. Que se ve y cuanto lo decide `climaOlla`
 * (maceracion.ts, con tests); aqui solo se dibuja.
 *
 * Todo con vistas de React Native y `Animated`, sin SVG ni librerias: cada
 * particula es un bucle que arranca una vez al montar y no se reinicia; lo que
 * cambia con la temperatura es solo si se ve (opacidad). Asi el render de cada
 * fotograma del juego no toca las animaciones.
 */

export const ANCHO_OLLA = 170;
const ALTO = 240;
export const ALTO_OLLA = ALTO;

const VAPORES = 6;
const COPOS = 7;
const BURBUJAS = 4;
/** Vapor que sube de una olla hirviendo: poco, que no tape las bolsitas. */
const VAPOR_HERVOR = 2;

// En web no hay modulo nativo de animacion: avisaria en cada animacion.
export const NATIVO = Platform.OS !== 'web';

/**
 * Un valor que va de 0 a 1 en bucle, empezando con `retraso` ms para que las
 * particulas no salgan a la vez. Con "reducir movimiento" activado en el
 * sistema se queda quieto a la mitad: la nieve o el vapor se siguen viendo
 * (dicen algo del juego), pero sin moverse.
 */
export function useBucle(duracion: number, retraso: number): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let animacion: Animated.CompositeAnimation | null = null;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reducir) => {
        // La pregunta es asincrona: si la olla ya se desmonto, no se arranca nada.
        if (!vivo) return;
        if (reducir) {
          v.setValue(0.5);
          return;
        }
        espera = setTimeout(() => {
          animacion = Animated.loop(
            Animated.timing(v, { toValue: 1, duration: duracion, easing: Easing.linear, useNativeDriver: NATIVO }),
          );
          animacion.start();
        }, retraso);
      });
    return () => {
      vivo = false;
      clearTimeout(espera);
      animacion?.stop();
    };
  }, [v, duracion, retraso]);
  return v;
}

const Vapor = memo(function Vapor({ indice, visible }: { indice: number; visible: boolean }) {
  const duracion = 1600 + (indice % 3) * 250;
  const v = useBucle(duracion, (indice * duracion) / VAPORES);
  const lado = indice % 2 === 0 ? 1 : -1;
  return (
    <Animated.View
      style={[
        styles.vapor,
        { left: 34 + (indice * 92) / (VAPORES - 1), opacity: visible ? 1 : 0 },
        {
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -92] }) },
            { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6 * lado, -4 * lado] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.9] }) },
          ],
        },
      ]}
    >
      <Animated.View
        style={[styles.vaporNube, { opacity: v.interpolate({ inputRange: [0, 0.2, 0.7, 1], outputRange: [0, 0.9, 0.5, 0] }) }]}
      />
    </Animated.View>
  );
});

const Copo = memo(function Copo({ indice, visible }: { indice: number; visible: boolean }) {
  const duracion = 1900 + (indice % 4) * 300;
  const v = useBucle(duracion, (indice * duracion) / COPOS);
  const lado = indice % 2 === 0 ? 1 : -1;
  return (
    <Animated.Text
      style={[
        styles.copo,
        { left: 22 + (indice * 116) / (COPOS - 1), fontSize: 17 + (indice % 3) * 5, opacity: visible ? 1 : 0 },
        {
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 112] }) },
            { translateX: v.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0, 7 * lado, -7 * lado, 0] }) },
            { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${180 * lado}deg`] }) },
          ],
        },
      ]}
    >
      {/* U+FE0E: el copo como letra y no como emoji, para que respete el color. */}
      {'❄︎'}
    </Animated.Text>
  );
});

const Burbuja = memo(function Burbuja({ indice, visible }: { indice: number; visible: boolean }) {
  const duracion = 900 + indice * 170;
  const v = useBucle(duracion, indice * 260);
  return (
    <Animated.View
      style={[
        styles.burbuja,
        { left: 44 + indice * 22, bottom: BORDE_ABAJO + 8 + (indice % 2) * 5, opacity: visible ? 1 : 0 },
        {
          transform: [{ scale: v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 0] }) }],
        },
      ]}
    />
  );
});

/** Llama del fogon: tiembla sola y da una llamarada en cada toque (`pulsos` cambia). */
const Llama = memo(function Llama({ pulsos }: { pulsos: number }) {
  const temblor = useBucle(420, 0);
  const empuje = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pulsos === 0) return;
    // Llamarada: crece de golpe y vuelve despacio, para que se vea aunque se toque rapido.
    empuje.setValue(1.9);
    Animated.spring(empuje, { toValue: 1, friction: 6, tension: 40, useNativeDriver: NATIVO }).start();
  }, [pulsos, empuje]);

  const escala = Animated.multiply(empuje, temblor.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 1.08, 0.9] }));

  return (
    <View style={styles.fogon}>
      {[-1, 0, 1].map((x) => (
        <Animated.View
          key={x}
          style={[
            styles.lengua,
            { marginHorizontal: 3, transform: [{ translateY: 6 }, { scaleY: escala }, { translateY: -6 }] },
          ]}
        >
          <View style={[styles.gota, styles.gotaFuera, x === 0 && styles.gotaCentro]} />
          <View style={[styles.gota, styles.gotaDentro]} />
        </Animated.View>
      ))}
    </View>
  );
});

function texto(modo: 'frio' | 'justo' | 'caliente'): string {
  if (modo === 'frio') return 'Se está enfriando';
  if (modo === 'caliente') return 'Demasiado caliente';
  return 'En su punto';
}

/**
 * `hervor` es la olla del paso del lupulo: hirviendo a fuego vivo, con burbujas
 * y un poco de vapor, y sin la lectura de frio o calor (alli la temperatura no
 * se juega). `hijos` se pinta DENTRO de la escena, sobre el mosto: las bolsitas
 * de lupulo que van cayendo. Estan en el mismo sistema de coordenadas que la
 * olla (`MOSTO_ARRIBA` es la superficie), para que lo que cae aterrice justo.
 */
export function OllaMaceracion({
  temp = 65,
  pulsos,
  hervor = false,
  hijos,
}: {
  temp?: number;
  pulsos: number;
  hervor?: boolean;
  hijos?: ReactNode;
}) {
  const clima = hervor ? ({ modo: 'justo', intensidad: 0 } as const) : climaOlla(temp);
  const vapores = hervor ? VAPOR_HERVOR : clima.modo === 'caliente' ? particulasVisibles(clima, VAPORES) : 0;
  const copos = clima.modo === 'frio' ? particulasVisibles(clima, COPOS) : 0;

  return (
    <View style={styles.raiz} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.escena}>
        {Array.from({ length: COPOS }, (_, i) => (
          <Copo key={`c${i}`} indice={i} visible={particulaVisible(i, copos, COPOS)} />
        ))}

        <Llama pulsos={pulsos} />
        <View style={styles.parrilla} />

        <View style={styles.asaIzq} />
        <View style={styles.asaDer} />
        <View style={styles.cuerpo}>
          <View style={styles.brillo} />
          {/* Escarcha si se enfria, brasa abajo si se pasa: el metal tambien lo cuenta. */}
          <View
            style={[styles.tinte, { backgroundColor: '#BFE3F5', opacity: clima.modo === 'frio' ? clima.intensidad * 0.55 : 0 }]}
          />
          <View
            style={[styles.brasa, { opacity: clima.modo === 'caliente' ? clima.intensidad * 0.5 : 0 }]}
          />
        </View>
        <View style={styles.borde} />
        <View style={[styles.mosto, { backgroundColor: colorMosto(temp) }]} />

        {Array.from({ length: BURBUJAS }, (_, i) => (
          <Burbuja key={`b${i}`} indice={i} visible={clima.modo === 'justo'} />
        ))}
        {hijos}
        {Array.from({ length: VAPORES }, (_, i) => (
          <Vapor key={`v${i}`} indice={i} visible={particulaVisible(i, vapores, VAPORES)} />
        ))}
      </View>
      <Text
        style={[
          typography.muted,
          styles.estado,
          clima.modo === 'justo' && { color: hervor ? colors.beerDark : colors.green },
          clima.modo === 'frio' && { color: '#3E78A8' },
          clima.modo === 'caliente' && { color: colors.stamp },
        ]}
      >
        {hervor ? 'Hirviendo' : texto(clima.modo)}
      </Text>
    </View>
  );
}

const ACERO = '#77716B';
const ACERO_OSCURO = '#4E4945';

// Medidas de la escena, de abajo arriba: fogon, parrilla, cuerpo, borde y mosto.
const FOGON = 30;
const PARRILLA = 6;
const CUERPO_ANCHO = 124;
const CUERPO_ALTO = 92;
const CUERPO_ABAJO = FOGON + PARRILLA;
const BORDE_ABAJO = CUERPO_ABAJO + CUERPO_ALTO - 15;
/** Donde esta la superficie del mosto, medida desde arriba de la escena. */
export const MOSTO_ARRIBA = ALTO - (BORDE_ABAJO + 5 + 20);

const styles = StyleSheet.create({
  raiz: { width: ANCHO_OLLA, alignItems: 'center' },
  escena: { width: ANCHO_OLLA, height: ALTO, overflow: 'hidden' },
  estado: { fontWeight: '800', textAlign: 'center' },

  fogon: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: FOGON,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  lengua: { width: 22, height: 26, alignItems: 'center', justifyContent: 'flex-end' },
  // Gota de llama: un cuadrado redondeado con una esquina en punta, girado para que la punta mire arriba.
  gota: { position: 'absolute', bottom: 2, borderRadius: 999, borderTopLeftRadius: 0, transform: [{ rotate: '45deg' }] },
  gotaFuera: { width: 18, height: 18, backgroundColor: '#E8742A' },
  gotaCentro: { width: 21, height: 21 },
  gotaDentro: { width: 10, height: 10, bottom: 3, backgroundColor: '#F6C343' },
  parrilla: {
    position: 'absolute',
    bottom: FOGON,
    left: (ANCHO_OLLA - 112) / 2,
    width: 112,
    height: PARRILLA,
    borderRadius: 3,
    backgroundColor: ACERO_OSCURO,
  },

  cuerpo: {
    position: 'absolute',
    bottom: CUERPO_ABAJO,
    left: (ANCHO_OLLA - CUERPO_ANCHO) / 2,
    width: CUERPO_ANCHO,
    height: CUERPO_ALTO,
    backgroundColor: ACERO,
    borderWidth: 2,
    borderColor: ACERO_OSCURO,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  brillo: {
    position: 'absolute',
    left: 12,
    top: 18,
    width: 10,
    height: 58,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tinte: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  brasa: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, backgroundColor: '#E4572E' },
  asaIzq: {
    position: 'absolute',
    bottom: BORDE_ABAJO - 14,
    left: (ANCHO_OLLA - CUERPO_ANCHO) / 2 - 13,
    width: 16,
    height: 11,
    borderRadius: 4,
    backgroundColor: ACERO_OSCURO,
  },
  asaDer: {
    position: 'absolute',
    bottom: BORDE_ABAJO - 14,
    right: (ANCHO_OLLA - CUERPO_ANCHO) / 2 - 13,
    width: 16,
    height: 11,
    borderRadius: 4,
    backgroundColor: ACERO_OSCURO,
  },
  // Boca de la olla vista un poco desde arriba: un aro de acero y el mosto dentro.
  borde: {
    position: 'absolute',
    bottom: BORDE_ABAJO,
    left: (ANCHO_OLLA - 140) / 2,
    width: 140,
    height: 30,
    borderRadius: 70,
    backgroundColor: ACERO,
    borderWidth: 2,
    borderColor: ACERO_OSCURO,
  },
  mosto: {
    position: 'absolute',
    bottom: BORDE_ABAJO + 5,
    left: (ANCHO_OLLA - 120) / 2,
    width: 120,
    height: 20,
    borderRadius: 60,
  },
  burbuja: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFF3D6',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  vapor: { position: 'absolute', bottom: BORDE_ABAJO + 14, width: 24, height: 24 },
  vaporNube: { flex: 1, borderRadius: 12, backgroundColor: 'rgba(120,110,100,0.38)' },
  copo: { position: 'absolute', top: 0, color: '#4A8CC4', fontWeight: '700' },
});
