import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lider, ordenarRanking, subidas, type FilaServidor } from './ranking.ts';

const f = (house: FilaServidor['house'], puntos: number): FilaServidor => ({ house, puntos, miembros: 2 });

describe('ranking de casas', () => {
  it('ordena por puntos, con barra respecto al lider y lo que falta', () => {
    const r = ordenarRanking([f('mahou', 30), f('cruzcampo', 60), f('estrella', 0), f('alhambra', 45)]);
    assert.deepEqual(r.map((x) => [x.house, x.puesto, x.progreso, x.aLider]), [
      ['cruzcampo', 1, 1, 0],
      ['alhambra', 2, 0.75, 15],
      ['mahou', 3, 0.5, 30],
      ['estrella', 4, 0, 60],
    ]);
    assert.equal(r[0].sobreSiguiente, 15);
    assert.equal(lider(r), 'cruzcampo');
  });

  it('los empates comparten puesto, y empatados arriba no hay lider', () => {
    const r = ordenarRanking([f('mahou', 20), f('cruzcampo', 20), f('estrella', 10), f('alhambra', 10)]);
    assert.deepEqual(r.map((x) => x.puesto), [1, 1, 3, 3]);
    assert.equal(lider(r), null);
  });

  it('con todo a cero no hay lider ni barras', () => {
    const r = ordenarRanking([f('mahou', 0), f('cruzcampo', 0), f('estrella', 0), f('alhambra', 0)]);
    assert.ok(r.every((x) => x.progreso === 0 && x.puesto === 1));
    assert.equal(lider(r), null);
  });

  it('detecta cuanto ha subido cada casa (y solo subidas)', () => {
    const antes = [f('mahou', 10), f('cruzcampo', 20)];
    const ahora = [f('mahou', 20), f('cruzcampo', 15)];
    assert.deepEqual(subidas(antes, ahora), { mahou: 10 });
    assert.deepEqual(subidas([], ahora), {}, 'la primera lectura no cuenta como subida');
  });
});
