import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aplicarPuntuacion, leerRecords } from './recordsReglas.ts';

test('leerRecords tolera vacio, basura y formas raras', () => {
  assert.deepEqual(leerRecords(null), {});
  assert.deepEqual(leerRecords('no es json'), {});
  assert.deepEqual(leerRecords('[1,2]'), {});
  assert.deepEqual(leerRecords('null'), {});
});

test('leerRecords descarta valores que no son numeros validos', () => {
  const crudo = JSON.stringify({ a: 10, b: 'x', c: -3, d: null });
  assert.deepEqual(leerRecords(crudo), { a: 10 });
});

test('la primera partida es record, incluso con 0 puntos', () => {
  const r = aplicarPuntuacion({}, 'cana', 0);
  assert.equal(r.esRecord, true);
  assert.deepEqual(r.records, { cana: 0 });
});

test('mejorar es record; igualar o empeorar no', () => {
  const base = { cana: 50 };
  assert.equal(aplicarPuntuacion(base, 'cana', 51).esRecord, true);
  assert.equal(aplicarPuntuacion(base, 'cana', 50).esRecord, false);
  assert.equal(aplicarPuntuacion(base, 'cana', 10).esRecord, false);
  assert.deepEqual(aplicarPuntuacion(base, 'cana', 10).records, base);
});

test('no toca los records de otros juegos', () => {
  const r = aplicarPuntuacion({ a: 5 }, 'b', 9);
  assert.deepEqual(r.records, { a: 5, b: 9 });
});

test('una puntuacion no valida se ignora', () => {
  assert.equal(aplicarPuntuacion({}, 'x', NaN).esRecord, false);
  assert.equal(aplicarPuntuacion({}, 'x', -1).esRecord, false);
});
