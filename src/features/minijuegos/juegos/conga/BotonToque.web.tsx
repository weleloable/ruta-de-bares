import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Boton que actua en cuanto el dedo TOCA, en web. Escucha `pointerdown`
 * directamente del navegador (como BotonMantener.web.tsx): ni el retraso de
 * Pressable ni su logica de "pulsacion" se meten por medio, y con varios dedos
 * cada boton recibe el suyo.
 *
 * Un "clic" sin puntero detras (el doble toque de TalkBack o VoiceOver) tambien
 * gira; el clic que el navegador manda DESPUES de un toque normal se ignora,
 * para no girar dos veces.
 *
 * La variante nativa (BotonToque.tsx) usa onTouchStart.
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
  const nodo = useRef<View>(null);
  const [pulsado, setPulsado] = useState(false);
  // Ref: el manejador del DOM se registra una vez y lee siempre lo ultimo.
  const toque = useRef(onToque);
  toque.current = onToque;

  useEffect(() => {
    const el = nodo.current as unknown as HTMLElement | null;
    if (!el) return;
    // Sin gestos del navegador sobre el boton: ni desplazar, ni zoom, ni seleccionar, ni menu.
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.style.setProperty('-webkit-user-select', 'none');
    el.style.setProperty('-webkit-touch-callout', 'none');
    el.style.setProperty('-webkit-tap-highlight-color', 'transparent');

    let ultimoPuntero = 0;
    const abajo = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      ultimoPuntero = Date.now();
      setPulsado(true);
      toque.current();
    };
    const arriba = () => setPulsado(false);
    const clic = () => {
      if (Date.now() - ultimoPuntero > 600) toque.current();
    };
    const menu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', abajo);
    el.addEventListener('pointerup', arriba);
    el.addEventListener('pointercancel', arriba);
    el.addEventListener('pointerleave', arriba);
    el.addEventListener('click', clic);
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('pointerdown', abajo);
      el.removeEventListener('pointerup', arriba);
      el.removeEventListener('pointercancel', arriba);
      el.removeEventListener('pointerleave', arriba);
      el.removeEventListener('click', clic);
      el.removeEventListener('contextmenu', menu);
    };
  }, []);

  return (
    <View
      ref={nodo}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[style, pulsado && estiloPulsado]}
    >
      {children}
    </View>
  );
}
