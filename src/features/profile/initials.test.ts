import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { initials } from './initials.ts';

describe('initials', () => {
  it('usa nombre y apellido cuando hay dos palabras', () => {
    assert.equal(initials('Eduardo Almarza', 'x@y.com'), 'EA');
  });

  it('una sola palabra da sus dos primeras letras', () => {
    assert.equal(initials('Marta', 'x@y.com'), 'MA');
  });

  it('sin nombre cae al correo y parte por @ y puntos', () => {
    assert.equal(initials('', 'eduardo.almarza@gmail.com'), 'EA');
    assert.equal(initials('   ', 'marta@gmail.com'), 'MA');
  });

  it('nunca devuelve cadena vacia ni undefined', () => {
    for (const [nombre, correo] of [
      ['', ''],
      ['   ', '   '],
      ['-', '@'],
      ['___', '...'],
    ]) {
      const resultado = initials(nombre, correo);
      assert.ok(resultado.length > 0, `"${nombre}" / "${correo}"`);
      assert.ok(!resultado.includes('undefined'));
    }
  });

  it('siempre en mayusculas', () => {
    assert.equal(initials('ana lopez', 'x@y.com'), 'AL');
  });
});
