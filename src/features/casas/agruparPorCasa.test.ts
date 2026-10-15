import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { agruparPorCasa } from './agruparPorCasa.ts';

const ORDEN = ['mahou', 'cruzcampo', 'estrella', 'alhambra'];
const p = (nombre: string, house: string | null) => ({ nombre, house });

describe('agruparPorCasa', () => {
  it('en el orden de las casas, sin casa al final y sin grupos vacios', () => {
    const grupos = agruparPorCasa(
      [p('Alex', null), p('Anton', 'estrella'), p('Adri', 'mahou'), p('Dudu', 'mahou'), p('Joao', 'alhambra')],
      ORDEN,
    );
    assert.deepEqual(
      grupos.map((g) => [g.casa, g.personas.map((x) => x.nombre)]),
      [
        ['mahou', ['Adri', 'Dudu']],
        ['estrella', ['Anton']],
        ['alhambra', ['Joao']],
        [null, ['Alex']],
      ],
    );
  });

  it('una casa que no conoce va con quien no tiene casa', () => {
    assert.deepEqual(agruparPorCasa([p('X', 'heineken')], ORDEN), [{ casa: null, personas: [p('X', 'heineken')] }]);
  });

  it('lista vacia, ningun grupo', () => {
    assert.deepEqual(agruparPorCasa([], ORDEN), []);
  });
});
