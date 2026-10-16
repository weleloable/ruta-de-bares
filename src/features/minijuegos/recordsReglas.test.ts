import assert from 'node:assert/strict';
import { test } from 'node:test';

import { esMejorNota } from './nota.ts';
import { aplicarPuntuacion as aplicarCon, leerRecords, MAS_ES_MEJOR, sinRecordDe } from './recordsReglas.ts';

// Como lo llama la app (records.ts): con el sentido que dice nota.ts.
const aplicarPuntuacion = (r: Record<string, number>, juego: string, n: number) =>
  aplicarCon(r, juego, n, (nueva, anterior) => esMejorNota(juego, nueva, anterior));

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

test('Parejas de Barra: el record es nuevo si el tiempo BAJA', () => {
  const P = 'parejas-de-barra';
  const r = aplicarPuntuacion({}, P, 31.456);
  assert.equal(r.esRecord, true, 'sin record previo, cualquier tiempo lo es');
  assert.equal(r.records[P], 31.46);
  assert.equal(aplicarPuntuacion(r.records, P, 28.1).esRecord, true);
  assert.equal(aplicarPuntuacion(r.records, P, 31.46).esRecord, false, 'empatar no');
  const peor = aplicarPuntuacion(r.records, P, 45);
  assert.equal(peor.esRecord, false, 'tardar mas no es record');
  assert.equal(peor.records[P], 31.46, 'y no pisa el mejor');
});

test('los de "mas es mejor" no cambian con el juego nuevo al lado', () => {
  const base = { 'tapon-al-vuelo': 800, 'parejas-de-barra': 20 };
  assert.equal(aplicarPuntuacion(base, 'tapon-al-vuelo', 900).esRecord, true);
  assert.equal(aplicarPuntuacion(base, 'tapon-al-vuelo', 700).esRecord, false);
  // MAS_ES_MEJOR (records por nivel de ¿Conduces tu?) igual que siempre.
  assert.equal(aplicarCon({ x: 100 }, 'x', 120, MAS_ES_MEJOR).esRecord, true);
  assert.equal(aplicarCon({ x: 100 }, 'x', 80, MAS_ES_MEJOR).esRecord, false);
});
