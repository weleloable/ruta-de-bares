import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import type { PropsToqueRapido } from './ToqueRapido';

/**
 * Un boton de Barman Express, en web. NO es un Pressable: con el dedo, RN Web
 * retrasa el inicio de la pulsacion y un toque de menos de ~50 ms se pierde
 * entero (medido en Parejas de Barra: a 40 ms no entraba ninguno). En este
 * juego se toca muy rapido y un toque perdido es un paso que no se hace.
 * Mismo patron que ZonaCarta.web (Parejas), BotonMantener.web y ZonaArrastre.web.
 *
 * Cuenta el `pointerdown` del navegador: en cuanto baja el dedo. Y como ya no es
 * un Pressable, se da a mano lo que daba: Enter / Espacio con el foco y el
 * `click` sin puntero (`detail === 0`) de un lector de pantalla.
 */
export function ToqueRapido({ onToque, accessibilityLabel, testID, desactivado = false, style, children }: PropsToqueRapido) {
  const nodo = useRef<View>(null);
  const toque = useRef(onToque);
  toque.current = onToque;
  const apagado = useRef(desactivado);
  apagado.current = desactivado;

  useEffect(() => {
    const el = nodo.current as unknown as HTMLElement | null;
    if (!el) return undefined;
    // Sin zoom de doble toque (ni su espera), sin seleccion ni menu de pulsacion larga.
    el.style.touchAction = 'manipulation';
    el.style.userSelect = 'none';
    el.style.setProperty('-webkit-user-select', 'none');
    el.style.setProperty('-webkit-touch-callout', 'none');
    el.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    el.style.cursor = 'pointer';
    const disparar = () => {
      if (!apagado.current) toque.current();
    };
    const abajo = (e: PointerEvent) => {
      if (e.button === 0) disparar();
    };
    const clic = (e: MouseEvent) => {
      if (e.detail === 0) disparar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      disparar();
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
      accessibilityState={{ disabled: desactivado }}
      focusable={!desactivado}
      style={style}
    >
      {children}
    </View>
  );
}
