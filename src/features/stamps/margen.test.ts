import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { etiquetaMargen, ventanaDeSellado } from './margen.ts';

describe('margen de sellado', () => {
  it('ensancha el horario oficial por los dos lados (19:00-19:40 con ±30 es 18:30-20:10)', () => {
    const v = ventanaDeSellado(new Date(2026, 9, 17, 19, 0), new Date(2026, 9, 17, 19, 40), 30);
    assert.deepEqual([v.desde, v.hasta], [new Date(2026, 9, 17, 18, 30), new Date(2026, 9, 17, 20, 10)]);
  });

  it('sin margen (o sin dato) deja el horario oficial, y no acepta valores raros', () => {
    const abre = new Date(2026, 9, 17, 19, 0);
    const cierra = new Date(2026, 9, 17, 20, 0);
    assert.deepEqual(ventanaDeSellado(abre, cierra, null), { desde: abre, hasta: cierra, margen: 0 });
    assert.equal(ventanaDeSellado(abre, cierra, -10).margen, 0);
    assert.equal(ventanaDeSellado(abre, cierra, 999).margen, 180);
  });

  it('la etiqueta del editor', () => {
    assert.equal(etiquetaMargen(0), 'Sin margen');
    assert.equal(etiquetaMargen(30), '±30 min');
  });
});
