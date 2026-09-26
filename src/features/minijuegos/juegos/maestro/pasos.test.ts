import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anterior, numeroPaso, PASOS, puedeAvanzar, RECETA_VACIA, recetaCompleta, siguiente } from './pasos.ts';

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

test('cada paso exige lo suyo para avanzar', () => {
  assert.equal(puedeAvanzar('malta', RECETA_VACIA), false);
  assert.equal(puedeAvanzar('malta', { ...RECETA_VACIA, malta: 'negra' }), true);
  assert.equal(puedeAvanzar('maceracion', RECETA_VACIA), false);
  // Una precision de 0 es haber jugado: no es lo mismo que no haber jugado.
  assert.equal(puedeAvanzar('maceracion', { ...RECETA_VACIA, maceracion: 0 }), true);
  assert.equal(puedeAvanzar('lupulo', RECETA_VACIA), false);
  assert.equal(puedeAvanzar('lupulo', { ...RECETA_VACIA, lupulo: { amargor: 0, aroma: 0 } }), true);
  assert.equal(puedeAvanzar('fermentacion', RECETA_VACIA), false);
  assert.equal(puedeAvanzar('fermentacion', { ...RECETA_VACIA, levadura: 'ale' }), true);
});

test('numeroPaso va de 1 a 4 y el resultado no tiene', () => {
  assert.deepEqual(PASOS.map(numeroPaso), [1, 2, 3, 4]);
  assert.equal(numeroPaso('resultado'), null);
});

test('recetaCompleta solo devuelve algo con todo relleno (0 cuenta como relleno)', () => {
  assert.equal(recetaCompleta(RECETA_VACIA), null);
  const casi = { malta: 'negra', maceracion: 0.5, lupulo: null, levadura: 'ale' } as const;
  assert.equal(recetaCompleta(casi), null);
  const todo = { malta: 'negra', maceracion: 0, lupulo: { amargor: 0, aroma: 0 }, levadura: 'ale' } as const;
  assert.deepEqual(recetaCompleta(todo), todo);
});
