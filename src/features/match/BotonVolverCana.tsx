import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors, space } from '../../lib/theme';

/**
 * Flecha de volver de la ficha y del chat, que siempre acaba en la pestana
 * Cana.
 *
 * La flecha normal vuelve a lo que haya debajo en la pila. Tras recargar (F5)
 * lo que hay debajo lo monta `unstable_settings.anchor`: las pestanas, que
 * arrancan en Sellos. Y de una ficha o un chat siempre se viene de Cana, asi
 * que caer en Sellos despista.
 *
 * Cuando debajo hay una pantalla de verdad (la ficha abierta desde el chat,
 * por ejemplo) se vuelve a ella con normalidad.
 */
export function BotonVolverCana() {
  const router = useRouter();
  const navegacion = useNavigation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver"
      hitSlop={10}
      onPress={() => {
        const estado = navegacion.getState();
        const anterior = estado && estado.index > 0 ? estado.routes[estado.index - 1]?.name : undefined;
        // `navigate` y no `push`: reutiliza las pestanas que ya estan montadas
        // en vez de apilar otra copia encima.
        if (!anterior || anterior === '(tabs)') router.navigate('/cana');
        else router.back();
      }}
      style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
    >
      <Ionicons name="arrow-back" size={24} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: { paddingRight: space.md, paddingVertical: 4 },
  pulsado: { opacity: 0.6 },
});
