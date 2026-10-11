import type { Obstaculo } from './mapas';

/**
 * Pixel art de La Conga Cervecera. Cada sprite son 8x8 caracteres y una paleta
 * (`.` es transparente). Sin libreria de imagenes ni SVG instalados, se pintan
 * como rectangulos: `rectangulos` fusiona los pixeles iguales contiguos para
 * que un edificio sean unas pocas cajas y no 64.
 */
export type SpriteDef = { filas: readonly string[]; paleta: Readonly<Record<string, string>> };
export type Rect = { x: number; y: number; w: number; h: number; color: string };

export const LADO = 8;

const JARRA = [
  '..wwww..',
  '.wwwwww.',
  '.gyyyyg.',
  '.gyyyygg',
  '.gyyyyg.',
  '.gyyyygg',
  '.gyyyyg.',
  '..gggg..',
];

const AMIGO = [
  '..hhhh..',
  '.hhhhhh.',
  '.kkkkkk.',
  '.kdkdkk.',
  '.kkkkkk.',
  '.ssssss.',
  'kssssssk',
  '.pp..pp.',
];

/** Aspecto de cada amigo: pelo, camiseta y piel. Han de ser VARIANTES_AMIGO (modelo.ts); un test lo vigila. */
const ASPECTOS: readonly { h: string; s: string; k: string }[] = [
  { h: '#4A2C17', s: '#3B6EA5', k: '#F1C9A0' },
  { h: '#1C1C1C', s: '#2F6B4F', k: '#C68642' },
  { h: '#E8C35A', s: '#7B4EA3', k: '#F1C9A0' },
  { h: '#B5441C', s: '#E0B020', k: '#E0AC84' },
  { h: '#8C8C8C', s: '#2A9D9D', k: '#F1C9A0' },
  { h: '#6B3410', s: '#D9608A', k: '#8D5524' },
];

const PIEDRA = '#C9B48F';
const AGUA = '#4C8DB8';

export const SPRITES = {
  jugador: {
    filas: ['..hhhh.w', '.hhhhhww', '.kkkkkyy', '.kdkdkyy', '.kkkkkyy', 'sssssss.', 'sssssss.', '.s...s..'],
    paleta: { h: '#241A12', k: '#F1C9A0', d: '#241A12', s: '#A82C24', w: '#FFFDF8', y: '#E8A32C' },
  },
  jarra: {
    filas: JARRA,
    paleta: { w: '#FFFDF8', y: '#E8A32C', g: '#B8A183' },
  },
  dorada: {
    filas: JARRA,
    paleta: { w: '#FFF6C9', y: '#FFD23F', g: '#B8860B' },
  },
  tapa: {
    filas: ['........', '..oooo..', '.occcco.', '.oclcco.', '.occcco.', '..oooo..', 'wwwwwwww', '.gggggg.'],
    paleta: { o: '#C9964A', c: '#B5382C', l: '#E9A79C', w: '#FFFDF8', g: '#B8A183' },
  },
  // Obstaculos: el id es el caracter del mapa.
  E: {
    filas: ['BBBBBBBB', 'bbbbbbbb', 'bffbbffb', 'bvvbbvvb', 'bvvbbvvb', 'bffbbffb', 'bbbbbbbb', 'BBBBBBBB'],
    paleta: { B: '#7A3B26', b: '#A5523A', f: '#F3E1C6', v: '#6FA6C9' },
  },
  S: {
    filas: ['ssssssss', 'ssaaaass', 'saaaaaas', 'saaaaaas', 'saaaaaas', 'saaaaaas', 'saaaaaas', 'ssssssss'],
    paleta: { s: PIEDRA, a: '#4A3A2A' },
  },
  U: {
    filas: ['nnjnnjnn', 'njnnnnjn', 'nnnrrnnn', 'nnnrrnnn', 'nnaaaann', 'njaaaajn', 'nnaaaann', 'nnaaaann'],
    paleta: { n: '#E8D9B0', j: '#C9A227', r: '#A82C24', a: '#3A2A1C' },
  },
  F: {
    filas: ['...ww...', '..w..w..', '...ss...', '..sbbs..', '.sbbbbs.', 'sbbbbbbs', 'sbwbbwbs', '.ssssss.'],
    paleta: { s: PIEDRA, b: AGUA, w: '#DFF1FA' },
  },
  B: {
    filas: ['........', 'oooooooo', 'OOOOOOOO', 'oooooooo', '........', 'oooooooo', '.o....o.', '.o....o.'],
    paleta: { o: '#9A5A11', O: '#6E3F0C' },
  },
  A: {
    filas: ['..gggg..', '.gGgggg.', 'gggGgggg', 'gggggGgg', '.gggggg.', '...tt...', '...tt...', '..tttt..'],
    paleta: { g: '#4C9A5E', G: '#2F6B4F', t: '#6B4A2B' },
  },
  C: {
    filas: ['...nn...', '..nnnn..', '...nn...', '..nnnn..', '.nnnnnn.', '..pppp..', '.pppppp.', 'pppppppp'],
    paleta: { n: '#6E8F6A', p: PIEDRA },
  },
} as const satisfies Record<Obstaculo | 'jugador' | 'jarra' | 'dorada' | 'tapa', SpriteDef>;

export function spriteDeAmigo(i: number): string {
  return `amigo${((i % ASPECTOS.length) + ASPECTOS.length) % ASPECTOS.length}`;
}

export function definicion(id: string): SpriteDef {
  const amigo = /^amigo(\d+)$/.exec(id);
  if (amigo) {
    const a = ASPECTOS[Number(amigo[1])];
    if (a) return { filas: AMIGO, paleta: { h: a.h, s: a.s, k: a.k, d: '#241A12', p: '#3A3A52' } };
  }
  const def = (SPRITES as Record<string, SpriteDef>)[id];
  if (!def) throw new Error(`Sprite desconocido: ${id}`);
  return def;
}

export const NUM_ASPECTOS = ASPECTOS.length;

/**
 * Rectangulos que pintan el sprite en una celda de `celda` px. Se fusionan los
 * pixeles iguales (primero a lo ancho, luego a lo alto) y los bordes se
 * redondean con la MISMA cuenta en los dos lados de cada union: asi dos
 * rectangulos vecinos comparten borde exacto, sin rendijas ni solapes aunque
 * `celda` no sea multiplo de 8.
 */
export function rectangulos(def: SpriteDef, celda: number): Rect[] {
  const usado = def.filas.map((f) => [...f].map(() => false));
  const px = celda / LADO;
  const borde = (n: number) => Math.round(n * px);
  const rects: Rect[] = [];
  for (let y = 0; y < def.filas.length; y++) {
    for (let x = 0; x < def.filas[y].length; x++) {
      const c = def.filas[y][x];
      if (usado[y][x] || c === '.') continue;
      let w = 1;
      while (x + w < def.filas[y].length && !usado[y][x + w] && def.filas[y][x + w] === c) w++;
      let h = 1;
      const igual = (fila: number) => {
        for (let k = 0; k < w; k++) if (usado[fila][x + k] || def.filas[fila][x + k] !== c) return false;
        return true;
      };
      while (y + h < def.filas.length && igual(y + h)) h++;
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) usado[y + j][x + k] = true;
      const color = def.paleta[c];
      if (!color) throw new Error(`Falta el color de "${c}" en el sprite`);
      rects.push({ x: borde(x), y: borde(y), w: borde(x + w) - borde(x), h: borde(y + h) - borde(y), color });
    }
  }
  return rects;
}
