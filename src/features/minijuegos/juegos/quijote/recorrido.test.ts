import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALCALA, enAlcala, entradasAlcala, mensajeFinal } from './recorrido.ts';

describe('quijote: Alcala', () => {
  it('cada tanto se entra en Alcala, y se sale', () => {
    assert.equal(enAlcala(ALCALA.primero - 1), null);
    assert.equal(enAlcala(ALCALA.primero + 10), 10);
    assert.equal(enAlcala(ALCALA.primero + ALCALA.largo + 1), null);
    assert.equal(enAlcala(ALCALA.primero + ALCALA.cada + 5), 5);
  });

  it('las entradas que caen en un tramo de camino', () => {
    assert.deepEqual(entradasAlcala(0, ALCALA.primero - 1), []);
    assert.deepEqual(entradasAlcala(0, ALCALA.primero + ALCALA.cada), [ALCALA.primero, ALCALA.primero + ALCALA.cada]);
    assert.deepEqual(entradasAlcala(ALCALA.primero + 1, ALCALA.primero + ALCALA.cada - 1), []);
  });
});

describe('quijote: el mensaje del final', () => {
  it('lo mas llamativo manda', () => {
    assert.equal(mensajeFinal({ metros: 5000, jarras: 80, molinos: 3 }), 'Has derribado 3 gigantes. Rocinante pide un descanso.');
    assert.match(mensajeFinal({ metros: 200, jarras: 3, molinos: 1 }), /Un gigante/);
    assert.match(mensajeFinal({ metros: 3500, jarras: 10, molinos: 0 }), /más lejos/);
    assert.match(mensajeFinal({ metros: 100, jarras: 0, molinos: 0 }), /encantadores/);
  });
});
