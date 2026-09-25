import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diametroExteriorChapa, ladoChapa, sobresaleChapa } from './chapa.ts';

describe('chapa', () => {
  it('con el logo del tamano del hueco original, la imagen mide lo mismo que el original', () => {
    assert.equal(ladoChapa(202), 350);
  });

  it('para un logo de 88 px la imagen mide unos 152 px', () => {
    assert.ok(Math.abs(ladoChapa(88) - 152.48) < 0.01);
  });

  it('el aro exterior de un logo de 88 px mide unos 109 px', () => {
    assert.ok(Math.abs(diametroExteriorChapa(88) - 108.91) < 0.01);
  });

  it('sobresale del logo unos 10 px por cada lado', () => {
    assert.ok(Math.abs(sobresaleChapa(88) - 10.45) < 0.01);
  });

  it('escala en proporcion: el doble de logo, el doble de chapa', () => {
    assert.ok(Math.abs(ladoChapa(176) - 2 * ladoChapa(88)) < 1e-9);
  });
});
