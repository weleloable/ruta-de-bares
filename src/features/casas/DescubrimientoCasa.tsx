import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

/** En web no hay hilo nativo para animar: alli va por JS (y sin el aviso de RN). */
const nativo = Platform.OS !== 'web';

import { CASAS, type IdCasa } from './casas';
import { Escudo } from './Escudo';
import { useMiCasa } from './MiCasa';

/**
 * "¡Eres de la casa...!": la animacion que sale una sola vez, cuando ya tienes
 * casa y aun no la has visto (al entrar en tu primera ruta, o la primera vez
 * que abres la app tras llegar las casas). El escudo entra girando y rebotando,
 * caen confetis de los colores de la casa y aparece su nombre.
 */
export function DescubrimientoCasa() {
  const { casa, vista, marcarVista } = useMiCasa();
  if (!casa) return null;
  return <AnimacionCasa casa={casa} visible={!vista} onCerrar={() => void marcarVista()} />;
}

/** Los textos de la animacion; por defecto, los de descubrir tu casa. */
export type TextosAnimacion = { antes: string; titulo?: string; lema?: string; explica: string; boton: string };

/**
 * La animacion en si, sin saber de donde sale la casa (se puede ensenar sola).
 * Con otros `textos` sirve para celebrar (el encuentro por QR, 0046).
 */
export function AnimacionCasa({
  casa,
  visible,
  onCerrar,
  textos,
}: {
  casa: IdCasa;
  visible: boolean;
  onCerrar: () => void;
  textos?: TextosAnimacion;
}) {
  const { width, height } = useWindowDimensions();

  const escala = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current;
  const texto = useRef(new Animated.Value(0)).current;
  const confeti = useRef(Array.from({ length: 28 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return;
    escala.setValue(0);
    giro.setValue(0);
    texto.setValue(0);
    // El texto entra a su hora, sin esperar a que el rebote del escudo "termine"
    // (un muelle tarda en darse por parado, y el nombre no puede quedarse sin salir).
    Animated.parallel([
      Animated.sequence([
        Animated.delay(500),
        Animated.parallel([
          Animated.spring(escala, { toValue: 1, friction: 4, tension: 50, useNativeDriver: nativo }),
          Animated.timing(giro, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: nativo }),
        ]),
      ]),
      Animated.sequence([Animated.delay(1500), Animated.timing(texto, { toValue: 1, duration: 450, useNativeDriver: nativo })]),
    ]).start();
    const caidas = confeti.map((v, k) => {
      v.setValue(0);
      return Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: 2200 + (k % 7) * 260,
          delay: 1300 + (k % 5) * 180,
          easing: Easing.linear,
          useNativeDriver: nativo,
        }),
      );
    });
    caidas.forEach((a) => a.start());
    return () => caidas.forEach((a) => a.stop());
  }, [visible, escala, giro, texto, confeti]);

  const c = CASAS[casa];
  const t = textos ?? {
    antes: 'Tu casa es…',
    lema: `«${c.lema}»`,
    explica: 'Todo lo que consigas en la ruta suma para tu casa. ¡A por las otras tres!',
    boton: '¡Vamos!',
  };
  const rotacion = giro.interpolate({ inputRange: [0, 1], outputRange: ['-720deg', '0deg'] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={[styles.fondo, { backgroundColor: c.oscuro }]}>
        {confeti.map((v, k) => {
          const x = ((k * 37) % 100) / 100;
          const color = k % 3 === 0 ? c.detalle : k % 3 === 1 ? c.color : '#FFFFFF';
          return (
            <Animated.View
              key={k}
              pointerEvents="none"
              style={[
                styles.confeti,
                {
                  left: x * width,
                  backgroundColor: color,
                  transform: [
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-30, height + 30] }) },
                    { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(k % 2 ? 1 : -1) * 540}deg`] }) },
                  ],
                },
              ]}
            />
          );
        })}

        <Animated.Text style={[styles.antes, { color: c.detalle, opacity: texto }]}>{t.antes}</Animated.Text>
        <Animated.View style={{ transform: [{ scale: escala }, { rotate: rotacion }] }}>
          <Escudo casa={casa} tamano={Math.min(180, width * 0.45)} />
        </Animated.View>
        <Animated.View style={[styles.textos, { opacity: texto }]}>
          <Text style={[styles.nombre, { color: c.texto }]}>{t.titulo ?? c.nombre}</Text>
          {t.lema ? <Text style={[styles.lema, { color: c.detalle }]}>{t.lema}</Text> : null}
          <Text style={[styles.explica, { color: c.texto }]}>{t.explica}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onCerrar}
            style={({ pressed }) => [styles.boton, { backgroundColor: c.detalle }, pressed && styles.pulsado]}
          >
            <Text style={[styles.botonTexto, { color: c.oscuro }]}>{t.boton}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, overflow: 'hidden' },
  confeti: { position: 'absolute', top: 0, width: 9, height: 14, borderRadius: 2 },
  antes: { fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  textos: { alignItems: 'center', gap: 10, maxWidth: 420 },
  nombre: { fontSize: 38, fontWeight: '900', textAlign: 'center' },
  lema: { fontSize: 18, fontStyle: 'italic', fontWeight: '600', textAlign: 'center' },
  explica: { fontSize: 16, textAlign: 'center', opacity: 0.9 },
  boton: { marginTop: 8, paddingHorizontal: 36, paddingVertical: 14, borderRadius: 999 },
  botonTexto: { fontSize: 19, fontWeight: '900' },
  pulsado: { opacity: 0.85 },
});
