import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatearNota, JUEGOS_CON_DECIMALES, redondearNota } from './nota.ts';

describe('formatearNota', () => {
  it('La Caña Perfecta: dos decimales con coma, siempre', () => {
    assert.equal(formatearNota('cana-perfecta', 99.03), '99,03');
    assert.equal(formatearNota('cana-perfecta', 99), '99,00');
    assert.equal(formatearNota('cana-perfecta', 100), '100,00');
    assert.equal(formatearNota('cana-perfecta', 0), '0,00');
    assert.equal(formatearNota('cana-perfecta', 87.5), '87,50');
  });

  it('el resto de los juegos siguen en enteros', () => {
    assert.equal(formatearNota('conga-cervecera', 12345), '12345');
    assert.equal(formatearNota('tapon-al-vuelo', 1250), '1250');
    assert.equal(formatearNota('quien-quiere-ser-cervecero', 4), '4');
  });

  it('un valor raro no rompe la pantalla', () => {
    assert.equal(formatearNota('cana-perfecta', Number.NaN), '0');
    assert.equal(formatearNota('cana-perfecta', Number.POSITIVE_INFINITY), '0');
  });
});

describe('redondearNota', () => {
  it('dos decimales en la caña, entero en los demas', () => {
    assert.equal(redondearNota('cana-perfecta', 94.6666), 94.67);
    assert.equal(redondearNota('cana-perfecta', 94.664), 94.66);
    assert.equal(redondearNota('conga-cervecera', 12.6), 13);
  });

  it('es estable: redondear dos veces da lo mismo', () => {
    for (const x of [0, 1.005, 33.335, 99.999, 100]) {
      assert.equal(redondearNota('cana-perfecta', redondearNota('cana-perfecta', x)), redondearNota('cana-perfecta', x));
    }
  });

  it('solo la caña lleva decimales', () => {
    assert.deepEqual([...JUEGOS_CON_DECIMALES], ['cana-perfecta']);
  });
});
