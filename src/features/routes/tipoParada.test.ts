import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { esSellable, infoTipo, numeroDeBar, rotuloParada, sellables, tipoDe } from './tipoParada.ts';

const RUTA = [
  { id: 'a', tipo: 'bar' },
  { id: 'f', tipo: 'foto' },
  { id: 'b', tipo: 'bar' },
  { id: 'o', tipo: 'otra' },
  { id: 'c' }, // de antes de la 0060: sin tipo
];

describe('tipo de parada', () => {
  it('sin tipo es un bar; solo los bares se sellan', () => {
    assert.equal(tipoDe({}), 'bar');
    assert.equal(tipoDe({ tipo: 'museo' }), 'bar', 'un valor raro no rompe: se trata como bar');
    assert.deepEqual(RUTA.map(esSellable), [true, false, true, false, true]);
    assert.deepEqual(sellables(RUTA).map((p) => p.id), ['a', 'b', 'c']);
  });

  it('los bares se numeran entre ellos, saltandose las otras paradas', () => {
    assert.deepEqual(RUTA.map((p) => numeroDeBar(RUTA, p.id)), [1, null, 2, null, 3]);
  });

  it('el rotulo de la tarjeta: Parada N o el tipo', () => {
    assert.equal(rotuloParada(RUTA, RUTA[2]!), 'Parada 2');
    assert.equal(rotuloParada(RUTA, RUTA[1]!), '📷 Parada de foto');
    assert.equal(rotuloParada(RUTA, RUTA[3]!), '📍 Otra parada');
    assert.equal(infoTipo('foto').nombre, 'Parada de foto');
  });
});
