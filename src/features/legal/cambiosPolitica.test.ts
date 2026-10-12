import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CAMBIOS_POLITICA, queHacerConAviso } from './cambiosPolitica.ts';

describe('aviso de politica nueva', () => {
  const V = '2026-10-12';

  it('avisa a quien vio una version vieja o ninguna, una sola vez', () => {
    assert.equal(queHacerConAviso('2026-10-11', V, '2026-09-01T10:00:00Z'), 'avisar');
    assert.equal(queHacerConAviso(null, V, '2026-09-01T10:00:00Z'), 'avisar');
    assert.equal(queHacerConAviso(V, V, '2026-09-01T10:00:00Z'), 'nada');
  });

  it('quien se dio de alta con esta version ya la acepto: se marca sin avisar', () => {
    assert.equal(queHacerConAviso(null, V, '2026-10-12T21:00:00Z'), 'marcar');
    assert.equal(queHacerConAviso(null, V, '2026-11-02T08:00:00Z'), 'marcar');
  });

  it('sin la 0063 (no viene la columna) no se avisa', () => {
    assert.equal(queHacerConAviso(undefined, V, '2026-09-01T10:00:00Z'), 'nada');
  });

  it('hay algo que contar', () => {
    assert.ok(CAMBIOS_POLITICA.length > 0);
  });
});
