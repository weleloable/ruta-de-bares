import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AvatarAdminRequestRow, MatchAdminReportRow, MatchAdminTicketRow } from '../../types/database';
import {
  accionesTicket,
  alertaDeDenuncia,
  alertaDeSolicitudFoto,
  detalleAlerta,
  MOTIVO_MAX,
  motivoValido,
  cuentaPorFiltro,
  filtrarAlertas,
  hace,
  ordenarAlertas,
  pieAlerta,
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
    reported_in_route: true,
    reported_is_admin: false,
    reported_cana_blocked: false,
    reported_route_banned: false,
    reported_suspended: false,
    handled_by_name: null,
    handler_note: '',
    ...parcial,
  };
}

describe('alertas: una denuncia vista como ticket', () => {
  it('el titulo es el motivo dicho para quien modera', () => {
    assert.equal(alertaDeDenuncia(denuncia({ reason: 'acoso' })).titulo, 'Acoso o insultos');
    assert.equal(alertaDeDenuncia(denuncia({ reason: 'menor' })).titulo, 'Posible menor de edad');
    assert.equal(alertaDeDenuncia(denuncia({ reason: 'suplantacion' })).titulo, 'Suplantación de identidad');
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
    assert.equal(hace('2026-09-15T19:00:00.000Z', AHORA), 'hace 3 días');
  });
});

describe('alertas: que se puede hacer con un ticket', () => {
  it('no se ofrece retirar una foto que ya no esta', () => {
    assert.equal(accionesTicket(ticket()).puedeRetirarFoto, true);
    assert.equal(accionesTicket(ticket({ reported_avatar_url: null })).puedeRetirarFoto, false);
  });

  it('desactivar se ofrece aunque la caña ya este apagada: lo que anade es el veto', () => {
    // Apagada pero sin veto, la persona le da a "Activar" y vuelve.
    assert.equal(accionesTicket(ticket({ reported_active: false })).puedeDesactivar, true);
  });

  it('se puede vetar a quien ya salio de la ruta', () => {
    // Justo el caso que importa: si no, se le expulsa, se sale, y vuelve a
    // entrar con el enlace, que es multiuso y circula por el grupo.
    assert.equal(accionesTicket(ticket({ reported_in_route: false })).puedeExpulsar, true);
  });

  it('una denuncia cerrada no admite sancionar mas', () => {
    const cerrada = accionesTicket(ticket({ status: 'resuelta', resolution: 'sin_accion' }));
    assert.deepEqual(cerrada, {
      puedeRetirarFoto: false,
      puedeDesactivar: false,
      puedeExpulsar: false,
      puedeSuspender: false,
      puedeResolver: false,
      puedeRetirarVetoCana: false,
      puedeRetirarVetoRuta: false,
      puedeReactivarCuenta: false,
    });
  });

  it('pero un veto se retira aunque la denuncia este cerrada', () => {
    // El DSA da 6 meses para reclamar: una sancion que no se puede deshacer
    // deja ese derecho en nada.
    const cerrada = accionesTicket(
      ticket({ status: 'resuelta', resolution: 'expulsada_de_ruta', reported_route_banned: true }),
    );
    assert.equal(cerrada.puedeRetirarVetoRuta, true);
    assert.equal(cerrada.puedeExpulsar, false, 'expulsar dos veces no tiene sentido');
  });

  it('no se ofrece vetar dos veces lo mismo', () => {
    assert.equal(accionesTicket(ticket({ reported_cana_blocked: true })).puedeDesactivar, false);
    assert.equal(accionesTicket(ticket({ reported_route_banned: true })).puedeExpulsar, false);
    assert.equal(accionesTicket(ticket({ reported_suspended: true })).puedeSuspender, false);
  });

  it('a un admin no se le veta de ninguna forma', () => {
    const contraAdmin = accionesTicket(ticket({ reported_is_admin: true }));
    assert.equal(contraAdmin.puedeExpulsar, false);
    assert.equal(contraAdmin.puedeSuspender, false);
  });
});

describe('alertas: el motivo es obligatorio', () => {
  it('vacio o solo espacios no vale: sin motivo no hay sancion', () => {
    assert.equal(motivoValido(''), false);
    assert.equal(motivoValido('   '), false);
    assert.equal(motivoValido('Acoso repetido'), true);
  });

  it('tampoco vale pasarse del tope que acepta el servidor', () => {
    assert.equal(motivoValido('a'.repeat(MOTIVO_MAX)), true);
    assert.equal(motivoValido('a'.repeat(MOTIVO_MAX + 1)), false);
  });
});

describe('alertas: como se propone cerrar', () => {
  it('propone la medida mas grave de las tomadas', () => {
    assert.equal(resolucionSugerida(ticket(), ['foto_retirada']), 'foto_retirada');
    assert.equal(resolucionSugerida(ticket(), ['foto_retirada', 'cana_desactivada']), 'cana_desactivada');
    assert.equal(
      resolucionSugerida(ticket(), ['cana_desactivada', 'foto_retirada', 'expulsada_de_ruta']),
      'expulsada_de_ruta',
      'expulsar es mas grave, aunque se hiciera antes',
    );
    assert.equal(
      resolucionSugerida(ticket(), ['expulsada_de_ruta', 'cuenta_suspendida']),
      'cuenta_suspendida',
      'suspender la cuenta es lo mas grave de todo',
    );
  });

  it('sin acciones, propone cerrar sin accion', () => {
    assert.equal(resolucionSugerida(ticket(), []), 'sin_accion');
  });

  it('un motivo "otro" se cierra como "otra" salvo que se haya actuado', () => {
    assert.equal(resolucionSugerida(ticket({ reason: 'otro' }), []), 'otra');
    assert.equal(resolucionSugerida(ticket({ reason: 'otro' }), ['cana_desactivada']), 'cana_desactivada');
  });
});

