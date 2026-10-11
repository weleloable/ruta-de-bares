import { memo, useMemo } from 'react';
import { View } from 'react-native';

import { definicion, rectangulos } from './sprites';

/**
 * Un sprite de pixel art en una celda cuadrada. Memoizado: la conga mueve
 * decenas de ellos en cada paso y los que no cambian de dibujo ni de tamano no
 * deben volver a pintar sus cajas.
 */
export const Sprite = memo(function Sprite({ id, celda }: { id: string; celda: number }) {
  const cajas = useMemo(() => rectangulos(definicion(id), celda), [id, celda]);
  return (
    <View style={{ width: celda, height: celda, pointerEvents: 'none' }}>
      {cajas.map((r, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, backgroundColor: r.color }}
        />
      ))}
    </View>
  );
});
