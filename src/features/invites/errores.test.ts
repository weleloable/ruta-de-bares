import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { traducirErrorInvitacion } from './errores.ts';

describe('traducirErrorInvitacion', () => {
  it('traduce el codigo aunque venga envuelto en el texto del driver', () => {
    assert.equal(
      traducirErrorInvitacion('invalid input: INVITE_FULL (PL/pgSQL function ...)'),
      'Esta invitacion ya ha agotado sus plazas.',
    );
  });

  it('no distingue "no existe" de "caducada" de "anulada"', () => {
    // A proposito: la funcion de Postgres tampoco lo distingue, para no ser un
    // oraculo con el que adivinar tokens. El mensaje no puede delatar mas que ella.
    const texto = traducirErrorInvitacion('INVITE_UNUSABLE');
    assert.match(texto, /no existe/);
    assert.match(texto, /caducado/);
    assert.match(texto, /anulado/);
  });

  it('cubre todos los codigos que lanza la migracion 0004', () => {
    for (const codigo of [
      'INVITE_FULL',
      'INVITE_UNUSABLE',
      'NOT_AUTHENTICATED',
      'FORBIDDEN',
      'ROUTE_NOT_FOUND',
      'BAD_EXPIRY',
    ]) {
      assert.notEqual(
        traducirErrorInvitacion(codigo),
        codigo,
        `${codigo} llega al usuario sin traducir`,
      );
    }
  });

  it('un error que no conoce pasa tal cual, sin tragarselo', () => {
    assert.equal(traducirErrorInvitacion('connection refused'), 'connection refused');
  });
});
