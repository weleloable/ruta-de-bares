import type { Punto } from '../lib/coordenadas';

/** Props compartidas por SelectorPosicion.tsx y SelectorPosicion.web.tsx. */
export type SelectorPosicionProps = {
  punto: Punto | null;
  /** Radio en metros, o null si el campo no es valido y no hay que dibujarlo. */
  radioM: number | null;
  centroInicial: Punto;
  /** null cuando no hay posicion valida (texto vacio o mal escrito en web). */
  onCambiar(punto: Punto | null): void;
};
