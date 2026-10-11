import { useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Boton que actua en cuanto el dedo TOCA, sin esperar a levantarlo ni a ningun
 * retraso: es la cruceta, y un giro tarde es un choque. No usa Pressable para
 * no depender de su maquina de estados (retrasos, cancelaciones al mover el
 * dedo); `onTouchStart` llega siempre, sin negociar quien es el dueno del toque.
 * Con lector de pantalla, la accion "activar" hace lo mismo.
 *
 * La variante web (BotonToque.web.tsx) escucha `pointerdown` del navegador.
 */
export function BotonToque({
  onToque,
  accessibilityLabel,
  style,
  estiloPulsado,
  children,
}: {
  onToque: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  estiloPulsado?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [pulsado, setPulsado] = useState(false);
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && onToque()}
      onTouchStart={() => {
        setPulsado(true);
        onToque();
      }}
      onTouchEnd={() => setPulsado(false)}
      onTouchCancel={() => setPulsado(false)}
      style={[style, pulsado && estiloPulsado]}
    >
      {children}
    </View>
  );
}
