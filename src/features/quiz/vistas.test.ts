import assert from 'node:assert/strict';
import { test } from 'node:test';

import { leerVistas } from './vistas.ts';

const validos = new Set(['n1-01', 'n1-02', 'n2-01']);

test('lee los ids guardados y descarta los que ya no existen y los repetidos', () => {
  assert.deepEqual(leerVistas('["n1-01","zzz","n1-01","n2-01"]', validos), ['n1-01', 'n2-01']);
});

test('lo corrupto o ausente da una lista vacia, nunca un error', () => {
  for (const crudo of [null, '', 'no es json', '{"a":1}', '5', '[1,2,null]']) {
    assert.deepEqual(leerVistas(crudo, validos), [], String(crudo));
  }
});
