import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Boton de MANTENER pulsado, en nativo: un Pressable que NO se puede cancelar
 * (`cancelable={false}`), para que nada le quite el toque a mitad mientras se
 * mantiene (un desplazamiento, otra vista que pida el toque). Solo se suelta al
 * levantar el dedo.
 *
 * Limite: con un solo "dueno" del toque, mientras se mantiene no se puede mover
 * a la vez el deslizador de inclinacion. En nativo se inclina con el
 * acelerometro, asi que el deslizador es solo el plan B. La version web
 * (BotonMantener.web.tsx) escucha el dedo directamente y si admite dos dedos.
 */
export function BotonMantener({
  onApretar,
  onSoltar,
  disabled = false,
  style,
  estiloPulsado,
  accessibilityLabel,
  accessibilityHint,
  children,
}: {
  onApretar: () => void;
  onSoltar: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  estiloPulsado?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  accessibilityHint?: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      cancelable={false}
      onPressIn={onApretar}
      onPressOut={onSoltar}
      style={({ pressed }) => [style, pressed && estiloPulsado]}
    >
      {children}
    </Pressable>
  );
}
