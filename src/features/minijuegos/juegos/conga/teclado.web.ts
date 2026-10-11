import { useEffect, useRef } from 'react';

import type { Dir } from './modelo';
import type { AccionesTeclado } from './teclado';

const TECLAS: Record<string, Dir> = {
  ArrowUp: 'arriba',
  KeyW: 'arriba',
  ArrowDown: 'abajo',
  KeyS: 'abajo',
  ArrowLeft: 'izquierda',
  KeyA: 'izquierda',
  ArrowRight: 'derecha',
  KeyD: 'derecha',
};

/**
 * Para probar en PC: flechas o WASD giran; Espacio, P o Escape empiezan, pausan
 * y siguen. Las acciones van en una ref para no reengancharse a `window` en
 * cada render.
 */
export function useTecladoConga(acciones: AccionesTeclado, activo: boolean): void {
  const ref = useRef(acciones);
  ref.current = acciones;

  useEffect(() => {
    if (!activo) return;
    const abajo = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = TECLAS[e.code];
      if (dir) {
        // Sin esto las flechas hacen scroll.
        e.preventDefault();
        if (!e.repeat) ref.current.girar(dir);
      } else if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        if (!e.repeat) ref.current.alternar();
      }
    };
    window.addEventListener('keydown', abajo);
    return () => window.removeEventListener('keydown', abajo);
  }, [activo]);
}
