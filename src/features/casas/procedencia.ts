/**
 * De donde salen los puntos de una persona (0053): el texto de cada linea del
 * desglose. Sin importaciones: los tests lo cargan tal cual.
 */

export type LineaProcedencia = {
  tipo: string;
  detalle: string | null;
  puesto: number | null;
  veces: number;
  puntos: number;
};

const JUEGOS: Record<string, string> = {
  'cana-perfecta': 'La Caña Perfecta',
  'maestro-cervecero': 'Maestro Cervecero',
  'conga-cervecera': 'La Conga Cervecera',
  'conduces-tu': '¿Conduces tú?',
  'quien-quiere-ser-cervecero': '¿Quién quiere ser cervecero?',
  'tapon-al-vuelo': 'Tapón al Vuelo',
  'parejas-de-barra': 'Parejas de Barra',
};

const SIMPLES: Record<string, [singular: string, plural: string]> = {
  sello: ['Sello', 'Sellos'],
  consumicion: ['Consumición', 'Consumiciones'],
  categoria_nueva: ['Categoría nueva', 'Categorías nuevas'],
  ruta_completa: ['Ruta completada', 'Ruta completada'],
  racha: ['Racha de casa', 'Rachas de casa'],
  qr: ['Encuentro por QR', 'Encuentros por QR'],
  ajuste: ['Ajuste de la organización', 'Ajustes de la organización'],
};

/** "Sellos", "1.º en La Caña Perfecta", "Reto «Peregrino»"... */
export function nombreProcedencia(l: Pick<LineaProcedencia, 'tipo' | 'detalle' | 'puesto' | 'veces'>): string {
  if (l.tipo === 'podio') {
    const juego = JUEGOS[l.detalle ?? ''] ?? l.detalle ?? 'un minijuego';
    return `${l.puesto ?? '?'}.º en ${juego}`;
  }
  if (l.tipo === 'reto') return `Reto «${l.detalle ?? '?'}»`;
  const par = SIMPLES[l.tipo];
  if (!par) return l.tipo;
  return l.veces === 1 ? par[0] : par[1];
}

/** "×3" cuando hay mas de una; nada si es una sola. */
export function vecesProcedencia(l: Pick<LineaProcedencia, 'tipo' | 'veces'>): string | null {
  return l.veces > 1 && l.tipo !== 'ruta_completa' ? `×${l.veces}` : null;
}
