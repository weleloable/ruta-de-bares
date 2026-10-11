#!/usr/bin/env node
/**
 * Renderiza el teaser de redes (ver README.md):
 *
 *   npm install --prefix scripts/teaser
 *   node scripts/teaser/render.mjs                      # salida/teaser.mp4 y compañia
 *   node scripts/teaser/render.mjs --fuente otro.mp4    # otra grabacion de la app
 *   node scripts/teaser/render.mjs --fotos 4.5,7.5,12   # solo esas capturas, para mirar
 *   node scripts/teaser/render.mjs --hoja               # hoja de contactos de la fuente
 *
 * Pasos: 1) recorta del trailer de la app los planos de guion.mjs (solo la
 * pantalla del movil), 2) sintetiza la musica, 3) abre escena.html en Chrome
 * headless y captura fotograma a fotograma (t = n / 30, nada en tiempo real,
 * asi un ordenador lento da el mismo video), 4) monta con ffmpeg.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ffmpeg from 'ffmpeg-static';
import { chromium } from 'playwright-core';

import * as G from './guion.mjs';
import { aWav, generarMusica } from './musica.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const SALIDA = join(AQUI, 'salida');
const CACHE = join(AQUI, 'cache');

/** Donde esta la pantalla del movil dentro del trailer (1080x1920), medido en pixeles. */
// y empieza 28 px por debajo del borde de la pantalla: ahi se cuela el subtitulo
// del trailer, que va pegado encima del movil.
export const RECORTE = { x: 186, y: 290, ancho: 708, alto: 1552 };
const DURACION_FUENTE = 71.4;

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const fuente = resolve(opcion('--fuente') ?? join(RAIZ, 'videos', '00-trailer.mp4'));

function ff(argumentos, { silencio = true } = {}) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', silencio ? 'error' : 'info', '-y', ...argumentos], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg fallo:\n${r.stderr}`);
  return r;
}

function duracionDe(fichero) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', fichero], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  if (!m) throw new Error(`No puedo leer la duracion de ${fichero}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

function comprobarFuente() {
  if (!existsSync(fuente)) {
    console.error(`No encuentro la grabacion de la app: ${fuente}
Se graba con  node scripts/videos/grabar.mjs trailer  (ver scripts/videos/README.md)
o se pasa otra con  --fuente <fichero.mp4>.`);
    process.exit(1);
  }
  const d = duracionDe(fuente);
  if (Math.abs(d - DURACION_FUENTE) > 1.5) {
    console.warn(`OJO: la fuente dura ${d.toFixed(1)} s y los tiempos de guion.mjs se midieron sobre una de ${DURACION_FUENTE} s.
Si se regrabo, revisa PLANOS con  --hoja  antes de fiarte del resultado.`);
  }
}

/** Saca los fotogramas de cada plano, ya recortados a la pantalla del movil. */
function extraerPlanos() {
  rmSync(CACHE, { recursive: true, force: true });
  const manifiesto = {};
  const { x, y, ancho, alto } = RECORTE;
  for (const [id, plano] of Object.entries(G.PLANOS)) {
    const dir = join(CACHE, id);
    mkdirSync(dir, { recursive: true });
    plano.tramos.forEach(([a, b], k) => {
      ff(['-ss', String(a), '-t', String(b - a), '-i', fuente, '-vf', `fps=${G.FPS},crop=${ancho}:${alto}:${x}:${y}`, '-q:v', '2', join(dir, `t${k}_%04d.jpg`)]);
    });
    manifiesto[id] = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  }
  return manifiesto;
}

