import assert from 'node:assert/strict';
import { test } from 'node:test';

import { direccionDeGesto, UMBRAL_DESLIZAR } from './giros.ts';

test('un arrastre largo da la direccion del eje dominante', () => {
  assert.equal(direccionDeGesto(60, 10), 'derecha');
  assert.equal(direccionDeGesto(-60, 10), 'izquierda');
  assert.equal(direccionDeGesto(5, 60), 'abajo');
  assert.equal(direccionDeGesto(5, -60), 'arriba');
});

test('un toque o un temblor no es un giro', () => {
  assert.equal(direccionDeGesto(0, 0), null);
  assert.equal(direccionDeGesto(UMBRAL_DESLIZAR - 1, 3), null);
  assert.equal(direccionDeGesto(UMBRAL_DESLIZAR, 0), 'derecha');
});
