import assert from 'node:assert/strict';
import { test } from 'node:test';

import { leerControl } from './controlReglas.ts';
import { MAPAS, OBSTACULOS, obstaculos, TAMANO } from './mapas.ts';
import { VARIANTES_AMIGO } from './modelo.ts';
import { definicion, NUM_ASPECTOS, rectangulos, spriteDeAmigo, SPRITES } from './sprites.ts';

const todos = [...Object.keys(SPRITES), ...Array.from({ length: VARIANTES_AMIGO }, (_, i) => spriteDeAmigo(i))];

test('hay un aspecto dibujado por cada variante de amigo', () => {
  assert.equal(NUM_ASPECTOS, VARIANTES_AMIGO);
  assert.equal(spriteDeAmigo(VARIANTES_AMIGO + 1), 'amigo1');
  assert.equal(spriteDeAmigo(-1), `amigo${VARIANTES_AMIGO - 1}`);
});

test('todo obstaculo de un mapa tiene su sprite', () => {
  for (const o of OBSTACULOS) assert.ok(o in SPRITES, o);
  for (const m of MAPAS) for (const o of obstaculos(m)) assert.ok(definicion(o.id));
});

test('los obstaculos de varias casillas forman bloques completos y se dibujan una vez', () => {
  for (const m of MAPAS) {
    const dibujados = obstaculos(m);
    for (const [id, tam] of Object.entries(TAMANO)) {
      const celdas = m.filas.join('').split('').filter((c) => c === id).length;
      const bloques = dibujados.filter((o) => o.id === id);
      assert.equal(celdas, bloques.length * tam * tam, `${m.id}: bloque de ${id} incompleto`);
      for (const b of bloques) {
        assert.equal(b.tam, tam);
        for (let dy = 0; dy < tam; dy++) for (let dx = 0; dx < tam; dx++) assert.equal(m.filas[b.y + dy][b.x + dx], id);
      }
    }
  }
  // Dos bloques pegados salen como dos.
  const doble = { id: 'd', nombre: 'd', filas: ['CCCC', 'CCCC', '..P.'] };
  assert.deepEqual(obstaculos(doble).map((o) => [o.x, o.y]), [[0, 0], [2, 0]]);
});

test('cada sprite es un cuadrado de 8 o 16 y solo usa colores de su paleta', () => {
  for (const id of todos) {
    const def = definicion(id);
    const lado = def.filas.length;
    assert.ok(lado === 8 || lado === 16, `${id}: ${lado} filas`);
    for (const fila of def.filas) {
      assert.equal(fila.length, lado, `${id}: fila "${fila}"`);
      for (const c of fila) if (c !== '.') assert.ok(def.paleta[c], `${id}: falta el color "${c}"`);
    }
  }
});

test('los rectangulos no se solapan y, en celdas multiplo del lado, cubren justo los pixeles del sprite', () => {
  for (const celda of [8, 16, 21, 24, 27, 32, 33, 48]) {
    for (const id of todos) {
      const def = definicion(id);
      const lienzo = Array.from({ length: celda }, () => Array<string | null>(celda).fill(null));
      for (const r of rectangulos(def, celda)) {
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) {
            assert.equal(lienzo[y][x], null, `${id}@${celda}: solape en ${x},${y}`);
            lienzo[y][x] = r.color;
          }
        }
      }
      const lado = def.filas.length;
      if (celda % lado !== 0) continue;
      for (let y = 0; y < celda; y++) {
        for (let x = 0; x < celda; x++) {
          const c = def.filas[Math.floor((y / celda) * lado)][Math.floor((x / celda) * lado)];
          assert.equal(lienzo[y][x], c === '.' ? null : def.paleta[c], `${id}@${celda} en ${x},${y}`);
        }
      }
    }
  }
});

test('fusionar pixeles reduce las cajas: una fachada de 16x16 no son 256 vistas', () => {
  for (const id of Object.keys(SPRITES)) {
    const def = definicion(id);
    const n = rectangulos(def, 24).length;
    assert.ok(n <= 60, `${id}: ${n} cajas`);
  }
});

test('el control guardado se lee sin fiarse', () => {
  assert.equal(leerControl('cruceta'), 'cruceta');
  assert.equal(leerControl('deslizar'), 'deslizar');
  assert.equal(leerControl(null), 'deslizar');
  assert.equal(leerControl('{"raro":1}'), 'deslizar');
});
