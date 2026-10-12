import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATEGORIAS, describirErrorConsumicion, mmss, siguientePermitida, ultimoBarSellado } from './reglasConsumo.ts';

describe('consumiciones', () => {
  it('las siete categorias, con "sin alcohol" la primera', () => {
    assert.deepEqual(CATEGORIAS.map((c) => c.id), ['sin_alcohol', 'tercio', 'jarra', 'vino', 'sidra', 'chupito', 'copa']);
  });

  it('el ultimo bar sellado es el de la ruta con el sello mas reciente', () => {
    const bares = new Set(['a', 'b']);
    const sellos = [
      { route_bar_id: 'a', stamped_at: '2026-10-17T20:00:00Z' },
      { route_bar_id: 'b', stamped_at: '2026-10-17T21:00:00Z' },
      { route_bar_id: 'otra-ruta', stamped_at: '2026-10-17T22:00:00Z' },
    ];
    assert.equal(ultimoBarSellado(sellos, bares), 'b');
    assert.equal(ultimoBarSellado([], bares), null);
  });

  it('la siguiente se puede a los N minutos de la ultima', () => {
    const ahora = new Date('2026-10-17T21:10:00Z');
    const mias = [{ created_at: '2026-10-17T20:00:00Z' }, { created_at: '2026-10-17T21:00:00Z' }];
    assert.deepEqual(siguientePermitida(mias, 30, ahora), new Date('2026-10-17T21:30:00Z'));
    assert.equal(siguientePermitida(mias, 5, ahora), null, 'ya han pasado');
    assert.equal(siguientePermitida([], 30, ahora), null);
    assert.equal(mmss(new Date('2026-10-17T21:30:00Z'), ahora), '20:00');
  });

  it('los errores del servidor se leen en castellano', () => {
    assert.match(describirErrorConsumicion('ERROR: P0001: NOT_LAST_BAR'), /otro bar/);
    assert.match(describirErrorConsumicion('TOO_SOON'), /tiempo mínimo/);
    assert.match(describirErrorConsumicion('Could not find the function public.registrar_consumicion'), /0045/);
  });
});
