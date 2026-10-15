import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aplicarPuntuacion, leerRecords, sinRecordDe } from './recordsReglas.ts';

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

test('un record con decimales se guarda con sus dos decimales (La Caña Perfecta)', () => {
  const r = aplicarPuntuacion({}, 'cana-perfecta', 94.666);
  assert.equal(r.esRecord, true);
  assert.equal(r.records['cana-perfecta'], 94.67);
  // Mejorar por una centesima ya es un record; igualar, no.
  assert.equal(aplicarPuntuacion(r.records, 'cana-perfecta', 94.68).esRecord, true);
  assert.equal(aplicarPuntuacion(r.records, 'cana-perfecta', 94.67).esRecord, false);
});

test('al cambiar la escala de la caña se descarta SU record y solo ese', () => {
  const antes = { 'cana-perfecta': 97, 'conga-cervecera': 5000, 'tapon-al-vuelo': 800 };
  assert.deepEqual(sinRecordDe(antes, 'cana-perfecta'), { 'conga-cervecera': 5000, 'tapon-al-vuelo': 800 });
  // No toca el original, y quitar lo que no hay no rompe nada.
  assert.equal(antes['cana-perfecta'], 97);
  assert.deepEqual(sinRecordDe({}, 'cana-perfecta'), {});
  // Tras descartarlo, una nota nueva de la escala nueva si es record.
  assert.equal(aplicarPuntuacion(sinRecordDe(antes, 'cana-perfecta'), 'cana-perfecta', 88.4).esRecord, true);
});