/** Servidor estatico minimo: los modulos ES no cargan desde file://. */
function servir() {
  const tipos = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const ruta = normalize(join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!ruta.startsWith(RAIZ) || !existsSync(ruta) || statSync(ruta).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': tipos[extname(ruta)] ?? 'application/octet-stream' });
    createReadStream(ruta).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

function buscarChrome() {
  const candidatos = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  const c = candidatos.find((p) => existsSync(p));
  if (!c) throw new Error('No encuentro Chrome. Pasa la ruta en $CHROME.');
  return c;
}

async function abrirEscena(manifiesto) {
  const srv = await servir();
  const navegador = await chromium.launch({ executablePath: buscarChrome(), args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
  const pagina = await navegador.newPage({ viewport: { width: G.ANCHO, height: G.ALTO }, deviceScaleFactor: 1 });
  pagina.on('pageerror', (e) => console.error('escena:', e.message));
  await pagina.addInitScript((m) => { window.__MANIFIESTO = m; }, manifiesto);
  const { port } = srv.address();
  await pagina.goto(`http://127.0.0.1:${port}/scripts/teaser/escena.html?cache=/scripts/teaser/cache`);
  const { faltan } = await pagina.evaluate(() => window.listo);
  if (faltan.length) throw new Error(`No cargaron las fuentes (${faltan.join(', ')}): hace falta conexion para Google Fonts.`);
  return { pagina, cerrar: async () => { await navegador.close(); srv.close(); } };
}

async function capturas(tiempos) {
  const manifiesto = extraerPlanos();
  const { pagina, cerrar } = await abrirEscena(manifiesto);
  const dir = join(SALIDA, 'fotos');
  mkdirSync(dir, { recursive: true });
  for (const t of tiempos) {
    await pagina.evaluate((t) => window.pintar(t), t);
    const f = join(dir, `t${t.toFixed(2)}.png`);
    await pagina.screenshot({ path: f });
    console.log(f);
  }
  await cerrar();
}

async function render() {
  mkdirSync(SALIDA, { recursive: true });
  console.log('1/4 planos de la app');
  const manifiesto = extraerPlanos();

  console.log('2/4 musica');
  const wav = join(SALIDA, 'musica.wav');
  writeFileSync(wav, aWav(generarMusica()));

  console.log(`3/4 ${G.FOTOGRAMAS} fotogramas`);
  const { pagina, cerrar } = await abrirEscena(manifiesto);
  const mudo = join(SALIDA, 'teaser-sin-musica.mp4');
  const enc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(G.FPS), '-c:v', 'mjpeg', '-i', '-',
    // tope de 8 Mb/s: el grano dispara el peso y asi el video queda por debajo
    // de los 16 MB que WhatsApp deja mandar como video (Instagram lo recomprime igual)
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(G.FPS),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', mudo], { stdio: ['pipe', 'inherit', 'inherit'] });
  const terminado = new Promise((ok, mal) => enc.on('close', (c) => (c === 0 ? ok() : mal(new Error('ffmpeg salio con ' + c)))));
  const t0 = Date.now();
  for (let f = 0; f < G.FOTOGRAMAS; f++) {
    const t = f / G.FPS;
    await pagina.evaluate(([t, f]) => window.pintar(t, f), [t, f]);
    const jpg = await pagina.screenshot({ type: 'jpeg', quality: 95 });
    if (!enc.stdin.write(jpg)) await new Promise((ok) => enc.stdin.once('drain', ok));
    if (f % 60 === 0) {
      const hecho = (f + 1) / G.FOTOGRAMAS;
      const seg = (Date.now() - t0) / 1000;
      console.log(`   ${(hecho * 100).toFixed(0)}%  quedan ~${Math.round(seg / hecho - seg)} s`);
    }
  }
  enc.stdin.end();
  await terminado;
  await cerrar();

  console.log('4/4 montaje');
  const final = join(SALIDA, 'teaser.mp4');
  ff(['-i', mudo, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
  // portada: el fotograma del cierre ya colocado
  ff(['-ss', String(G.DURACION - 1.5), '-i', mudo, '-frames:v', '1', '-q:v', '2', join(SALIDA, 'portada.jpg')]);
  console.log(`\nListo:\n  ${final}\n  ${mudo}\n  ${join(SALIDA, 'portada.jpg')}`);
}

function hoja() {
  const f = join(SALIDA, 'hoja-fuente.png');
  mkdirSync(SALIDA, { recursive: true });
  const { x, y, ancho, alto } = RECORTE;
  ff(['-i', fuente, '-vf', `fps=2,crop=${ancho}:${alto}:${x}:${y},scale=140:-1,drawtext=text='%{pts\\:hms}':x=4:y=4:fontsize=16:fontcolor=red:box=1,tile=12x12`, '-frames:v', '1', f]);
  console.log(f);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  comprobarFuente();
  if (args.includes('--hoja')) hoja();
  else if (opcion('--fotos')) await capturas(opcion('--fotos').split(',').map(Number));
  else await render();
}
