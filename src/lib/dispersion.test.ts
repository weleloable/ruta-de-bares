import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crearAgrupador, esperaAleatoria } from './dispersion.ts';

test('esperaAleatoria queda en [0, max) y no falla con un maximo raro', () => {
  assert.equal(esperaAleatoria(5000, () => 0), 0);
  assert.equal(esperaAleatoria(5000, () => 0.999999), 4999);
  assert.equal(esperaAleatoria(0), 0);
  assert.equal(esperaAleatoria(-3), 0);
  assert.equal(esperaAleatoria(Number.NaN), 0);
});

test('crearAgrupador junta varias peticiones seguidas en una sola ejecucion', async () => {
  let veces = 0;
  const a = crearAgrupador(() => void veces++, 20, () => 0.5);
  for (let i = 0; i < 100; i++) a.pedir();
  assert.equal(veces, 0, 'no se ejecuta en el acto');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(veces, 1);
  a.pedir();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(veces, 2, 'tras ejecutarse, la siguiente peticion vuelve a programar');
});

test('crearAgrupador.cancelar descarta lo pendiente', async () => {
  let veces = 0;
  const a = crearAgrupador(() => void veces++, 10, () => 0.5);
  a.pedir();
  a.cancelar();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(veces, 0);
});