function solicitudFoto(parcial: Partial<AvatarAdminRequestRow> = {}): AvatarAdminRequestRow {
  return {
    id: 'f1',
    created_at: '2026-09-18T20:00:00.000Z',
    status: 'pendiente',
    reason: null,
    user_id: 'u-ana',
    user_name: 'Ana',
    foto_path: 'u-ana/avatar-x.jpg',
    thumb_path: 'u-ana/avatar-x-mini.jpg',
    current_avatar_url: null,
    current_avatar_thumb_url: null,
    decided_by: null,
    decided_by_name: null,
    decided_at: null,
    ...parcial,
  };
}

describe('alertas: una foto de perfil vista como alerta', () => {
  it('una pendiente es una alerta pendiente, de tipo foto_perfil, sobre quien la sube', () => {
    const alerta = alertaDeSolicitudFoto(solicitudFoto());
    assert.equal(alerta.tipo, 'foto_perfil');
    assert.equal(alerta.estado, 'pendiente');
    assert.equal(alerta.sobre, 'Ana');
    assert.equal(alerta.titulo, 'Foto de perfil nueva');
    assert.equal(alerta.veredicto, undefined);
    assert.equal(alerta.cuando, '2026-09-18T20:00:00.000Z');
  });

  it('aprobada o rechazada cuentan como resueltas y guardan el veredicto', () => {
    const aprobada = alertaDeSolicitudFoto(solicitudFoto({ status: 'aprobada' }));
    const rechazada = alertaDeSolicitudFoto(solicitudFoto({ status: 'rechazada', reason: 'Tapada' }));
    assert.equal(aprobada.estado, 'resuelta');
    assert.equal(aprobada.veredicto, 'aprobada');
    assert.equal(rechazada.estado, 'resuelta');
    assert.equal(rechazada.veredicto, 'rechazada');
  });

  it('entra en los mismos filtros y cuentas que las denuncias', () => {
    const mezcla = [
      alertaDeDenuncia(denuncia({ id: 'r1', status: 'pendiente' })),
      alertaDeSolicitudFoto(solicitudFoto({ id: 'f1' })),
      alertaDeSolicitudFoto(solicitudFoto({ id: 'f2', status: 'aprobada' })),
    ];
    assert.equal(filtrarAlertas(mezcla, 'abiertas').length, 2);
    assert.equal(cuentaPorFiltro(mezcla).pendiente, 2);
    assert.equal(cuentaPorFiltro(mezcla).resuelta, 1);
  });

  it('se ordena junto a las denuncias: lo abierto primero y lo mas viejo antes', () => {
    const mezcla = [
      alertaDeSolicitudFoto(solicitudFoto({ id: 'nueva', created_at: '2026-09-18T20:30:00.000Z' })),
      alertaDeDenuncia(denuncia({ id: 'vieja', created_at: '2026-09-18T19:00:00.000Z' })),
      alertaDeSolicitudFoto(solicitudFoto({ id: 'cerrada', status: 'rechazada', created_at: '2026-09-18T10:00:00.000Z' })),
    ];
    assert.deepEqual(ordenarAlertas(mezcla).map((a) => a.id), ['vieja', 'nueva', 'cerrada']);
  });

  it('el mismo id puede existir como denuncia y como foto sin confundirse: manda el tipo', () => {
    const [d, f] = [alertaDeDenuncia(denuncia({ id: 'x' })), alertaDeSolicitudFoto(solicitudFoto({ id: 'x' }))];
    assert.notEqual(d.tipo, f.tipo);
  });
});

describe('alertas: como se pinta cada fila', () => {
  it('una denuncia sigue diciendo sobre quien y de quien, y cuantos mensajes trae', () => {
    const alerta = alertaDeDenuncia(denuncia());
    assert.equal(detalleAlerta(alerta), 'Sobre Luis · de Ana');
    assert.equal(pieAlerta(alerta), '2 mensajes copiados');
  });

  it('una denuncia con un solo mensaje, sin mensajes, o ya cerrada, como antes', () => {
    assert.equal(pieAlerta(alertaDeDenuncia(denuncia({ mensajes: 1 }))), '1 mensaje copiado');
    assert.equal(pieAlerta(alertaDeDenuncia(denuncia({ mensajes: 0 }))), 'Sin mensajes');
    assert.equal(
      pieAlerta(alertaDeDenuncia(denuncia({ mensajes: 0, status: 'resuelta', resolution: 'foto_retirada' }))),
      'Sin mensajes · Foto retirada',
    );
  });

  it('una foto dice solo de quien es, sin repetir el nombre', () => {
    assert.equal(detalleAlerta(alertaDeSolicitudFoto(solicitudFoto())), 'Ana');
  });

  it('una foto pendiente dice que espera; decidida, como acabo', () => {
    assert.equal(pieAlerta(alertaDeSolicitudFoto(solicitudFoto())), 'Espera que la apruebes');
    assert.equal(pieAlerta(alertaDeSolicitudFoto(solicitudFoto({ status: 'aprobada' }))), 'Aprobada');
    assert.equal(pieAlerta(alertaDeSolicitudFoto(solicitudFoto({ status: 'rechazada' }))), 'Rechazada');
  });
});
