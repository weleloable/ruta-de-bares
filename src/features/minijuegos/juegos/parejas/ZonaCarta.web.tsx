import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import type { PropsZonaCarta } from './ZonaCarta';

/**
 * Donde se toca una carta, en web. NO es un Pressable: con el dedo, RN Web
 * retrasa el inicio de la pulsacion y un toque de menos de ~50 ms se perdia
 * entero (la carta no se daba la vuelta). En un juego de rapidez, los toques
 * rapidos son justo los buenos. Medido con verificar:juego: a 40 ms no entraba
 * ninguno, a 100 ms todos. Mismo patron que BotonMantener.web y ZonaArrastre.web.
 *
 * Aqui cuenta el `pointerdown` del navegador: en cuanto el dedo (o el raton)
 * BAJA, sin esperar a levantarlo. Y como ya no es un Pressable, se da a mano lo
 * que este daba: Enter / Espacio con el foco, y un `click` sin puntero detras
 * (`detail === 0`), que es lo que manda un lector de pantalla al activar.
 */
export function ZonaCarta({ onTocar, testID, accessibilityLabel, desactivada, style, children }: PropsZonaCarta) {
  const nodo = useRef<View>(null);
  // Ref: el manejador del DOM se registra una vez y llama siempre al ultimo.
  const tocar = useRef(onTocar);
  tocar.current = onTocar;

  useEffect(() => {
    const el = nodo.current as unknown as HTMLElement | null;
    if (!el) return undefined;
    // Sin zoom de doble toque ni su espera, sin seleccion ni menu de pulsacion larga.
    el.style.touchAction = 'manipulation';
    el.style.userSelect = 'none';
    el.style.setProperty('-webkit-user-select', 'none');
    el.style.setProperty('-webkit-touch-callout', 'none');
    el.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    el.style.cursor = 'pointer';

    const abajo = (e: PointerEvent) => {
      if (e.button !== 0) return;
      tocar.current();
    };
    // Un clic con puntero ya entro por pointerdown; solo el de un lector o del teclado.
    const clic = (e: MouseEvent) => {
      if (e.detail === 0) tocar.current();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      tocar.current();
    };
    const evitar = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', abajo);
    el.addEventListener('click', clic);
    el.addEventListener('keydown', tecla);
    el.addEventListener('contextmenu', evitar);
    el.addEventListener('selectstart', evitar);
    return () => {
      el.removeEventListener('pointerdown', abajo);
      el.removeEventListener('click', clic);
      el.removeEventListener('keydown', tecla);
      el.removeEventListener('contextmenu', evitar);
      el.removeEventListener('selectstart', evitar);
    };
  }, []);

  return (
    <View
      ref={nodo}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: desactivada }}
      focusable
      style={style}
    >
      {children}
    </View>
  );
}
