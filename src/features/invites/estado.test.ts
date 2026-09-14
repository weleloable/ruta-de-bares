import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { inviteStatus } from './estado.ts';

const AHORA = new Date('2026-09-14T12:00:00Z');

describe('inviteStatus', () => {
  it('activa mientras no se use y no caduque', () => {
    assert.equal(
      inviteStatus({ used_at: null, expires_at: '2026-09-21T12:00:00Z' }, AHORA),
      'activa',
    );
  });

  it('caducada cuando pasa expires_at', () => {
    assert.equal(
      inviteStatus({ used_at: null, expires_at: '2026-09-14T11:59:59Z' }, AHORA),
      'caducada',
    );
  });

  it('el instante exacto de caducidad ya cuenta como caducada', () => {
    assert.equal(
      inviteStatus({ used_at: null, expires_at: AHORA.toISOString() }, AHORA),
      'caducada',
    );
  });

  it('usada gana a caducada: el historial no debe perder quien la uso', () => {
    assert.equal(
      inviteStatus(
        { used_at: '2026-09-10T10:00:00Z', expires_at: '2026-09-11T10:00:00Z' },
        AHORA,
      ),
      'usada',
    );
  });
});
