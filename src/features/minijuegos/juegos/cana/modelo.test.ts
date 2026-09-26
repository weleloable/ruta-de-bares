import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ASENTAMIENTO, avanzar, desbordado, ESTADO_VACIO, fraccionEspuma, LINEA, puntuar, total } from './modelo.ts';

test('recto da mucha espuma e inclinado 45 grados, poca', () => {
  assert.ok(fraccionEspuma(0) > 0.6);
  assert.ok(fraccionEspuma(45) <= 0.1 + 1e-9);
  assert.ok(fraccionEspuma(80) >= 0.08);
});

test('con el grifo cerrado no entra nada y la espuma se asienta en liquido', () => {
  const antes = { liquido: 0.4, espuma: 0.2 };
  const despues = avanzar(antes, 1, false, 0);
  assert.ok(Math.abs(total(despues) - total(antes)) < 1e-9);
  assert.ok(Math.abs(despues.espuma - 0.2 * Math.exp(-ASENTAMIENTO)) < 1e-9);
});

test('la espuma no desaparece en pocos segundos: aguanta la corona', () => {
  let e = { liquido: 0.7, espuma: 0.18 };
  for (let i = 0; i < 10 * 60; i++) e = avanzar(e, 1 / 60, false, 0);
  // 10 s despues sigue quedando mas de la mitad.
  assert.ok(e.espuma > 0.09, `quedan ${e.espuma}`);
  assert.ok(Math.abs(total(e) - 0.88) < 1e-9);
});

test('el asentamiento no depende del tamano del fotograma', () => {
  const grande = avanzar({ liquido: 0.5, espuma: 0.2 }, 1, false, 0);
  let pequeno = { liquido: 0.5, espuma: 0.2 };
  for (let i = 0; i < 100; i++) pequeno = avanzar(pequeno, 0.01, false, 0);
  assert.ok(Math.abs(grande.espuma - pequeno.espuma) < 1e-9);
});

test('la espuma nunca se vuelve negativa', () => {
  const despues = avanzar({ liquido: 0.5, espuma: 0.001 }, 5, false, 0);
  assert.ok(despues.espuma >= 0);
});

test('con el grifo abierto el total sube', () => {
  const e = avanzar(ESTADO_VACIO, 1, true, 20);
  assert.ok(total(e) > 0.15);
});

test('desborda cuando pasa del borde', () => {
  assert.equal(desbordado({ liquido: 0.9, espuma: 0.1 }), false);
  assert.equal(desbordado({ liquido: 0.9, espuma: 0.2 }), true);
});

test('una cana de manual saca casi todos los puntos', () => {
  const total88 = LINEA;
  const e = { liquido: total88 * 0.82, espuma: total88 * 0.18 };
  const d = puntuar(e, 6, false);
  assert.equal(d.nivel, 40);
  assert.equal(d.espuma, 40);
  assert.equal(d.rapidez, 20);
  assert.equal(d.total, 100);
});

test('un vaso de espuma puntua mal la espuma', () => {
  const d = puntuar({ liquido: 0.1, espuma: 0.78 }, 6, false);
  assert.equal(d.espuma, 0);
});

test('un vaso sin espuma tambien se penaliza, pero menos que uno de espuma', () => {
  const d = puntuar({ liquido: LINEA, espuma: 0 }, 6, false);
  assert.ok(d.espuma < 40 && d.espuma > 0);
});

test('desbordar o servir en vacio es 0', () => {
  assert.equal(puntuar({ liquido: 0.9, espuma: 0.3 }, 3, true).total, 0);
  assert.equal(puntuar({ liquido: 0.9, espuma: 0.3 }, 3, false).total, 0);
  assert.equal(puntuar(ESTADO_VACIO, 3, false).total, 0);
});

test('la rapidez baja con el tiempo y llega a 0', () => {
  const e = { liquido: LINEA * 0.82, espuma: LINEA * 0.18 };
  assert.ok(puntuar(e, 13, false).rapidez < puntuar(e, 6, false).rapidez);
  assert.equal(puntuar(e, 20, false).rapidez, 0);
  assert.equal(puntuar(e, 60, false).rapidez, 0);
});

test('el desglose suma el total', () => {
  const d = puntuar({ liquido: 0.5, espuma: 0.2 }, 10, false);
  assert.equal(d.total, d.nivel + d.espuma + d.rapidez);
});
