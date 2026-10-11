/**
 * Retos (0047): el catalogo de condiciones, sus limites (los mismos que la
 * restriccion `retos_condicion_check`), el texto que ve la gente y la hora
 * limite. Quien decide si se cumple es el servidor (`retos_evaluar`).
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

export type TipoReto = 'categorias' | 'consumiciones_categoria' | 'bares' | 'encuentros_qr' | 'ruta_antes_de';

export const TIPOS_RETO: readonly { id: TipoReto; nombre: string; icono: string }[] = [
  { id: 'bares', nombre: 'Sellar bares', icono: '📍' },
  { id: 'categorias', nombre: 'Categorías distintas', icono: '🎨' },
  { id: 'consumiciones_categoria', nombre: 'De una categoría', icono: '🍏' },
  { id: 'encuentros_qr', nombre: 'Encuentros QR', icono: '🤝' },
  { id: 'ruta_antes_de', nombre: 'Acabar antes de…', icono: '⏱️' },
];

const NOMBRE_CATEGORIA: Record<string, string> = {
  sin_alcohol: 'sin alcohol',
  tercio: 'tercio',
  jarra: 'jarra',
  vino: 'vino',
  sidra: 'sidra',
  chupito: 'chupito',
};

/** Objetivo minimo y maximo segun el tipo (y la categoria: con alcohol, como mucho 3). */
export function limitesObjetivo(tipo: TipoReto, categoria: string | null): { min: number; max: number } {
  switch (tipo) {
    case 'categorias':
      return { min: 2, max: 6 };
    case 'consumiciones_categoria':
      return { min: 1, max: categoria === 'sin_alcohol' ? 20 : 3 };
    case 'ruta_antes_de':
      return { min: 1, max: 1 };
    default:
      return { min: 1, max: 20 };
  }
}

export function ajustarObjetivo(valor: number, tipo: TipoReto, categoria: string | null): number {
  const { min, max } = limitesObjetivo(tipo, categoria);
  return Math.min(max, Math.max(min, Math.round(valor)));
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function hhmm(fecha: Date) {
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

/** "Sella 3 bares", "Prueba 2 categorías distintas"... */
export function textoCondicion(r: {
  tipo: string;
  objetivo: number;
  categoria: string | null;
  hora_limite: string | null;
}): string {
  switch (r.tipo) {
    case 'bares':
      return `Sella ${plural(r.objetivo, 'bar', 'bares')}`;
    case 'categorias':
      return `Prueba ${r.objetivo} categorías distintas`;
    case 'consumiciones_categoria':
      return `Apunta ${plural(r.objetivo, 'consumición', 'consumiciones')} de ${NOMBRE_CATEGORIA[r.categoria ?? ''] ?? r.categoria}`;
    case 'encuentros_qr':
      return `Consigue ${plural(r.objetivo, 'encuentro', 'encuentros')} por QR`;
    case 'ruta_antes_de':
      return r.hora_limite ? `Completa la ruta antes de las ${hhmm(new Date(r.hora_limite))}` : 'Completa la ruta a tiempo';
    default:
      return '';
  }
}

/**
 * La hora limite a partir de "HH:MM": el dia del primer bar, y si la hora es
 * anterior a su apertura, el dia siguiente (las rutas cruzan la medianoche).
 */
export function horaLimite(texto: string, primeraApertura: Date): Date | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(texto.trim());
  if (!m) return null;
  const d = new Date(primeraApertura);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d <= primeraApertura) d.setDate(d.getDate() + 1);
  return d;
}

/** Los retos que pasan a conseguidos entre dos lecturas (para celebrarlo). */
export function recienConseguidos<T extends { id: string; conseguido: boolean }>(antes: readonly T[] | null, ahora: readonly T[]): T[] {
  if (!antes) return [];
  const yaTenia = new Set(antes.filter((r) => r.conseguido).map((r) => r.id));
  return ahora.filter((r) => r.conseguido && !yaTenia.has(r.id));
}
