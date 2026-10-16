import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

export type PropsZonaCarta = {
  onTocar: () => void;
  testID: string;
  accessibilityLabel: string;
  /** Ya vista o emparejada: el lector de pantalla la anuncia como no disponible. */
  desactivada: boolean;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Donde se toca una carta. En nativo, un Pressable con onPress (que es lo que
 * manda tambien el doble toque de TalkBack / VoiceOver). En web hay variante
 * propia (ZonaCarta.web.tsx): ahi un Pressable perdia los toques rapidos con el dedo.
 */
export function ZonaCarta({ onTocar, testID, accessibilityLabel, desactivada, style, children }: PropsZonaCarta) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: desactivada }}
      onPress={onTocar}
      style={style}
    >
      {children}
    </Pressable>
  );
}
