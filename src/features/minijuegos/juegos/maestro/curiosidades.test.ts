import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CURIOSIDADES, elegirDato } from './curiosidades.ts';
import { PASOS } from './pasos.ts';

test('hay al menos un dato por cada paso', () => {
  for (const paso of PASOS) assert.ok(CURIOSIDADES[paso].length >= 1, paso);
});

test('cada dato es una frase corta y sin repetirse', () => {
  const vistos = new Set<string>();
  for (const paso of PASOS) {
    for (const dato of CURIOSIDADES[paso]) {
      assert.ok(dato.length <= 140, `demasiado largo (${dato.length}): ${dato}`);
      assert.ok(dato.endsWith('.'), dato);
      // Una sola frase: ningun punto en medio.
      assert.ok(!dato.slice(0, -1).includes('. '), dato);
      assert.ok(!vistos.has(dato), `repetido: ${dato}`);
      vistos.add(dato);
    }
  }
});

test('elegirDato devuelve un dato del paso, tambien con el azar en el borde', () => {
  for (const paso of PASOS) {
    for (const azar of [0, 0.5, 0.999999, 1]) {
      assert.ok(CURIOSIDADES[paso].includes(elegirDato(paso, () => azar)), `${paso} ${azar}`);
    }
  }
});
