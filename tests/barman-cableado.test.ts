/**
 * Barman Express: lo que, si se desconecta, no da error.
 *  - los dibujos que pide el juego existen, generados, y cada receta tiene su
 *    dibujo por paso; los clientes originales salen en su CREDITOS.md;
 *  - el juego esta en el menu con ranking, a pantalla completa, y queda
 *    PENULTIMO (La Penul siempre la ultima);
 *  - en web los botones no son un Pressable (toques rapidos);
 *  - el aviso de "falta una migracion" nombra la 0073.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';

import { INGREDIENTES, RECETAS, type Bebida } from '../src/features/minijuegos/juegos/barman/modelo.ts';
import { CLIENTES } from '../src/features/minijuegos/juegos/barman/spritesGeometria.ts';

const leer = (r: string) => readFileSync(r, 'utf8');
const S = 'assets/barman/sprites';

/** Ancho y alto de un PNG, de su cabecera IHDR. */
function medidas(ruta: string): [number, number] {
  const b = readFileSync(ruta);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${ruta} no es un PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('cada ingrediente tiene su dibujo, de 128 x 128', () => {
  for (const ing of INGREDIENTES) assert.deepEqual(medidas(`${S}/ingredientes/${ing}.png`), [128, 128], ing);
  assert.deepEqual(readdirSync(`${S}/ingredientes`).sort(), INGREDIENTES.map((i) => `${i}.png`).sort());
});

test('cada bebida tiene un dibujo por paso, todos del mismo tamano', () => {
  const tam = new Set<string>();
  for (const b of Object.keys(RECETAS) as Bebida[]) {
    for (let p = 1; p <= RECETAS[b].length; p++) tam.add(medidas(`${S}/bebidas/${b}-${p}.png`).join('x'));
  }
  assert.equal(tam.size, 1, `tamanos distintos: ${[...tam]}`);
  const esperados = (Object.keys(RECETAS) as Bebida[]).flatMap((b) => RECETAS[b].map((_, k) => `${b}-${k + 1}.png`));
  assert.deepEqual(readdirSync(`${S}/bebidas`).sort(), esperados.sort());
});

test('los clientes: el original, su pegatina y su linea en CREDITOS.md', () => {
  const creditos = leer('assets/barman/clientes/CREDITOS.md');
  assert.match(creditos, /CC0/);
  assert.match(creditos, /Pablo Stanley/);
  const originales = readdirSync('assets/barman/clientes').filter((f) => f.endsWith('.png'));
  assert.equal(originales.length, 12);
  for (const f of originales) {
    assert.ok(creditos.includes(`\`${f}\``), `${f} no sale en CREDITOS.md`);
    assert.ok(statSync(`${S}/clientes/${f}`).size > 0, `${f} sin pegatina`);
  }
  assert.deepEqual([...CLIENTES].sort(), originales.map((f) => f.replace('.png', '')).sort());
  // Y los creditos salen en el juego.
  assert.match(leer('src/features/minijuegos/juegos/barman/DetalleBarman.tsx'), /Open Peeps de Pablo Stanley/);
});

test('el juego pesa poco (lo que carga la app: los dibujos generados, no los originales)', () => {
  const todos = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? todos(`${d}/${f}`) : [`${d}/${f}`]));
  const app = todos(S).reduce((s, f) => s + statSync(f).size, 0);
  assert.ok(app < 900_000, `${S} pesa ${Math.round(app / 1024)} KB`);
  // La app no carga los originales de Open Peeps: solo sus pegatinas generadas.
  assert.doesNotMatch(leer('src/features/minijuegos/juegos/barman/sprites.ts'), /assets\/barman\/clientes\//);
});

test('en el menu: ranking, pantalla completa, y PENULTIMO (La Penul siempre la ultima)', () => {
  const j = leer('src/features/minijuegos/juegos.ts');
  const deSiempre = j.slice(j.indexOf('const JUEGOS_DE_SIEMPRE'), j.indexOf('const JUEGO_LA_PENUL'));
  // Barman iba el ultimo de los de siempre; ahora le sigue APARTA!!! (un juego nuevo se suma al final).
  const def = deSiempre.slice(deSiempre.indexOf('id: ID_BARMAN'), deSiempre.indexOf('id: ID_PULSO'));
  assert.match(def, /pantallaCompleta: true/);
  assert.match(def, /ranking: true/);
  assert.match(def, /Detalle: DetalleBarman/);
  assert.match(def, /enviar: async/);
  // El ultimo de los de siempre: ningun otro juego despues de el en esa lista.
  assert.doesNotMatch(def.slice(def.indexOf('enviar:')), /\bid: /);
});

test('en web, ingredientes y comanda escuchan pointerdown (un toque rapido no se pierde)', () => {
  const w = leer('src/features/minijuegos/juegos/barman/ToqueRapido.web.tsx');
  assert.match(w, /addEventListener\('pointerdown', abajo\)/);
  assert.doesNotMatch(w, /<Pressable/);
  const c = leer('src/features/minijuegos/juegos/barman/BarmanExpress.tsx');
  assert.equal((c.match(/<ToqueRapido/g) ?? []).length, 2, 'los ingredientes y la comanda');
});

test('el aviso de que falta la migracion nombra la 0073', () => {
  assert.match(leer('src/features/minijuegos/errores.ts'), /0073/);
});

test('el aviso se esconde con su PROPIO temporizador (antes se quedaba pegado al tocar)', () => {
  const c = leer('src/features/minijuegos/juegos/barman/BarmanExpress.tsx');
  // El efecto de los eventos no programa el temporizador del aviso...
  const deEventos = c.slice(c.indexOf('const ultimoEvento = useRef'), c.indexOf('}, [partida.evento]);'));
  assert.doesNotMatch(deEventos, /setTimeout/);
  // ...lo hace uno aparte, que depende solo del aviso.
  assert.match(c, /useEffect\(\(\) => \{\s*if \(!aviso\) return undefined;\s*const id = setTimeout\(/);
  assert.match(c, /\}, \[aviso\]\);/);
});

test('con una bebida a medias, las demas de la comanda no se pueden tocar', () => {
  const c = leer('src/features/minijuegos/juegos/barman/BarmanExpress.tsx');
  assert.match(c, /desactivado=\{entregada \|\| \(partida\.hechos > 0 && !activa\)\}/);
});

test('la pista (duda) y la pausa de "¡Bien hecho!" estan cableadas a la pantalla', () => {
  const c = leer('src/features/minijuegos/juegos/barman/BarmanExpress.tsx');
  assert.match(c, /hayDuda\(partida, t\)/);
  assert.match(c, /ingredientesValidos\(partida\)/);
  assert.match(c, /pista\?\.has\(ing\) && styles\.ingredientePista/);
  assert.match(c, /es el siguiente/);
  assert.match(c, /¡Bien hecho!/);
  assert.match(c, /enPausa\(partida, t\)/);
});
