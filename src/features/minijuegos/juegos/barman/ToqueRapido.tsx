import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

export type PropsToqueRapido = {
  onToque: () => void;
  accessibilityLabel: string;
  testID?: string;
  desactivado?: boolean;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Un boton de Barman Express (ingrediente o bebida de la comanda). En nativo, un
 * Pressable con onPress (que tambien es lo que manda el doble toque de TalkBack).
 * En web hay variante propia (ToqueRapido.web.tsx): el ritmo del juego es alto y
 * un Pressable de RN Web perdia los toques rapidos con el dedo.
 */
export function ToqueRapido({ onToque, accessibilityLabel, testID, desactivado = false, style, children }: PropsToqueRapido) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: desactivado }}
      disabled={desactivado}
      onPress={onToque}
      style={style}
    >
      {children}
    </Pressable>
  );
}
