import { forwardRef, useImperativeHandle } from 'react';

import type { RutaMapaHandle, RutaMapaProps } from './RutaMapa.types';

export type { RutaMapaHandle } from './RutaMapa.types';

/**
 * Variante web de RutaMapa: no importa react-native-maps (ver RutaMapa.tsx).
 * La pantalla Ruta ya muestra un aviso en web antes de llegar aqui; esto solo
 * existe para que el bundle web no arrastre el paquete nativo. Misma API.
 */
export const RutaMapa = forwardRef<RutaMapaHandle, RutaMapaProps>(function RutaMapa(_props, ref) {
  useImperativeHandle(ref, () => ({ encuadrar() {}, irA() {} }), []);
  return null;
});
