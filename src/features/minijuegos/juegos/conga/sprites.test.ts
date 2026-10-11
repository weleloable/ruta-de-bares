import assert from 'node:assert/strict';
import { test } from 'node:test';

import { leerControl } from './controlReglas.ts';
import { MAPAS, OBSTACULOS, obstaculos } from './mapas.ts';
import { VARIANTES_AMIGO } from './modelo.ts';
import { definicion, LADO, NUM_ASPECTOS, rectangulos, spriteDeAmigo, SPRITES } from './sprites.ts';

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

test('cada sprite es de 8x8 y solo usa colores de su paleta', () => {
  for (const id of todos) {
    const def = definicion(id);
    assert.equal(def.filas.length, LADO, id);
    for (const fila of def.filas) {
      assert.equal(fila.length, LADO, `${id}: fila "${fila}"`);
      for (const c of fila) if (c !== '.') assert.ok(def.paleta[c], `${id}: falta el color "${c}"`);
    }
  }
});

test('los rectangulos no se solapan y, en celdas multiplo de 8, cubren justo los pixeles del sprite', () => {
  for (const celda of [8, 16, 21, 24, 27, 33]) {
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
      if (celda % LADO !== 0) continue;
      for (let y = 0; y < celda; y++) {
        for (let x = 0; x < celda; x++) {
          const c = def.filas[Math.floor((y / celda) * LADO)][Math.floor((x / celda) * LADO)];
          assert.equal(lienzo[y][x], c === '.' ? null : def.paleta[c], `${id}@${celda} en ${x},${y}`);
        }
      }
    }
  }
});

test('fusionar pixeles reduce las cajas', () => {
  assert.ok(rectangulos(definicion('E'), 24).length < 30);
});

test('el control guardado se lee sin fiarse', () => {
  assert.equal(leerControl('cruceta'), 'cruceta');
  assert.equal(leerControl('deslizar'), 'deslizar');
  assert.equal(leerControl(null), 'deslizar');
  assert.equal(leerControl('{"raro":1}'), 'deslizar');
});
