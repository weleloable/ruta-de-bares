import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { combinarInvitaciones } from './historial.ts';
import type { RouteInviteRow } from '../../types/database.ts';

const invitacion = (id: string, routeId: string): RouteInviteRow => ({
  id,
  route_id: routeId,
  token: 'aB3-_dEfGhIjKlMnOpQrStUvWxYz0123456789abcde',
  max_uses: 10,
  created_by: 'admin',
  created_at: '2026-09-17T10:00:00Z',
  expires_at: '2026-09-17T18:00:00Z',
  revoked_at: null,
});

const RUTAS = [
  { id: 'r1', name: 'Ruta de La Latina' },
  { id: 'r2', name: 'Ruta de Malasana' },
];

describe('combinarInvitaciones', () => {
  it('pone a cada invitacion el nombre de su ruta', () => {
    const filas = combinarInvitaciones(
      [invitacion('i1', 'r1'), invitacion('i2', 'r2')],
      [],
      RUTAS,
    );
    assert.deepEqual(
      filas.map((f) => f.routeName),
      ['Ruta de La Latina', 'Ruta de Malasana'],
    );
  });

  it('cuenta las plazas gastadas por invitacion', () => {
    const filas = combinarInvitaciones(
      [invitacion('i1', 'r1'), invitacion('i2', 'r1')],
      [{ invite_id: 'i1' }, { invite_id: 'i1' }, { invite_id: 'i2' }],
      RUTAS,
    );
    assert.equal(filas[0].usos, 2);
    assert.equal(filas[1].usos, 1);
  });

  it('una invitacion que nadie uso va a cero, no a undefined', () => {
    const filas = combinarInvitaciones([invitacion('i1', 'r1')], [], RUTAS);
    assert.equal(filas[0].usos, 0);
  });

  it('los miembros del backfill (invite_id null) no gastan plaza de nadie', () => {
    // La migracion 0004 mete como miembros a quien ya tenia sellos, sin
    // invitacion. Si contaran, el historial diria que enlaces recien creados
    // ya estan llenos.
    const filas = combinarInvitaciones(
      [invitacion('i1', 'r1')],
      [{ invite_id: null }, { invite_id: null }, { invite_id: 'i1' }],
      RUTAS,
    );
    assert.equal(filas[0].usos, 1);
  });

  it('miembros de OTRA invitacion no se cuelan en el recuento', () => {
    const filas = combinarInvitaciones(
      [invitacion('i1', 'r1')],
      [{ invite_id: 'i-otra' }, { invite_id: 'i1' }],
      RUTAS,
    );
    assert.equal(filas[0].usos, 1);
  });

  it('si la ruta no esta en la lista lo dice, en vez de quedarse en blanco', () => {
    const filas = combinarInvitaciones([invitacion('i1', 'fantasma')], [], RUTAS);
    assert.equal(filas[0].routeName, 'Ruta borrada');
  });

  it('conserva el orden que venia de la consulta', () => {
    const filas = combinarInvitaciones(
      [invitacion('i2', 'r2'), invitacion('i1', 'r1')],
      [],
      RUTAS,
    );
    assert.deepEqual(filas.map((f) => f.id), ['i2', 'i1']);
  });
});
