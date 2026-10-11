import type { Obstaculo } from './mapas';

/**
 * Pixel art de La Conga Cervecera. Cada sprite es un cuadrado de caracteres
 * (8x8 los personajes y objetos, 16x16 los obstaculos, que necesitan detalle
 * para reconocerse) y una paleta; `.` es transparente. Sin libreria de imagenes
 * ni SVG instalados, se pintan como rectangulos: `rectangulos` fusiona los
 * pixeles iguales contiguos para que una fachada sean unas decenas de cajas y no 256.
 */
export type SpriteDef = { filas: readonly string[]; paleta: Readonly<Record<string, string>> };
export type Rect = { x: number; y: number; w: number; h: number; color: string };

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

/** Sombra en el suelo, bajo arboles y columnas. */
const SOMBRA = '#CDB894';
const MADERA = '#6B4A2B';
const MADERA_CLARA = '#8A6238';
const HIERRO = '#2E2A26';

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

  /** Casa del casco: tejado de teja, fachada ocre, ventana con contraventanas y balcon de forja. */
  E: {
    filas: [
      'RRRRRRRRRRRRRRRR',
      'rrrrrrrrrrrrrrrr',
      'RRRRRRRRRRRRRRRR',
      'KKKKKKKKKKKKKKKK',
      'WWWWWWWWWWWWWWWW',
      'WWWwwwwwwwwwwWWW',
      'WWWGGVVVVVVGGWWW',
      'WWWGGVLVVVVGGWWW',
      'WWWGGVVVVVVGGWWW',
      'WWWGGVVVVVVGGWWW',
      'WWNNNNNNNNNNNNWW',
      'WWNwwwNwwNwwwNWW',
      'WWMMMMMMMMMMMMWW',
      'WWWwwwwwwwwwwWWW',
      'WWWWWWWWWWWWWWWW',
      'wwwwwwwwwwwwwwww',
    ],
    paleta: {
      R: '#B4532A',
      r: '#8E3B1C',
      K: '#5C2A14',
      W: '#EDCF93',
      w: '#D4AE6A',
      G: '#3E6B3A',
      V: '#5E87A6',
      L: '#A9C8DD',
      N: HIERRO,
      M: MADERA,
    },
  },
  /** Soportal de la Calle Mayor: viga y zapata de madera sobre columna de piedra. */
  S: {
    filas: [
      'MMMMMMMMMMMMMMMM',
      'mmmmmmmmmmmmmmmm',
      '....MMMMMMMM....',
      '.....mmmmmm.....',
      '.....pppqqq.....',
      '......ppqq......',
      '......ppqq......',
      '......ppqq......',
      '......ppqq......',
      '......ppqq......',
      '......ppqq......',
      '......ppqq......',
      '......ppqq......',
      '.....pppqqq.....',
      '....pppppqqq....',
      '....oooooooo....',
    ],
    paleta: { M: MADERA, m: MADERA_CLARA, p: '#D9CDB4', q: '#ADA088', o: SOMBRA },
  },
  /** La Universidad: piedra dorada plateresca, cresteria, escudo y portada en arco. */
  U: {
    filas: [
      'j..j..j..j..j..j',
      'nnnnnnnnnnnnnnnn',
      'sjsjsjsjsjsjsjsj',
      'nnnnnnnnnnnnnnnn',
      'snnnnnnjjnnnnnns',
      'snnnnnjrrjnnnnns',
      'snnnnnjrrjnnnnns',
      'snnnnnnjjnnnnnns',
      'snnnnnnnnnnnnnns',
      'snnnnnaaaannnnns',
      'snnnnaaaaaannnns',
      'snnnnaaaaaannnns',
      'snnnnaaaaaannnns',
      'snnnnaaaaaannnns',
      'snnnnaaaaaannnns',
      'ssssssssssssssss',
    ],
    paleta: { n: '#E3CF9E', s: '#C9AE73', j: '#B8902A', r: '#A82C24', a: '#3A2A1C' },
  },
  /** Fuente (hoy no esta en el mapa; queda para otros niveles). */
  F: {
    filas: ['...ww...', '..w..w..', '...ss...', '..sbbs..', '.sbbbbs.', 'sbbbbbbs', 'sbwbbwbs', '.ssssss.'],
    paleta: { s: '#C9B48F', b: '#4C8DB8', w: '#DFF1FA' },
  },
  /** Banco de parque: respaldo de listones, asiento y patas de forja. */
  B: {
    filas: [
      '................',
      '................',
      '................',
      '................',
      '.NMMMMMMMMMMMMN.',
      '.NmmmmmmmmmmmmN.',
      '.N............N.',
      '.NMMMMMMMMMMMMN.',
      '.NmmmmmmmmmmmmN.',
      '.N............N.',
      'MMMMMMMMMMMMMMMM',
      'mmmmmmmmmmmmmmmm',
      '.NN..........NN.',
      '.N............N.',
      '.N............N.',
      'NN............NN',
    ],
    paleta: { N: HIERRO, M: MADERA, m: MADERA_CLARA },
  },
  /** Arbol: copa redonda con luces y sombras, tronco y sombra en el suelo. */
  A: {
    filas: [
      '.....gggggg.....',
      '...gggGgggggg...',
      '..ggggggGgggggg.',
      '.gggGgggggggGgg.',
      '.gLLggggggGgggg.',
      'ggLggggGggggggGg',
      'gggggggggggGgggg',
      'gGggggLggggggggg',
      '.gggGggggggggGg.',
      '.GggggggggggggG.',
      '..GGgggggggggGG.',
      '....GGGtTGGG....',
      '.......tT.......',
      '.......tT.......',
      '......ttTT......',
      '.....oooooo.....',
    ],
    paleta: { g: '#5E9E4F', G: '#3F7A3A', L: '#8CC46A', t: MADERA, T: '#4E3420', o: SOMBRA },
  },
  /**
   * Cervantes en la plaza: figura de bronce con la pluma en alto, golilla y
   * libro, sobre pedestal de granito con placa. Ocupa 2x2 casillas (mapas.ts).
   */
  C: {
    filas: [
      '........hh......',
      '.......hbbd.....',
      '.......bbbd.....',
      '..h....dbbd.....',
      '..h...hhhhhd....',
      '..hb.hbbbbbdd...',
      '...bbbbbbbbdd...',
      '......bbbbbddd..',
      '......bbbbbdhh..',
      '......bbbbbdhh..',
      '......bb..bdd...',
      '......bb..bdd...',
      '.....bbbb.bddd..',
      '...ppppppppppqq.',
      '....pppjjjjpqq..',
      '...ppppppppppqqq',
    ],
    paleta: { b: '#4F6E4A', h: '#9DBB97', d: '#2F4430', p: '#BDB6A8', q: '#8E887C', j: '#C9A227' },
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
 * `celda` no sea multiplo del lado del sprite.
 */
export function rectangulos(def: SpriteDef, celda: number): Rect[] {
  const usado = def.filas.map((f) => [...f].map(() => false));
  const px = celda / def.filas.length;
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
