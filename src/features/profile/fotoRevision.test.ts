import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  avisoDeSolicitud,
  codigoErrorFoto,
  mensajeTrasEnviar,
  nombresFicheroAvatar,
  traducirErrorFoto,
  type SolicitudFotoPropia,
} from './fotoRevision.ts';

const UID = '00000000-0000-4000-8000-00000000000a';
// El mismo patron que exige avatar_request_submit() en 0020.
const PATRON_SQL = new RegExp(`^${UID}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$`);

function solicitud(cambios: Partial<SolicitudFotoPropia> = {}): SolicitudFotoPropia {
  return { id: 's1', status: 'pendiente', reason: null, created_at: '2026-09-19T10:00:00Z', ...cambios };
}

describe('nombresFicheroAvatar', () => {
  const azarFijo = () => 0.5;

  it('van dentro de la carpeta del uid y la miniatura es hermana de la foto', () => {
    const n = nombresFicheroAvatar(UID, 1_700_000_000_000, azarFijo);
    assert.ok(n.foto.startsWith(`${UID}/avatar-`));
    assert.ok(n.foto.endsWith('.jpg'));
    assert.equal(n.miniatura, n.foto.replace(/\.jpg$/, '-mini.jpg'));
  });

  it('cumplen el patron que exige el servidor', () => {
    const n = nombresFicheroAvatar(UID, 1_700_000_000_000, Math.random);
    assert.match(n.foto, PATRON_SQL);
    assert.match(n.miniatura, PATRON_SQL);
    assert.ok(!n.foto.includes('..') && !n.miniatura.includes('..'));
    assert.notEqual(n.foto, n.miniatura);
  });

  it('caben aunque el azar toque los extremos', () => {
    for (const extremo of [0, 0.9999999999]) {
      const n = nombresFicheroAvatar(UID, Number.MAX_SAFE_INTEGER, () => extremo);
      assert.match(n.foto, PATRON_SQL);
      assert.match(n.miniatura, PATRON_SQL);
    }
  });

  it('dos envios en el mismo milisegundo no coinciden: el sufijo aleatorio los separa', () => {
    let i = 0;
    const secuencia = () => ((i += 7) % 100) / 100;
    const a = nombresFicheroAvatar(UID, 5, secuencia);
    const b = nombresFicheroAvatar(UID, 5, secuencia);
    assert.notEqual(a.foto, b.foto);
  });

  it('el sufijo aleatorio existe: mismo uid y misma hora con azar distinto dan nombres distintos', () => {
    const a = nombresFicheroAvatar(UID, 5, () => 0.1);
    const b = nombresFicheroAvatar(UID, 5, () => 0.9);
    assert.notEqual(a.foto, b.foto);
  });
});

describe('avisoDeSolicitud', () => {
  it('sin solicitud no hay nada que decir', () => {
    assert.equal(avisoDeSolicitud(null), null);
  });

  it('pendiente: dice que esta en revision y que se sigue viendo la anterior', () => {
    const aviso = avisoDeSolicitud(solicitud());
    assert.equal(aviso?.tono, 'info');
    assert.match(aviso?.texto ?? '', /revisión/);
    assert.match(aviso?.texto ?? '', /anterior/);
  });

  it('rechazada: enseña el motivo que escribio el admin', () => {
    const aviso = avisoDeSolicitud(solicitud({ status: 'rechazada', reason: 'Sale tapada la cara' }));
    assert.equal(aviso?.tono, 'error');
    assert.match(aviso?.texto ?? '', /Sale tapada la cara/);
  });

  it('rechazada sin motivo (no deberia pasar, el servidor lo exige) no rompe ni deja un hueco', () => {
    for (const reason of [null, '', '   ']) {
      const aviso = avisoDeSolicitud(solicitud({ status: 'rechazada', reason }));
      assert.equal(aviso?.tono, 'error');
      assert.ok(!/: \./.test(aviso?.texto ?? ''), `hueco en "${aviso?.texto}"`);
    }
  });

  it('aprobada o sustituida no dicen nada: la foto ya esta puesta o hay otra en camino', () => {
    assert.equal(avisoDeSolicitud(solicitud({ status: 'aprobada' })), null);
    assert.equal(avisoDeSolicitud(solicitud({ status: 'sustituida' })), null);
  });
});

describe('mensajeTrasEnviar', () => {
  it('un admin ve la foto cambiada al momento; el resto, que queda en revision', () => {
    assert.equal(mensajeTrasEnviar('aprobada'), 'Foto de perfil actualizada.');
    assert.match(mensajeTrasEnviar('pendiente'), /revisará/);
    assert.match(mensajeTrasEnviar('pendiente'), /anterior/);
  });
});

describe('traducirErrorFoto', () => {
  const codigos = [
    'NOT_AUTHENTICATED',
    'PROFILE_MISSING',
    'NOT_A_MEMBER',
    'TOO_MANY_REQUESTS',
    'INVALID_PATH',
    'FILE_MISSING',
    'PATH_ALREADY_USED',
    'INVALID_URL',
    'AVATAR_NEEDS_REVIEW',
  ];

  it('traduce cada codigo del servidor a algo legible, aunque PostgREST le anada prefijos', () => {
    for (const codigo of codigos) {
      const texto = traducirErrorFoto(`ERROR: ${codigo} (P0001)`);
      assert.ok(!texto.includes(codigo), `${codigo} sin traducir: "${texto}"`);
      assert.ok(texto.length > 10);
    }
  });

  it('un error que no conoce pasa tal cual, sin tragarselo', () => {
    assert.equal(traducirErrorFoto('Network request failed'), 'Network request failed');
    assert.equal(codigoErrorFoto('Network request failed'), null);
  });

  it('no confunde un codigo con una palabra que lo contiene', () => {
    assert.equal(codigoErrorFoto('MY_INVALID_PATHOLOGY'), null);
  });
});
