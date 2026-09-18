import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MatchAdminReportRow, MatchAdminTicketRow } from '../../types/database';
import {
  accionesTicket,
  alertaDeDenuncia,
  cuentaPorFiltro,
  filtrarAlertas,
  hace,
  ordenarAlertas,
  resolucionSugerida,
} from './alertas.ts';

const AHORA = new Date('2026-09-18T21:00:00.000Z');

function denuncia(parcial: Partial<MatchAdminReportRow> = {}): MatchAdminReportRow {
  return {
    id: 'r1',
    created_at: '2026-09-18T19:00:00.000Z',
    status: 'pendiente',
    reason: 'acoso',
    detail: 'Un texto desagradable',
    route_id: 'ruta-1',
    reporter_id: 'u-ana',
    reporter_name: 'Ana',
    reported_id: 'u-luis',
    reported_name: 'Luis',
    mensajes: 2,
    notified_at: null,
    handled_by: null,
    handled_at: null,
    resolution: null,
    ...parcial,
  };
}

function ticket(parcial: Partial<MatchAdminTicketRow> = {}): MatchAdminTicketRow {
  return {
    ...denuncia(),
    route_name: 'Compostelana',
    reported_avatar_url: 'https://ejemplo.test/foto.jpg',
    reported_bio: 'Hola',
    reported_active: true,
    handled_by_name: null,
    handler_note: '',
    ...parcial,
  };
}

describe('alertas: una denuncia vista como ticket', () => {
  it('el titulo es el motivo dicho para quien modera', () => {
    assert.equal(alertaDeDenuncia(denuncia({ reason: 'acoso' })).titulo, 'Acoso o insultos');
    assert.equal(alertaDeDenuncia(denuncia({ reason: 'menor' })).titulo, 'Posible menor de edad');
    assert.equal(alertaDeDenuncia(denuncia({ reason: 'suplantacion' })).titulo, 'Suplantacion de identidad');
  });

  it('lleva quien y sobre quien, que es lo que se lee de un vistazo', () => {
    const alerta = alertaDeDenuncia(denuncia());
    assert.equal(alerta.sobre, 'Luis');
    assert.equal(alerta.de, 'Ana');
    assert.equal(alerta.mensajes, 2);
    assert.equal(alerta.tipo, 'denuncia_cana');
  });
});

describe('alertas: filtros', () => {
  const alertas = [
    alertaDeDenuncia(denuncia({ id: 'a', status: 'pendiente' })),
    alertaDeDenuncia(denuncia({ id: 'b', status: 'en_revision' })),
    alertaDeDenuncia(denuncia({ id: 'c', status: 'resuelta', resolution: 'foto_retirada' })),
  ];

  it('"sin cerrar" junta pendientes y en revision', () => {
    assert.deepEqual(filtrarAlertas(alertas, 'abiertas').map((a) => a.id), ['a', 'b']);
  });

  it('cada chip lleva su cuenta', () => {
    assert.deepEqual(cuentaPorFiltro(alertas), { abiertas: 2, pendiente: 1, en_revision: 1, resuelta: 1 });
  });
});

describe('alertas: orden', () => {
  it('lo que queda por hacer va primero y de mas vieja a mas nueva', () => {
    const alertas = [
      alertaDeDenuncia(denuncia({ id: 'nueva', created_at: '2026-09-18T20:00:00.000Z' })),
      alertaDeDenuncia(denuncia({ id: 'cerrada', created_at: '2026-09-18T20:30:00.000Z', status: 'resuelta' })),
      alertaDeDenuncia(denuncia({ id: 'vieja', created_at: '2026-09-17T10:00:00.000Z' })),
    ];
    assert.deepEqual(ordenarAlertas(alertas).map((a) => a.id), ['vieja', 'nueva', 'cerrada']);
  });

  it('entre las cerradas manda la mas reciente', () => {
    const alertas = [
      alertaDeDenuncia(denuncia({ id: 'antigua', created_at: '2026-09-10T10:00:00.000Z', status: 'resuelta' })),
      alertaDeDenuncia(denuncia({ id: 'reciente', created_at: '2026-09-17T10:00:00.000Z', status: 'resuelta' })),
    ];
    assert.deepEqual(ordenarAlertas(alertas).map((a) => a.id), ['reciente', 'antigua']);
  });
});

describe('alertas: cuanto lleva esperando', () => {
  it('cuenta en minutos, horas y dias', () => {
    assert.equal(hace('2026-09-18T20:59:40.000Z', AHORA), 'ahora mismo');
    assert.equal(hace('2026-09-18T20:35:00.000Z', AHORA), 'hace 25 min');
    assert.equal(hace('2026-09-18T19:00:00.000Z', AHORA), 'hace 2 h');
    assert.equal(hace('2026-09-17T19:00:00.000Z', AHORA), 'ayer');
    assert.equal(hace('2026-09-15T19:00:00.000Z', AHORA), 'hace 3 dias');
  });
});

describe('alertas: que se puede hacer con un ticket', () => {
  it('no se ofrece retirar una foto que ya no esta', () => {
    assert.equal(accionesTicket(ticket()).puedeRetirarFoto, true);
    assert.equal(accionesTicket(ticket({ reported_avatar_url: null })).puedeRetirarFoto, false);
  });

  it('no se ofrece desactivar una cana ya apagada', () => {
    assert.equal(accionesTicket(ticket({ reported_active: false })).puedeDesactivar, false);
  });

  it('una denuncia cerrada no admite nada mas', () => {
    const cerrada = accionesTicket(ticket({ status: 'resuelta', resolution: 'sin_accion' }));
    assert.deepEqual(cerrada, { puedeRetirarFoto: false, puedeDesactivar: false, puedeResolver: false });
  });
});

describe('alertas: como se propone cerrar', () => {
  it('propone lo que ya se ha hecho, y desactivar manda sobre retirar la foto', () => {
    assert.equal(resolucionSugerida(ticket(), ['foto_retirada']), 'foto_retirada');
    assert.equal(resolucionSugerida(ticket(), ['foto_retirada', 'cana_desactivada']), 'cana_desactivada');
  });

  it('sin acciones, propone cerrar sin accion', () => {
    assert.equal(resolucionSugerida(ticket(), []), 'sin_accion');
  });

  it('un motivo "otro" se cierra como "otra" salvo que se haya actuado', () => {
    assert.equal(resolucionSugerida(ticket({ reason: 'otro' }), []), 'otra');
    assert.equal(resolucionSugerida(ticket({ reason: 'otro' }), ['cana_desactivada']), 'cana_desactivada');
  });
});
