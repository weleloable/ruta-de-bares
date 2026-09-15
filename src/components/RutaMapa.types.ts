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
};
