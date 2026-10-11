import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';

import { direccionDeGesto } from './giros';
import type { Dir } from './modelo';

/**
 * Deslizar el dedo por cualquier parte de la pantalla. Cada vez que el dedo
 * recorre el umbral se emite un giro y el recorrido vuelve a contar desde ahi,
 * asi que en un MISMO arrastre se pueden encadenar varios giros (arriba, luego
 * izquierda) sin levantar el dedo. Un toque suelto no gira.
 *
 * Los botones de dentro (pausa, cruceta) piden el toque antes que este: en RN el
 * componente mas profundo es el primero al que se le pregunta.
 */
export function useDeslizar(onGirar: (dir: Dir) => void, activo: boolean) {
  const girar = useRef(onGirar);
  const vivo = useRef(activo);
  girar.current = onGirar;
  vivo.current = activo;
  const origen = useRef({ x: 0, y: 0 });

  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => vivo.current,
        onMoveShouldSetPanResponder: () => vivo.current,
        onPanResponderGrant: () => {
          origen.current = { x: 0, y: 0 };
        },
        onPanResponderMove: (_, g) => {
          const dir = direccionDeGesto(g.dx - origen.current.x, g.dy - origen.current.y);
          if (!dir) return;
          origen.current = { x: g.dx, y: g.dy };
          girar.current(dir);
        },
        // Que nadie (un scroll de fuera) nos quite el dedo a mitad de partida.
        onPanResponderTerminationRequest: () => false,
      }).panHandlers,
    [],
  );
}
