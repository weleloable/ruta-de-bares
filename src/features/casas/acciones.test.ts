import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describirErrorPanel, detalleMovimiento, leerPuntosAjuste, nombreAccion } from './acciones.ts';

describe('acciones del panel', () => {
  it('nombres y detalle de cada movimiento', () => {
    assert.equal(nombreAccion('categoria_nueva'), 'Categoría nueva');
    assert.equal(nombreAccion('otra'), 'otra');
    assert.equal(detalleMovimiento({ action: 'reto', detail: { reto: 'x', nombre: 'Peregrino' } }), 'Peregrino');
    assert.equal(detalleMovimiento({ action: 'ajuste', detail: { motivo: 'Penalización' } }), 'Penalización');
    assert.equal(detalleMovimiento({ action: 'racha', detail: { usuarios: ['a', 'b', 'c'] } }), '3 personas');
    assert.equal(detalleMovimiento({ action: 'sello', detail: null }), null);
  });

  it('los puntos de un ajuste', () => {
    assert.equal(leerPuntosAjuste('+12'), 12);
    assert.equal(leerPuntosAjuste('-5'), -5);
    assert.equal(leerPuntosAjuste('0'), null);
    assert.equal(leerPuntosAjuste('2000'), null);
    assert.equal(leerPuntosAjuste('diez'), null);
  });

  it('errores en castellano', () => {
    assert.match(describirErrorPanel('ERROR: REASON_REQUIRED'), /motivo/);
    assert.match(describirErrorPanel('PGRST202'), /0048/);
  });
});
