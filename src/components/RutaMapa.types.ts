import type { Huecos } from '../lib/encuadre';
import type { RouteBarRow } from '../types/database';

/** API compartida por RutaMapa.tsx y RutaMapa.web.tsx, para que no diverjan. */

export type RutaMapaHandle = {
  /** Encuadra todas las paradas. */
  encuadrar(): void;
  /** Centra el mapa en un bar. */
  irA(bar: RouteBarRow): void;
};

export type RutaMapaProps = {
  bars: RouteBarRow[];
  sellados: ReadonlySet<string>;
  seleccionado: string | null;
  onSeleccionar(barId: string): void;
  /**
   * Pixeles que tapan, medidos en la pantalla, la cabecera (arriba) y el
   * carrusel (abajo). Sin medir todavia, cada variante usa sus valores de
   * siempre: HUECOS_POR_DEFECTO en web, el edgePadding historico en nativo.
   * Un cambio de medida no reencuadra por si solo: afecta al siguiente encuadre.
   */
  huecos?: Huecos;
};
