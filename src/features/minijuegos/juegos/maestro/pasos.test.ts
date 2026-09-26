import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anterior, numeroPaso, PASOS, puedeAvanzar, RECETA_VACIA, siguiente } from './pasos.ts';

test('recorre los cuatro pasos y llega al resultado', () => {
  let paso = PASOS[0] as ReturnType<typeof siguiente>;
  const visitados = [paso];
  while (paso !== 'resultado') {
    paso = siguiente(paso);
    visitados.push(paso);
  }
  assert.deepEqual(visitados, ['malta', 'maceracion', 'lupulo', 'fermentacion', 'resultado']);
});

test('el resultado no avanza y desde el se vuelve a fermentacion', () => {
  assert.equal(siguiente('resultado'), 'resultado');
  assert.equal(anterior('resultado'), 'fermentacion');
});

test('no se puede volver atras desde el primer paso', () => {
  assert.equal(anterior('malta'), null);
  assert.equal(anterior('lupulo'), 'maceracion');
});

test('hay que elegir malta y levadura para avanzar; los de habilidad se pasan', () => {
  assert.equal(puedeAvanzar('malta', RECETA_VACIA), false);
  assert.equal(puedeAvanzar('malta', { ...RECETA_VACIA, malta: 'negra' }), true);
  assert.equal(puedeAvanzar('fermentacion', RECETA_VACIA), false);
  assert.equal(puedeAvanzar('fermentacion', { ...RECETA_VACIA, levadura: 'ale' }), true);
  assert.equal(puedeAvanzar('maceracion', RECETA_VACIA), true);
  assert.equal(puedeAvanzar('lupulo', RECETA_VACIA), true);
});

test('numeroPaso va de 1 a 4 y el resultado no tiene', () => {
  assert.deepEqual(PASOS.map(numeroPaso), [1, 2, 3, 4]);
  assert.equal(numeroPaso('resultado'), null);
});
