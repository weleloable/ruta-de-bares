/**
 * Ingredientes de "Maestro Cervecero". Los datos son reales pero simplificados:
 * la descripcion es una frase, no una clase de cerveza.
 */

export type MaltaId = 'palida' | 'caramelo' | 'tostada' | 'negra';
export type LevaduraId = 'ale' | 'lager';

export type Malta = {
  id: MaltaId;
  nombre: string;
  /** Una frase: se lee de pasada en un bar. */
  descripcion: string;
  /** Color del liquido en el vaso. */
  color: string;
};

export type Levadura = {
  id: LevaduraId;
  nombre: string;
  descripcion: string;
};

// El orden es el de la pantalla: de mas clara a mas oscura.
export const MALTAS: readonly Malta[] = [
  { id: 'palida', nombre: 'Pálida', descripcion: 'Ligera y dorada', color: '#E9B54B' },
  { id: 'caramelo', nombre: 'Caramelo', descripcion: 'Dulzor y cuerpo', color: '#C4722A' },
  { id: 'tostada', nombre: 'Tostada', descripcion: 'Sabor a pan tostado', color: '#7A4526' },
  { id: 'negra', nombre: 'Negra', descripcion: 'Café y cacao', color: '#2B1A12' },
];

export const LEVADURAS: readonly Levadura[] = [
  { id: 'ale', nombre: 'Ale', descripcion: 'Fermenta arriba y templada: afrutada' },
  { id: 'lager', nombre: 'Lager', descripcion: 'Fermenta abajo y fría: limpia' },
];

export function buscarMalta(id: MaltaId | null): Malta | null {
  return MALTAS.find((m) => m.id === id) ?? null;
}

export function buscarLevadura(id: LevaduraId | null): Levadura | null {
  return LEVADURAS.find((l) => l.id === id) ?? null;
}
