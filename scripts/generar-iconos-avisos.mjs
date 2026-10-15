/*
 * Genera los iconos de los avisos del movil: public/icons/avisos/<nombre>.png
 * (192 px, estilo "chapa": circulo del color de la familia y dibujo en crema) y
 * public/icons/avisos/badge.png (96 px, silueta blanca para la barra de estado
 * de Android, que la pinta siempre en un solo color).
 *
 * Los dibujos son SVG y los pasa a PNG Chrome headless: Pillow no pinta SVG y
 * cairosvg no esta en Windows. Chrome se busca en las rutas habituales o en
 * $CHROME.
 *
 *   node scripts/generar-iconos-avisos.mjs
 *
 * Los PNG NO se editan a mano: se cambia aqui y se vuelve a correr.
 * tests/iconos-avisos.test.ts comprueba que cada icono que pide
 * public/icono-aviso.js existe y tiene la forma esperada.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'public/icons/avisos');

// La paleta de la app (src/lib/theme.ts): ambar de cerveza, rojo de sello,
// verde y tinta. Un color por familia de aviso.
const COLOR = { ruta: '#C67A1E', sorteo: '#A82C24', cana: '#2F6B4F', admin: '#241A12' };
const CREMA = '#FFF8EC';

// Dibujos en una caja de 48 x 48, a trazo. `class="lleno"` = relleno en vez de trazo.
const GLIFOS = {
  bar: '<path d="M14 16h16v20a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z"/><path d="M30 21h3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H30"/><path class="lleno" d="M12.5 17.5c0-4 3-5.5 5.5-5 1.2-2.6 4.6-3.4 6.8-1.6 2.4-1.6 6.7-.4 6.7 3.6v3z"/><path d="M19 23v10M25 23v10"/>',
  foto: '<rect x="8" y="16" width="32" height="22" rx="4"/><path d="M17 16l3-4.5h8l3 4.5"/><circle cx="24" cy="27" r="6"/><circle class="lleno" cx="34" cy="21" r="1.4"/>',
  otra: '<path d="M24 41s-12-11-12-20a12 12 0 0 1 24 0c0 9-12 20-12 20z"/><circle cx="24" cy="21" r="4.5"/>',
  falta: '<rect x="7" y="10" width="34" height="28" rx="3.5"/><circle class="lleno" cx="15.5" cy="19" r="3.6"/><circle class="lleno" cx="24" cy="19" r="3.6"/><circle class="lleno" cx="32.5" cy="19" r="3.6"/><circle class="lleno" cx="15.5" cy="29.5" r="3.6"/><circle class="lleno" cx="24" cy="29.5" r="3.6"/><circle cx="32.5" cy="29.5" r="3.6" stroke-dasharray="2.4 2"/>',
  gana: '<path d="M16 9h16v9a8 8 0 0 1-16 0z"/><path d="M16 12h-3.5a3.5 3.5 0 0 0 1.5 6.8L16 19M32 12h3.5a3.5 3.5 0 0 1-1.5 6.8L32 19"/><path d="M24 26v6M17.5 38h13l-1.5-6h-10z"/>',
  sorteo: '<path d="M8 15h32v6a3 3 0 0 0 0 6v6H8v-6a3 3 0 0 0 0-6z"/><path d="M30 15v18" stroke-dasharray="2.4 2.6"/><path d="M15 21.5h9M15 26.5h6"/>',
  conexion: '<g transform="rotate(-14 16 26)"><path d="M10.5 17h11l-1.4 18a2 2 0 0 1-2 1.8h-4.2a2 2 0 0 1-2-1.8z"/><path d="M11 22h10"/></g><g transform="rotate(14 32 26)"><path d="M26.5 17h11l-1.4 18a2 2 0 0 1-2 1.8h-4.2a2 2 0 0 1-2-1.8z"/><path d="M27 22h10"/></g><path d="M24 6v4.5M18.5 8.5l2.2 3M29.5 8.5l-2.2 3"/>',
  mensaje: '<path d="M11 11h26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H22l-7.5 6.5V31H11a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3z"/><circle class="lleno" cx="17" cy="21" r="1.8"/><circle class="lleno" cx="24" cy="21" r="1.8"/><circle class="lleno" cx="31" cy="21" r="1.8"/>',
  toque: '<rect x="17" y="9" width="14" height="30" rx="3"/><path d="M22 34h4M11 18v12M37 18v12M6.5 21v6M41.5 21v6"/>',
  pregunta: '<path d="M11 11h26a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H22l-7.5 6.5V31H11a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3z"/><path d="M20.5 17.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3"/><circle class="lleno" cx="24" cy="26.6" r="1.5"/>',
  alerta: '<path d="M24 7l13 5v10c0 9-5.8 15.4-13 18.5C16.8 37.4 11 31 11 22V12z"/><path d="M24 16v9"/><circle class="lleno" cx="24" cy="30" r="1.7"/>',
  info: '<path d="M24 7l13 5v10c0 9-5.8 15.4-13 18.5C16.8 37.4 11 31 11 22V12z"/><path d="M19 23.5l3.6 3.6L29.5 20"/>',
};

/** De que familia (y color) es cada icono. Mismo reparto que la maqueta aprobada. */
export const FAMILIA = {
  bar: 'ruta', foto: 'ruta', otra: 'ruta',
  falta: 'sorteo', gana: 'sorteo', sorteo: 'sorteo',
  conexion: 'cana', mensaje: 'cana', toque: 'cana', pregunta: 'cana',
  alerta: 'admin', info: 'admin',
};

function trazar(glifo, color, grosor) {
  return `<g fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round">${GLIFOS[glifo].replaceAll(
    'class="lleno"',
    `fill="${color}" stroke="none"`,
  )}</g>`;
}

/** Chapa: circulo de color lleno y el dibujo, a 62 %, en crema. */
function chapa(nombre) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="${COLOR[FAMILIA[nombre]]}"/><g transform="translate(24 24) scale(0.62) translate(-24 -24)">${trazar(nombre, CREMA, 3)}</g></svg>`;
}

/** Barra de estado: la jarra en blanco sobre transparente; Android solo mira el alfa. */
function badge() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 40 40">${trazar('bar', '#FFFFFF', 3.4)}</svg>`;
}

function buscarChrome() {
  return (
    [
      process.env.CHROME,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
    ]
      .filter(Boolean)
      .find((r) => existsSync(r)) ?? null
  );
}

function aPng(chrome, svg, lado, salida, tmp) {
  const html = join(tmp, `${lado}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style></head><body>${svg}</body></html>`,
  );
  const r = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${lado},${lado}`,
      `--screenshot=${salida}`,
      pathToFileURL(html).href,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  if (!existsSync(salida)) throw new Error(`Chrome no genero ${salida}: ${r.stderr || r.error}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const chrome = buscarChrome();
  if (!chrome) {
    console.error('No encuentro Chrome. Pon su ruta en $CHROME.');
    process.exit(1);
  }
  mkdirSync(destino, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'iconos-avisos-'));
  try {
    for (const nombre of Object.keys(GLIFOS)) {
      aPng(chrome, chapa(nombre), 192, join(destino, `${nombre}.png`), tmp);
      console.log(`icons/avisos/${nombre}.png`);
    }
    aPng(chrome, badge(), 96, join(destino, 'badge.png'), tmp);
    console.log('icons/avisos/badge.png');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
