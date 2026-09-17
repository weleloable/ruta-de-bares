import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { inviteStatus, plazasTexto, type InviteParaEstado } from './estado.ts';

const AHORA = new Date('2026-09-17T12:00:00Z');

const invitacion = (parcial: Partial<InviteParaEstado> = {}): InviteParaEstado => ({
  revoked_at: null,
  expires_at: '2026-09-17T16:00:00Z',
  max_uses: 10,
  usos: 0,
  ...parcial,
});

describe('inviteStatus', () => {
  it('activa mientras quede plaza y no caduque', () => {
    assert.equal(inviteStatus(invitacion({ usos: 3 }), AHORA), 'activa');
  });

  it('caducada cuando pasa expires_at', () => {
    assert.equal(
      inviteStatus(invitacion({ expires_at: '2026-09-17T11:59:59Z' }), AHORA),
      'caducada',
    );
  });

  it('el instante exacto de caducidad ya cuenta como caducada', () => {
    assert.equal(
      inviteStatus(invitacion({ expires_at: AHORA.toISOString() }), AHORA),
      'caducada',
    );
  });

  it('llena al agotar las plazas', () => {
    assert.equal(inviteStatus(invitacion({ max_uses: 5, usos: 5 }), AHORA), 'llena');
  });

  it('llena gana a caducada: cuenta que la invitacion hizo su trabajo', () => {
    assert.equal(
      inviteStatus(
        invitacion({ max_uses: 2, usos: 2, expires_at: '2026-09-16T10:00:00Z' }),
        AHORA,
      ),
      'llena',
    );
  });

  it('anulada gana a todo: fue un acto deliberado y el historial lo conserva', () => {
    assert.equal(
      inviteStatus(
        invitacion({
          revoked_at: '2026-09-17T11:00:00Z',
          max_uses: 2,
          usos: 2,
          expires_at: '2026-09-16T10:00:00Z',
        }),
        AHORA,
      ),
      'anulada',
    );
  });

  it('un uso de mas (no deberia pasar, pero no rompe el historial) sigue siendo llena', () => {
    assert.equal(inviteStatus(invitacion({ max_uses: 2, usos: 3 }), AHORA), 'llena');
  });
});

describe('plazasTexto', () => {
  it('cuenta las gastadas sobre el tope', () => {
    assert.equal(plazasTexto(invitacion({ max_uses: 20, usos: 3 })), '3 de 20 plazas');
  });

  it('singular cuando el tope es una sola plaza', () => {
    assert.equal(plazasTexto(invitacion({ max_uses: 1, usos: 0 })), '0 de 1 plaza');
  });
});
