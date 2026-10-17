import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { avanzarBocadillos, crearBocadillos, elegirFrase, FRASES, TIEMPOS } from './bocadillos.ts';

const azar = () => 0.3;

describe('quijote: bocadillos', () => {
  it('dice algo cuando pasa algo, y se calla al rato', () => {
    const b = crearBocadillos(azar);
    avanzarBocadillos(b, 1, ['molino'], azar);
    assert.ok(FRASES.molino.includes(b.texto!));
    avanzarBocadillos(b, 1 + TIEMPOS.dura + 0.1, [], azar);
    assert.equal(b.texto, null);
  });

  it('no se atropella: lo normal espera el respiro; un gigante derribado se dice siempre', () => {
    const b = crearBocadillos(azar);
    avanzarBocadillos(b, 1, ['choque'], azar);
    const primero = b.texto;
    avanzarBocadillos(b, 1.5, ['molino'], azar);
    assert.equal(b.texto, primero, 'el molino espera');
    avanzarBocadillos(b, 1 + TIEMPOS.dura + 1, ['molino'], azar);
    assert.equal(b.texto, null, 'y despues sigue callado un buen rato');
    avanzarBocadillos(b, 1.6, ['gigante'], azar);
    assert.ok(FRASES.gigante.includes(b.texto!));
  });

  it('si llegan dos a la vez, gana lo mas importante', () => {
    const b = crearBocadillos(azar);
    avanzarBocadillos(b, 1, ['molino', 'embestida'], azar);
    assert.ok(FRASES.embestida.includes(b.texto!));
  });

  it('no repite una frase hasta haber dicho todas las de su lista', () => {
    const b = crearBocadillos(azar);
    const vistas = Array.from({ length: FRASES.suelta.length }, () => elegirFrase(b, 'suelta', Math.random));
    assert.equal(new Set(vistas).size, FRASES.suelta.length);
  });

  it('de vez en cuando suelta una sin motivo', () => {
    const b = crearBocadillos(azar);
    avanzarBocadillos(b, TIEMPOS.sueltaMax + 1, [], azar);
    assert.ok(FRASES.suelta.includes(b.texto!));
  });
});
