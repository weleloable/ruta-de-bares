/**
 * Las cuatro casas de la ruta. Cada una tiene un color principal que no
 * comparte con ninguna otra (escudo, rankings, todo lo que la identifica) y
 * un escudo de DISEÑO PROPIO: los nombres son de las cervezas, pero el escudo
 * no copia ningun logo, usa un simbolo de su tierra.
 *
 *   Mahou            rojo     la torre (Madrid)
 *   Cruzcampo        naranja  el sol (Sevilla)
 *   Estrella Galicia negro    la concha del Camino (Galicia)
 *   Alhambra         verde    el arco de herradura (Granada)
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

export type IdCasa = 'mahou' | 'cruzcampo' | 'estrella' | 'alhambra';

export type Casa = {
  id: IdCasa;
  nombre: string;
  /** Color principal, unico de esta casa. */
  color: string;
  /** Mas oscuro, para degradados y bordes. */
  oscuro: string;
  /** Detalle del escudo (dorado, crema, plata...): nunca el color de otra casa. */
  detalle: string;
  /** Texto encima de su color (blanco casi siempre). */
  texto: string;
  lema: string;
};

export const CASAS: Record<IdCasa, Casa> = {
  mahou: {
    id: 'mahou',
    nombre: 'Mahou',
    color: '#C8102E',
    oscuro: '#7E0A1D',
    detalle: '#F2C14E',
    texto: '#FFFFFF',
    lema: 'De Madrid al cielo',
  },
  cruzcampo: {
    id: 'cruzcampo',
    nombre: 'Cruzcampo',
    color: '#F07D00',
    oscuro: '#A85200',
    detalle: '#FFF1D6',
    texto: '#FFFFFF',
    lema: 'Con mucho arte',
  },
  estrella: {
    id: 'estrella',
    nombre: 'Estrella Galicia',
    color: '#1A1A1A',
    oscuro: '#000000',
    detalle: '#C9CDD3',
    texto: '#FFFFFF',
    lema: 'Desde el fin del mundo',
  },
  alhambra: {
    id: 'alhambra',
    nombre: 'Alhambra',
    color: '#1E7B3C',
    oscuro: '#0F4A22',
    detalle: '#E8D28A',
    texto: '#FFFFFF',
    lema: 'Sin prisa, con duende',
  },
};

export const ORDEN_CASAS: readonly IdCasa[] = ['mahou', 'cruzcampo', 'estrella', 'alhambra'];

export function esCasa(v: unknown): v is IdCasa {
  return typeof v === 'string' && (ORDEN_CASAS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Escudos (SVG en texto: se pinta con expo-image en web y en movil)
// ---------------------------------------------------------------------------

/** El contorno del escudo, de 120 x 140. */
const CONTORNO = 'M10 12 Q10 8 14 8 H106 Q110 8 110 12 V70 C110 104 86 124 60 134 C34 124 10 104 10 70 Z';
const INTERIOR = 'M18 16 H102 V70 C102 99 82 116 60 125 C38 116 18 99 18 70 Z';

const f = (n: number) => n.toFixed(1);

function torre(c: Casa) {
  const p = c.detalle;
  // Muralla con almenas y una torre central con puerta en arco.
  const almenas = [36, 46, 74, 84].map((x) => `<rect x="${x - 4}" y="50" width="8" height="8" fill="${p}"/>`).join('');
  const almenasTorre = [50, 60, 70].map((x) => `<rect x="${x - 4}" y="30" width="8" height="8" fill="${p}"/>`).join('');
  return `
    <rect x="32" y="57" width="56" height="38" fill="${p}"/>
    ${almenas}
    <rect x="46" y="37" width="28" height="58" fill="${p}"/>
    ${almenasTorre}
    <path d="M53 95 V80 A7 7 0 0 1 67 80 V95 Z" fill="${c.oscuro}"/>
    <rect x="57" y="47" width="6" height="10" rx="3" fill="${c.oscuro}"/>`;
}

function sol(c: Casa) {
  const p = c.detalle;
  const rayos: string[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    const a1 = a - 0.13;
    const a2 = a + 0.13;
    const r0 = 22;
    const r1 = k % 2 === 0 ? 36 : 31;
    rayos.push(
      `<path d="M${f(60 + Math.cos(a1) * r0)} ${f(64 + Math.sin(a1) * r0)} L${f(60 + Math.cos(a) * r1)} ${f(64 + Math.sin(a) * r1)} L${f(60 + Math.cos(a2) * r0)} ${f(64 + Math.sin(a2) * r0)} Z" fill="${p}"/>`,
    );
  }
  return `${rayos.join('')}<circle cx="60" cy="64" r="17" fill="${p}"/><circle cx="60" cy="64" r="11" fill="${c.color}"/><circle cx="60" cy="64" r="6" fill="${p}"/>`;
}

function concha(c: Casa) {
  const p = c.detalle;
  // Abanico: el borde ondulado de arriba y las costillas que bajan a la charnela.
  const base = { x: 60, y: 96 };
  const borde: string[] = [];
  const costillas: string[] = [];
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI + (k * Math.PI) / n;
    const x = 60 + Math.cos(a) * 34;
    const y = 66 + Math.sin(a) * 30;
    borde.push(`${k === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`);
    if (k > 0 && k < n) costillas.push(`<path d="M${base.x} ${base.y} L${f(x)} ${f(y)}" stroke="${c.color}" stroke-width="2.2"/>`);
  }
  return `
    <path d="${borde.join(' ')} L${base.x + 8} ${base.y} L${base.x - 8} ${base.y} Z" fill="${p}"/>
    ${costillas.join('')}
    <path d="M44 96 H76 L72 104 H48 Z" fill="${p}"/>`;
}

function arco(c: Casa) {
  const p = c.detalle;
  // Portada con arco de herradura (mas de media circunferencia) y dos columnas.
  return `
    <rect x="30" y="36" width="60" height="62" rx="3" fill="${p}"/>
    <path d="M43 98 V70 A17 17 0 1 1 77 70 V98 Z" fill="${c.oscuro}"/>
    <rect x="40" y="70" width="5" height="28" fill="${p}"/>
    <rect x="75" y="70" width="5" height="28" fill="${p}"/>
    <circle cx="60" cy="44" r="3" fill="${c.color}"/>
    <circle cx="48" cy="44" r="2" fill="${c.color}"/>
    <circle cx="72" cy="44" r="2" fill="${c.color}"/>`;
}

const EMBLEMA: Record<IdCasa, (c: Casa) => string> = {
  mahou: torre,
  cruzcampo: sol,
  estrella: concha,
  alhambra: arco,
};

/** El escudo de una casa, como SVG en texto. */
export function escudoSvg(id: IdCasa): string {
  const c = CASAS[id];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="120" height="140">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.color}"/>
      <stop offset="1" stop-color="${c.oscuro}"/>
    </linearGradient>
  </defs>
  <path d="${CONTORNO}" fill="${c.oscuro}"/>
  <path d="${CONTORNO}" fill="url(#g)" transform="translate(0 -2)"/>
  <path d="${INTERIOR}" fill="none" stroke="${c.detalle}" stroke-width="3" stroke-opacity="0.9" transform="translate(0 -2)"/>
  <g transform="translate(0 -2)">${EMBLEMA[id](c)}</g>
</svg>`;
}

/** El escudo listo para una <Image>: data URI. */
export function escudoUri(id: IdCasa): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(escudoSvg(id))}`;
}
