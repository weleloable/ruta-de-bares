import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { esMejorNota, formatearNota, JUEGOS_CON_DECIMALES, JUEGOS_MENOS_ES_MEJOR, redondearNota } from './nota.ts';

describe('formatearNota', () => {
  it('La Caña Perfecta: dos decimales con coma, siempre', () => {
    assert.equal(formatearNota('cana-perfecta', 99.03), '99,03');
    assert.equal(formatearNota('cana-perfecta', 99), '99,00');
    assert.equal(formatearNota('cana-perfecta', 100), '100,00');
    assert.equal(formatearNota('cana-perfecta', 0), '0,00');
    assert.equal(formatearNota('cana-perfecta', 87.5), '87,50');
  });

  it('Pulso de Camarero: un porcentaje con dos decimales y coma, siempre, y mas es mejor', () => {
    assert.equal(formatearNota('pulso-de-camarero', 68.4), '68,40');
    assert.equal(formatearNota('pulso-de-camarero', 100), '100,00');
    assert.equal(formatearNota('pulso-de-camarero', 0), '0,00');
    assert.equal(formatearNota('pulso-de-camarero', 1234.5678), '1234,57');
    assert.equal(formatearNota('pulso-de-camarero', 88.9949), '88,99');
    assert.ok(!formatearNota('pulso-de-camarero', 68.4).endsWith(' s'), 'no es un tiempo');
    assert.ok(esMejorNota('pulso-de-camarero', 88.99, 88.98));
    assert.ok(!esMejorNota('pulso-de-camarero', 88.98, 88.99));
    assert.ok(!esMejorNota('pulso-de-camarero', 88.98, 88.98), 'empatar no es mejorar');
  });

  it('el resto de los juegos siguen en enteros', () => {
    assert.equal(formatearNota('conga-cervecera', 12345), '12345');
    assert.equal(formatearNota('tapon-al-vuelo', 1250), '1250');
    assert.equal(formatearNota('quien-quiere-ser-cervecero', 4), '4');
    assert.equal(formatearNota('barman-express', 2345), '2345');
    assert.equal(formatearNota('quijote-cervecero', 123456), '123456');
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
    // Pulso de Camarero: dos decimales, redondeo normal; Conga y Tapon, los de siempre, no cambian.
    assert.equal(redondearNota('pulso-de-camarero', 68.4567), 68.46);
    assert.equal(redondearNota('pulso-de-camarero', 99.994), 99.99);
    assert.equal(redondearNota('tapon-al-vuelo', 1249.6), 1250);
  });

  it('es estable: redondear dos veces da lo mismo', () => {
    for (const x of [0, 1.005, 33.335, 99.999, 100]) {
      assert.equal(redondearNota('cana-perfecta', redondearNota('cana-perfecta', x)), redondearNota('cana-perfecta', x));
    }
  });

  it('llevan decimales la caña, Pulso de Camarero y Parejas de Barra (el tiempo)', () => {
    assert.deepEqual([...JUEGOS_CON_DECIMALES].sort(), ['cana-perfecta', 'parejas-de-barra', 'pulso-de-camarero']);
    assert.equal(redondearNota('parejas-de-barra', 23.4666), 23.47);
  });
});

describe('Parejas de Barra: la nota es un tiempo', () => {
  it('se escribe con dos decimales y "s"', () => {
    assert.equal(formatearNota('parejas-de-barra', 23.47), '23,47 s');
    assert.equal(formatearNota('parejas-de-barra', 4), '4,00 s');
  });
});

describe('esMejorNota: el sentido de la nota', () => {
  it('solo Parejas de Barra es "menos es mejor"', () => {
    assert.deepEqual([...JUEGOS_MENOS_ES_MEJOR], ['parejas-de-barra']);
  });

  it('Parejas de Barra: mejora si BAJA; empatar o subir, no', () => {
    assert.equal(esMejorNota('parejas-de-barra', 20.5, 23.47), true);
    assert.equal(esMejorNota('parejas-de-barra', 23.47, 23.47), false);
    assert.equal(esMejorNota('parejas-de-barra', 30, 23.47), false);
  });

  it('los de siempre no cambian: mejora si SUBE', () => {
    for (const juego of ['cana-perfecta', 'conga-cervecera', 'tapon-al-vuelo', 'quien-quiere-ser-cervecero']) {
      assert.equal(esMejorNota(juego, 51, 50), true, juego);
      assert.equal(esMejorNota(juego, 50, 50), false, juego);
      assert.equal(esMejorNota(juego, 10, 50), false, juego);
    }
  });

  it('Barman Express: ENTEROS y MAS es mejor (no esta en ninguna de las dos listas)', () => {
    assert.equal(JUEGOS_CON_DECIMALES.has('barman-express'), false);
    assert.equal(JUEGOS_MENOS_ES_MEJOR.has('barman-express'), false);
    assert.equal(formatearNota('barman-express', 1830), '1830');
    assert.equal(redondearNota('barman-express', 1830.6), 1831);
    assert.equal(esMejorNota('barman-express', 2000, 1830), true);
    assert.equal(esMejorNota('barman-express', 1500, 1830), false);
  });

  it('sin nota anterior, cualquiera es mejor (tambien en los de tiempo)', () => {
    assert.equal(esMejorNota('parejas-de-barra', 599, undefined), true);
    assert.equal(esMejorNota('cana-perfecta', 0, undefined), true);
  });
});
