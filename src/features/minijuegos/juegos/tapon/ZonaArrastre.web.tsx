import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { desdePantallaGirada } from './escena';
import type { PropsZonaArrastre } from './ZonaArrastre';

/**
 * Zona de tirachinas, en web. Escucha los Pointer Events del navegador y
 * CAPTURA el puntero al empezar (como BotonMantener.web.tsx): el arrastre sigue
 * siendo suyo aunque el dedo salga de la zona, y ningun otro elemento ni el
 * sistema de toques de React Native se lo queda a medias.
 *
 * Sin gestos del navegador encima: `touch-action: none` (si no, arrastrar hacia
 * abajo desplaza la pagina o recarga, y el navegador manda `pointercancel`),
 * sin seleccion de texto ni menu de pulsacion larga.
 *
 * Con `girado` (movil en vertical, juego tumbado) el rectangulo de pantalla
 * esta girado y las coordenadas se deshacen con `desdePantallaGirada`.
 *
 * Solo cuenta el PRIMER dedo: un segundo dedo mientras se apunta se ignora en
 * vez de mover la flecha a saltos. Perder la captura (cambio de pestana, el
 * navegador se lleva el gesto) anula el tiro.
 */
export function ZonaArrastre({ onInicio, onMover, onSoltar, onCancelar, girado, onLayout, style, accessibilityLabel, children }: PropsZonaArrastre) {
  const nodo = useRef<View>(null);
  // Refs: los manejadores del DOM se registran una vez y leen siempre lo ultimo.
  const cb = useRef({ onInicio, onMover, onSoltar, onCancelar });
  cb.current = { onInicio, onMover, onSoltar, onCancelar };
  const giro = useRef(girado);
  giro.current = girado;

  useEffect(() => {
    const el = nodo.current as unknown as HTMLElement | null;
    if (!el) return;
    el.style.touchAction = 'none';
    el.style.userSelect = 'none';
    el.style.setProperty('-webkit-user-select', 'none');
    el.style.setProperty('-webkit-touch-callout', 'none');
    el.style.setProperty('-webkit-tap-highlight-color', 'transparent');

    let activo: number | null = null;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (giro.current) return desdePantallaGirada(r, e.clientX, e.clientY);
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const abajo = (e: PointerEvent) => {
      if (activo !== null || e.button !== 0) return;
      const [x, y] = local(e);
      if (!cb.current.onInicio(x, y)) return;
      e.preventDefault();
      activo = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Sin captura sigue funcionando mientras el dedo no salga de la zona.
      }
    };
    const mover = (e: PointerEvent) => {
      if (e.pointerId !== activo) return;
      e.preventDefault();
      const [x, y] = local(e);
      cb.current.onMover(x, y);
    };
    const arriba = (e: PointerEvent) => {
      if (e.pointerId !== activo) return;
      activo = null;
      const [x, y] = local(e);
      cb.current.onSoltar(x, y);
    };
    const cancelar = (e: PointerEvent) => {
      if (e.pointerId !== activo) return;
      activo = null;
      cb.current.onCancelar();
    };
    const evitar = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', abajo);
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', arriba);
    el.addEventListener('pointercancel', cancelar);
    // Tras pointerup tambien se pierde la captura, pero `activo` ya es null y no anula nada.
    el.addEventListener('lostpointercapture', cancelar);
    el.addEventListener('contextmenu', evitar);
    el.addEventListener('selectstart', evitar);
    return () => {
      el.removeEventListener('pointerdown', abajo);
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', arriba);
      el.removeEventListener('pointercancel', cancelar);
      el.removeEventListener('lostpointercapture', cancelar);
      el.removeEventListener('contextmenu', evitar);
      el.removeEventListener('selectstart', evitar);
    };
  }, []);

  return (
    <View ref={nodo} accessibilityLabel={accessibilityLabel} onLayout={onLayout} style={style}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {children}
      </View>
    </View>
  );
}
