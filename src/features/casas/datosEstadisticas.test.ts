import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { destacadas, origenPrincipal, origenes, type FilaEstadistica } from './datosEstadisticas.ts';

const f = (house: string, extra: Partial<FilaEstadistica> = {}): FilaEstadistica => ({
  house,
  miembros: 4,
  sellos: 0,
  consumiciones: 0,
  p_sellos: 0,
  p_consumo: 0,
  p_juegos: 0,
  p_social: 0,
  p_otros: 0,
  ...extra,
});

describe('estadisticas de casas', () => {
  it('el origen que mas pesa, y nada si no hay puntos', () => {
    assert.equal(origenPrincipal(f('mahou', { p_sellos: 40, p_juegos: 25, p_social: 5 }))?.id, 'sellos');
    assert.equal(origenPrincipal(f('mahou', { p_juegos: 30, p_sellos: 10 }))?.id, 'juegos');
    assert.equal(origenPrincipal(f('mahou')), null);
    assert.deepEqual(origenes(f('mahou')).map((o) => o.id), ['sellos', 'consumo', 'juegos', 'social', 'otros']);
  });

  it('cada titulo es de la casa con mas por persona, no con mas en total', () => {
    const filas = [
      f('mahou', { miembros: 8, sellos: 16, p_juegos: 20 }), // 2 sellos/persona, 2,5 pts juegos
      f('cruzcampo', { miembros: 2, sellos: 6, p_juegos: 10 }), // 3 sellos/persona, 5 pts juegos
      f('estrella', { miembros: 4, p_social: 8, consumiciones: 12 }),
      f('alhambra', { miembros: 0, sellos: 99 }), // sin gente: no cuenta
    ];
    const d = Object.fromEntries(destacadas(filas).map((x) => [x.id, x]));
    assert.deepEqual(d.andariega?.casas, ['cruzcampo']);
    assert.equal(d.andariega?.valor, 3);
    assert.deepEqual(d.jugona?.casas, ['cruzcampo']);
    assert.deepEqual(d.sociable?.casas, ['estrella']);
    assert.equal(d.sociable?.valor, 2);
    assert.deepEqual(d.catadora?.casas, ['estrella']);
    assert.equal(d.catadora?.valor, 3);
  });

  it('empates comparten el titulo, y sin datos no se corona a nadie', () => {
    const d = Object.fromEntries(
      destacadas([f('mahou', { sellos: 8 }), f('cruzcampo', { sellos: 8 }), f('estrella', { sellos: 4 }), f('alhambra')]).map((x) => [x.id, x]),
    );
    assert.deepEqual(d.andariega?.casas, ['mahou', 'cruzcampo']);
    assert.deepEqual(d.jugona?.casas, []);
    assert.equal(d.jugona?.valor, null);
  });
});
