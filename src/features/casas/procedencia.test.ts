import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nombreProcedencia, vecesProcedencia } from './procedencia.ts';

const l = (tipo: string, extra: Record<string, unknown> = {}) => ({ tipo, detalle: null, puesto: null, veces: 1, ...extra });

describe('procedencia de los puntos', () => {
  it('nombres, en singular o plural segun las veces', () => {
    assert.equal(nombreProcedencia(l('sello')), 'Sello');
    assert.equal(nombreProcedencia(l('sello', { veces: 4 })), 'Sellos');
    assert.equal(nombreProcedencia(l('categoria_nueva', { veces: 2 })), 'Categorías nuevas');
    assert.equal(nombreProcedencia(l('qr')), 'Encuentro por QR');
    assert.equal(nombreProcedencia(l('ruta_completa')), 'Ruta completada');
  });

  it('podios con juego y puesto, retos con su nombre', () => {
    assert.equal(nombreProcedencia(l('podio', { detalle: 'cana-perfecta', puesto: 1 })), '1.º en La Caña Perfecta');
    assert.equal(nombreProcedencia(l('podio', { detalle: 'otro-juego', puesto: 3 })), '3.º en otro-juego');
    assert.equal(nombreProcedencia(l('reto', { detalle: 'Peregrino' })), 'Reto «Peregrino»');
  });

  it('las veces solo salen si hay mas de una', () => {
    assert.equal(vecesProcedencia({ tipo: 'sello', veces: 3 }), '×3');
    assert.equal(vecesProcedencia({ tipo: 'sello', veces: 1 }), null);
    assert.equal(vecesProcedencia({ tipo: 'ruta_completa', veces: 1 }), null);
  });
});
