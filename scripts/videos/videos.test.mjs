/**
 * Gate del grabador de videos: lo puro (tiempos de fotograma, lista de
 * ffmpeg, servidor) y que el escenario de la semilla siga cuadrando con el
 * esquema real (etiquetas de la 0030, bares del catalogo, limites de la 0005).
 * Lo que NO cubre: que la app se vea bien en cada paso. Eso lo dice
 * `grabar.mjs --borrador <id>` (una captura por paso) y mirar el video.
 *
 *   npm test --prefix scripts/videos
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { svgAvatar } from './avatares.mjs';
import { RAIZ } from './entorno.mjs';
import { listaConcat, medidaJpeg, tiemposFotogramas } from './grabador.mjs';
import { GUIONES } from './guiones/index.mjs';
import { GENTE, PARADA_EN_VIVO, PARADAS, PROTA, SELLADAS_POR_PROTA, VENTANAS, NUEVA, ADMIN } from './reparto.mjs';
import { comprobarLocal } from './semilla.mjs';
import { resolver } from './servidor.mjs';

test('cada fotograma dura hasta el siguiente y el ultimo hasta el final', () => {
  assert.deepEqual(tiemposFotogramas([10, 10.5, 12], 15), [0.5, 1.5, 3]);
  // Parar antes del ultimo fotograma (reloj raro) no da duraciones negativas.
  assert.deepEqual(tiemposFotogramas([10, 11], 10.5), [1, 0]);
  assert.deepEqual(tiemposFotogramas([], 3), []);
  const d = tiemposFotogramas([0, 0.033, 0.066, 5], 6);
  assert.ok(Math.abs(d.reduce((a, b) => a + b, 0) - 6) < 1e-9, 'la suma es lo grabado');
});

test('medidaJpeg lee el tamano de la cabecera y no se inventa uno', () => {
  // JPEG minimo escrito a mano: SOI + SOF0 de 3x2 + EOI.
  assert.deepEqual(medidaJpeg(Buffer.from('ffd8ffc0000b080002000301012200ffd9', 'hex')), { ancho: 3, alto: 2 });
  // Con un segmento APP0 delante, como los que manda Chrome.
  assert.deepEqual(
    medidaJpeg(Buffer.from('ffd8ffe000044a46ffc0000b08078004380101220000ffd9', 'hex')),
    { ancho: 1080, alto: 1920 },
  );
  assert.deepEqual(medidaJpeg(Buffer.from('89504e470d0a1a0a00000000', 'hex')), { ancho: 0, alto: 0 }, 'un PNG no es un JPEG');
});

test('la lista de ffmpeg repite el ultimo fichero y escapa comillas y barras', () => {
  const lista = listaConcat(['C:\\a\\f1.jpg', "/t/it's.jpg"], [0.5, 1.25]);
  assert.equal(
    lista,
    "file 'C:/a/f1.jpg'\nduration 0.5000\nfile '/t/it'\\''s.jpg'\nduration 1.2500\nfile '/t/it'\\''s.jpg'\n",
  );
});

test('el servidor sirve el escenario, los alias y cae a la app en lo demas', () => {
  const base = mkdtempSync(join(tmpdir(), 'videos-srv-'));
  const web = join(base, 'web');
  const escenario = join(base, 'escenario');
  mkdirSync(web);
  mkdirSync(escenario);
  writeFileSync(join(web, 'index.html'), 'app');
  writeFileSync(join(web, 'app.js'), 'js');
  writeFileSync(join(escenario, 'index.html'), 'escena');
  writeFileSync(join(base, 'secreto.txt'), 'no');
  const o = { web, escenario, alias: { '/__escenario/logo.png': '/logo.png' } };
  assert.equal(resolver('/app.js', o), join(web, 'app.js'));
  assert.equal(resolver('/__escenario/index.html', o), join(escenario, 'index.html'));
  assert.equal(resolver('/__escenario/logo.png', o), '/logo.png');
  assert.equal(resolver('/invitacion', o), join(web, 'index.html'), 'ruta de la app de una pagina');
  assert.equal(resolver('/../secreto.txt', o), join(web, 'index.html'), 'nada fuera de su carpeta');
  assert.equal(resolver('/__escenario/../../secreto.txt', o), join(web, 'index.html'));
});

test('la semilla se niega a tocar un Supabase que no sea local', () => {
  assert.doesNotThrow(() => comprobarLocal('http://127.0.0.1:54321'));
  assert.doesNotThrow(() => comprobarLocal('http://localhost:54321'));
  assert.throws(() => comprobarLocal('https://abcd.supabase.co'), /solo corre contra un Supabase local/);
});

test('el reparto cumple las reglas del nombre visible (0003)', () => {
  const nombres = [ADMIN.nombre, NUEVA.nombre, ...GENTE.map((g) => g.nombre)];
  assert.equal(new Set(nombres.map((n) => n.toLowerCase())).size, nombres.length, 'sin repetir, sin distinguir mayusculas');
  for (const n of nombres) {
    assert.ok(n.length <= 30 && !/\s/.test(n), `${n}: <= 30 y sin espacios`);
  }
  assert.ok(GENTE.some((g) => g.nombre === PROTA));
  assert.ok(!GENTE.some((g) => g.nombre === NUEVA.nombre), 'quien se registra en el video no existe antes');
});

test('frases y etiquetas de La Caña caben y existen en el catalogo (0005, 0030)', () => {
  const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '0030_etiquetas_cultura_pop.sql'), 'utf8');
  const etiquetas = new Set(sql.match(/etiqueta-\d+/g));
  for (const g of GENTE) {
    assert.ok(g.cana.bio.length <= 120, `${g.nombre}: frase <= 120`);
    assert.ok(g.cana.tags.length <= 5, `${g.nombre}: <= 5 etiquetas`);
    for (const t of g.cana.tags) assert.ok(etiquetas.has(t), `${g.nombre}: ${t} existe`);
  }
});

test('las paradas salen del catalogo sembrado y sus ventanas cuentan la historia del video', () => {
  const catalogo = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'semilla-catalogo', 'bares.json'), 'utf8')).map((b) => b.nombre);
  for (const p of PARADAS) assert.ok(catalogo.includes(p), `${p} esta en el catalogo`);
  assert.equal(VENTANAS.length, PARADAS.length);
  for (const [abre, cierra] of VENTANAS) assert.ok(cierra > abre);
  const [abre, cierra] = VENTANAS[PARADA_EN_VIVO];
  assert.ok(abre < 0 && cierra > 30, 'la que se sella en directo esta abierta al grabar, con margen');
  assert.ok(VENTANAS[PARADA_EN_VIVO + 1][0] > 15, 'la siguiente aun no abre ("abre en...")');
  assert.ok(SELLADAS_POR_PROTA <= PARADA_EN_VIVO, 'la de directo no esta ya sellada');
});

test('los avatares son SVG deterministas', () => {
  const a = svgAvatar(GENTE[0].avatar);
  assert.equal(a, svgAvatar(GENTE[0].avatar));
  assert.match(a, /^<svg [^>]*viewBox="0 0 512 512"/);
  assert.notEqual(a, svgAvatar(GENTE[1].avatar));
});

test('los puntos de progreso de cada demo son tantos como sus pasos', () => {
  // Se declaran a mano en `pasos:` y se desajustaban al anadir un paso: el
  // punto rojo acababa a mitad de la fila o se salia de ella.
  for (const g of GUIONES.filter((x) => x.id !== 'trailer')) {
    const codigo = readFileSync(join(RAIZ, 'scripts', 'videos', 'guiones', `${g.id}.mjs`), 'utf8');
    const declarados = Number(/pasos: (\d+)/.exec(codigo)?.[1]);
    const llamadas = codigo.match(/d\.paso\(/g)?.length ?? 0;
    assert.equal(declarados, llamadas, `${g.id}: pasos: ${declarados} y ${llamadas} llamadas a d.paso`);
  }
});

test('el "siguiente video" de cada demo es la que va detras, y la ultima no apunta a nada', () => {
  // Al quitar la demo de Juegos, La Caña seguia anunciandola al final.
  const demos = GUIONES.filter((x) => x.id !== 'trailer');
  demos.forEach((g, i) => {
    const codigo = readFileSync(join(RAIZ, 'scripts', 'videos', 'guiones', `${g.id}.mjs`), 'utf8');
    const siguiente = /cierre\([^;]*?,\s*'([^']*)'\)\)/s.exec(codigo)?.[1];
    assert.equal(siguiente, demos[i + 1]?.titulo ?? '', `${g.id}: anuncia "${siguiente}"`);
  });
});

test('los guiones tienen id y fichero unicos, numerados en orden', () => {
  assert.equal(new Set(GUIONES.map((g) => g.id)).size, GUIONES.length);
  GUIONES.forEach((g, i) => {
    assert.match(g.fichero, new RegExp(`^${String(i).padStart(2, '0')}-[a-z-]+$`), `${g.id}: ${g.fichero}`);
    assert.equal(typeof g.grabar, 'function');
  });
});
