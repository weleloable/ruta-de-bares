import { useEffect, useRef } from 'react';

import type { AccionesTeclado } from './teclado';

/** Grados por pulsacion de flecha. */
const PASO = 5;

/**
 * Para probar en PC: espacio mantenido = grifo abierto, flechas = inclinar.
 * Las acciones van en una ref para no reengancharse a `window` en cada render.
 */
export function useTecladoCana(acciones: AccionesTeclado, activo: boolean): void {
  const ref = useRef(acciones);
  ref.current = acciones;

  useEffect(() => {
    if (!activo) return;
    const abajo = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Sin esto la barra espaciadora hace scroll o pulsa el ultimo boton.
        e.preventDefault();
        if (!e.repeat) ref.current.abrir();
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowUp') {
        e.preventDefault();
        ref.current.ajustar(PASO);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') {
        e.preventDefault();
        ref.current.ajustar(-PASO);
      }
    };
    const arriba = (e: KeyboardEvent) => {
      if (e.code === 'Space') ref.current.cerrar();
    };
    window.addEventListener('keydown', abajo);
    window.addEventListener('keyup', arriba);
    return () => {
      window.removeEventListener('keydown', abajo);
      window.removeEventListener('keyup', arriba);
    };
  }, [activo]);
}
