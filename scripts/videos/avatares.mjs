/**
 * Avatares ilustrados para la gente de mentira de los videos.
 *
 * No se usan fotos de personas reales: una demo que reparte caras de gente
 * que no ha dado permiso es justo lo que la app prohibe (ver la revision de
 * fotos de la 0020). Son SVG planos, deterministas (misma ficha, mismo
 * dibujo) y se rasterizan con el Chrome del grabador (ver semilla.mjs).
 */

/** Piel, pelo y fondo con la paleta cervecera de la app (src/lib/theme.ts). */
export const PIELES = ['#F6D3B3', '#E8B48A', '#C98E62', '#9C6644', '#6F4A33'];
export const PELOS = { castano: '#5A3825', negro: '#22181A', rubio: '#D9A441', pelirrojo: '#B5502C', canoso: '#B9B2A8' };
export const FONDOS = ['#F2C14E', '#E07A3F', '#8FB3A9', '#C9A27E', '#D96C5F', '#7C9CBF', '#B8A1D9', '#E9D8A6'];

function pelo(estilo, color) {
  switch (estilo) {
    case 'largo':
      return `<path d="M150 250 Q140 120 256 110 Q372 120 362 250 L372 400 Q330 420 320 300 L192 300 Q182 420 140 400 Z" fill="${color}"/>
        <path d="M168 220 Q190 140 256 140 Q330 140 348 225 Q300 190 256 180 Q210 185 168 220Z" fill="${color}"/>`;
    case 'corto':
      return `<path d="M164 230 Q160 128 256 122 Q354 128 348 230 Q330 170 256 165 Q186 170 164 230Z" fill="${color}"/>`;
    case 'rizado':
      return [
        [180, 170], [215, 140], [256, 130], [297, 140], [332, 170], [350, 210], [162, 210], [235, 150], [278, 150],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="34" fill="${color}"/>`)
        .join('');
    case 'mono':
      return `<circle cx="256" cy="105" r="42" fill="${color}"/>
        <path d="M164 235 Q160 135 256 128 Q352 135 348 235 Q330 175 256 168 Q182 175 164 235Z" fill="${color}"/>`;
    case 'coleta':
      return `<path d="M340 200 Q420 230 395 340 Q380 300 350 280Z" fill="${color}"/>
        <path d="M164 235 Q160 128 256 122 Q352 128 348 235 Q320 168 250 166 Q200 170 164 235Z" fill="${color}"/>`;
    case 'calvo':
      return `<path d="M168 230 Q170 205 180 195 L182 240Z M344 230 Q342 205 332 195 L330 240Z" fill="${color}"/>`;
    case 'flequillo':
      return `<path d="M158 260 Q150 120 256 116 Q362 120 354 260 L340 250 Q338 175 300 160 Q250 200 175 200 Q170 230 172 250Z" fill="${color}"/>`;
    default:
      return '';
  }
}

/**
 * @param {{piel:number, pelo:string, colorPelo:string, fondo:number, camiseta:string,
 *          gafas?:boolean, barba?:boolean, pendientes?:boolean}} f
 */
export function svgAvatar(f) {
  const piel = PIELES[f.piel % PIELES.length];
  const colorPelo = PELOS[f.colorPelo] ?? f.colorPelo;
  const fondo = FONDOS[f.fondo % FONDOS.length];
  const detras = f.pelo === 'largo' ? pelo('largo', colorPelo) : '';
  const delante = f.pelo === 'largo' ? '' : pelo(f.pelo, colorPelo);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${fondo}"/>
  <circle cx="420" cy="90" r="120" fill="#ffffff" opacity="0.18"/>
  ${detras}
  <path d="M96 512 Q110 380 256 372 Q402 380 416 512Z" fill="${f.camiseta}"/>
  <path d="M220 330 L292 330 L298 392 Q256 420 214 392Z" fill="${piel}"/>
  <path d="M214 392 Q256 420 298 392 L304 404 Q256 436 208 404Z" fill="#000" opacity="0.08"/>
  <ellipse cx="166" cy="250" rx="20" ry="28" fill="${piel}"/>
  <ellipse cx="346" cy="250" rx="20" ry="28" fill="${piel}"/>
  ${f.pendientes ? '<circle cx="166" cy="284" r="7" fill="#F2C14E"/><circle cx="346" cy="284" r="7" fill="#F2C14E"/>' : ''}
  <ellipse cx="256" cy="240" rx="92" ry="110" fill="${piel}"/>
  ${f.barba ? `<path d="M168 250 Q176 352 256 356 Q336 352 344 250 Q330 300 300 300 Q256 286 212 300 Q182 300 168 250Z" fill="${colorPelo}"/>` : ''}
  ${delante}
  <path d="M206 214 Q222 204 238 212" stroke="${colorPelo}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M274 212 Q290 204 306 214" stroke="${colorPelo}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <ellipse cx="222" cy="244" rx="9" ry="11" fill="#2A1E1A"/>
  <ellipse cx="290" cy="244" rx="9" ry="11" fill="#2A1E1A"/>
  <circle cx="225" cy="240" r="3" fill="#fff"/><circle cx="293" cy="240" r="3" fill="#fff"/>
  ${f.gafas ? `<g fill="none" stroke="#2A1E1A" stroke-width="6"><circle cx="222" cy="244" r="26"/><circle cx="290" cy="244" r="26"/><path d="M248 244 L264 244"/></g>` : ''}
  <circle cx="198" cy="278" r="14" fill="#E07A5F" opacity="0.28"/>
  <circle cx="314" cy="278" r="14" fill="#E07A5F" opacity="0.28"/>
  <path d="M250 262 Q256 276 262 262" stroke="#000" stroke-width="4" fill="none" opacity="0.25" stroke-linecap="round"/>
  <path d="M226 296 Q256 322 286 296" stroke="#7A2E2E" stroke-width="7" fill="${f.barba ? 'none' : '#fff'}" stroke-linecap="round"/>
</svg>`;
}
