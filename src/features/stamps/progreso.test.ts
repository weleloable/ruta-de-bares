import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { credencialCompleta } from './progreso.ts';

describe('credencialCompleta', () => {
  it('todos los bares sellados: completa', () => {
    assert.equal(credencialCompleta(5, 5), true);
  });
  it('falta uno: no', () => {
    assert.equal(credencialCompleta(4, 5), false);
  });
  it('ninguno: no', () => {
    assert.equal(credencialCompleta(0, 5), false);
  });
  it('una ruta sin bares no esta completa (0 de 0)', () => {
    assert.equal(credencialCompleta(0, 0), false);
  });
  it('un solo bar, sellado: completa', () => {
    assert.equal(credencialCompleta(1, 1), true);
  });
});
