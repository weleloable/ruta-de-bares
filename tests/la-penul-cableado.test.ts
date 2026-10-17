/**
 * La Penul: lo que, si se desconecta, no da error.
 *  - cada imagen de assets/ultima-ronda/ sale en CREDITOS.md, y los creditos del
 *    juego llevan los dos textos (el de los fondos es OBLIGATORIO: CC BY 3.0);
 *  - las imagenes generadas estan y no se han tocado los originales;
 *  - el juego no puntua: sin enviar, sin ranking, resultadoPropio, y fuera de
 *    minigame_scores y casas_podios;
 *  - el menu y la pestana pasan quien mira y el interruptor, y este se vuelve a leer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CREDITOS, ID_LA_PENUL } from '../src/features/minijuegos/juegos/la-penul/guion.ts';

const leer = (r: string) => readFileSync(r, 'utf8');
const ficheros = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? ficheros(join(dir, f)) : [join(dir, f).split('\\').join('/')]));

test('toda imagen de assets/ultima-ronda/ sale en CREDITOS.md', () => {
  const creditos = leer('assets/ultima-ronda/CREDITOS.md');
  const imagenes = ficheros('assets/ultima-ronda').filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  assert.ok(imagenes.length >= 10, `solo ${imagenes.length} imagenes`);
  for (const f of imagenes) {
    const relativa = f.replace('assets/ultima-ronda/', '');
    assert.ok(creditos.includes(`\`${relativa}\``), `${relativa} no sale en CREDITOS.md`);
  }
});

test('la pantalla de Creditos lleva los dos textos de CREDITOS.md (CC BY 3.0 obliga a citar y decir que se cambio)', () => {
  const todo = CREDITOS.join('\n');
  assert.match(todo, /Visual Novel Backgrounds/);
  assert.match(todo, /ani mosity/);
  assert.match(todo, /CC BY 3\.0/);
  assert.match(todo, /creativecommons\.org\/licenses\/by\/3\.0/);
  assert.match(todo, /Recortados y reescalados/);
  assert.match(todo, /Open Peeps/);
  assert.match(todo, /Pablo Stanley/);
  assert.match(leer('src/features/minijuegos/juegos/la-penul/LaPenul.tsx'), /CREDITOS\.map/);
});

test('las imagenes generadas estan, y pesan poco', () => {
  const gen = ficheros('assets/la-penul');
  assert.deepEqual(
    gen.map((f) => f.replace('assets/la-penul/', '')).sort(),
    ['fondos/bar.jpg', 'fondos/portal.jpg', ...['10', '17', '47', '48', '61', '91', '94', '96'].map((n) => `personajes/peep-${n}.png`)].sort(),
  );
  const total = gen.reduce((s, f) => s + statSync(f).size, 0);
  assert.ok(total < 900_000, `las imagenes del juego pesan ${Math.round(total / 1024)} KB`);
});

test('no puntua: sin enviar ni ranking, con resultadoPropio, y fuera de los rankings de SQL', () => {
  const j = leer('src/features/minijuegos/juegos.ts');
  const def = j.slice(j.indexOf('id: ID_LA_PENUL'), j.indexOf('},', j.indexOf('id: ID_LA_PENUL')));
  assert.match(def, /resultadoPropio: true/);
  assert.match(def, /pantallaCompleta: true/);
  assert.match(def, /visibilidad: 'la-penul'/);
  assert.doesNotMatch(def, /enviar|ranking|RankingPropio|cervezas/);
  // En SQL no existe: ni en el check de juegos ni en ninguna migracion.
  for (const m of readdirSync('supabase/migrations')) assert.doesNotMatch(leer(`supabase/migrations/${m}`), new RegExp(`'${ID_LA_PENUL}'`), m);
});

test('la pestana pasa quien mira y el interruptor, y lo vuelve a leer con el menu abierto', () => {
  const t = leer('app/(tabs)/minijuegos.tsx');
  assert.match(t, /esAdmin=\{isAdmin\}/);
  assert.match(t, /penulVisible=\{penulVisible\}/);
  assert.match(t, /useSondeo\(releer, SONDEO_PENUL_MS/);
  // Y al enfocar la pestana (useSondeo no lo hace), sin pisar el valor de otra ruta.
  assert.match(t, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*void releer\(\);/);
  assert.match(t, /rutaActual\.current === id/);
  const m = leer('src/features/minijuegos/MenuMinijuegos.tsx');
  assert.match(m, /juegosDelMenu\(JUEGOS, \{ esAdmin, penulVisible \}\)/);
  assert.match(m, /Solo admins/);
  assert.doesNotMatch(m, /JUEGOS\.map\(/, 'el menu tiene que pintar la lista de juegosDelMenu, no JUEGOS a pelo');
});

test('el editor tiene el interruptor y lo guarda en la ruta', () => {
  const e = leer('app/editor/[routeId]/index.tsx');
  assert.match(e, /<AjustesLaPenul ruta=\{ruta\}/);
  assert.match(e, /updateRoute\(ruta\.id, cambio\)/);
  assert.match(leer('src/features/routes/api.ts'), /\| 'la_penul_visible'/);
  assert.match(leer('src/features/routes/AjustesLaPenul.tsx'), /La Penul visible para todos/);
});

test('candado: las opciones recien aparecidas no aceptan el toque que venia para "Seguir"', () => {
  const c = leer('src/features/minijuegos/juegos/la-penul/LaPenul.tsx');
  assert.match(c, /export const ESPERA_OPCIONES_MS = \d{3}/);
  assert.match(c, /if \(abierta\.current !== pantallaRef\.current\) return;/);
  // Y el fundido no se reinicia con un segundo toque: ref, no estado.
  assert.match(c, /if \(fase !== 'jugando' \|\| enFundido\.current\) return;/);
});

test('al cambiar de ruta no parpadea el interruptor de la anterior', () => {
  const t = leer('app/(tabs)/minijuegos.tsx');
  // Lo leido solo manda si la ruta y el valor contra el que se leyo siguen igual, y se decide al pintar.
  assert.match(t, /leido && leido\.ruta === activeRoute\?\.id && leido\.base === base \? leido\.visible : base/);
  assert.doesNotMatch(t, /setLeido\(null\)/);
  assert.match(t, /n === pregunta\.current/);
});

test('el candado vale por partida y por pantalla, tambien en la portada del final', () => {
  const c = leer('src/features/minijuegos/juegos/la-penul/LaPenul.tsx');
  assert.match(c, /const pantalla = `\$\{partida\}\|\$\{toques\}\|\$\{fase\}\|/);
  // Cada toque que vale cambia la clave: el candado se rearma aunque la pantalla no cambie (sin bloqueo eterno).
  assert.equal((c.match(/setToques\(\(n\) => n \+ 1\);/g) ?? []).length, 2);
  assert.match(c, /setPartida\(\(n\) => n \+ 1\)/);
  assert.match(c, /texto="Volver a jugar" onPress=\{conCandado\(empezar\)\}/);
  assert.match(c, /texto="Salir" onPress=\{conCandado\(onSalir\)\}/);
});

test('un toque que vale cierra el candado', () => {
  const c = leer('src/features/minijuegos/juegos/la-penul/LaPenul.tsx');
  assert.equal((c.match(/abierta\.current = null;/g) ?? []).length, 2);
});

test('La Penul va aparte y la ULTIMA en juegos.ts (un juego nuevo se suma antes)', () => {
  const j = leer('src/features/minijuegos/juegos.ts');
  assert.match(j, /export const JUEGOS: readonly JuegoDef\[\] = \[\.\.\.JUEGOS_DE_SIEMPRE, JUEGO_LA_PENUL\];/);
  // Dentro de la lista de siempre no esta (iria por medio).
  const deSiempre = j.slice(j.indexOf('const JUEGOS_DE_SIEMPRE'), j.indexOf('const JUEGO_LA_PENUL'));
  assert.doesNotMatch(deSiempre, /ID_LA_PENUL|visibilidad: 'la-penul'/);
  assert.match(j.slice(j.indexOf('const JUEGO_LA_PENUL')), /visibilidad: 'la-penul'/);
});
