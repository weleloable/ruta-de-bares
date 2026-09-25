import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DISTANCIA_CIERRE, VELOCIDAD_CIERRE, debeCerrarAlSoltar } from './arrastre.ts';

describe('debeCerrarAlSoltar', () => {
  it('un arrastre largo cierra aunque sea lento', () => {
    assert.equal(debeCerrarAlSoltar(DISTANCIA_CIERRE, 0.05), true);
  });

  it('un arrastre corto y lento vuelve a su sitio', () => {
    assert.equal(debeCerrarAlSoltar(DISTANCIA_CIERRE - 1, 0.1), false);
  });

  it('un gesto corto pero rapido (flick) cierra', () => {
    assert.equal(debeCerrarAlSoltar(30, VELOCIDAD_CIERRE), true);
  });

  it('hacia arriba o sin moverse nunca cierra, por rapido que sea', () => {
    assert.equal(debeCerrarAlSoltar(-200, 3), false);
    assert.equal(debeCerrarAlSoltar(0, 3), false);
  });
});
