import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  avisoDeConflicto,
  CUERPO_MAX,
  cuerpoValido,
  estadoMensaje,
  MENSAJES_POR_DIA,
  pieDeMiMensaje,
  tituloMensaje,
  traducirErrorMensaje,
} from './reglas.ts';

describe('cuerpoValido', () => {
  it('algo escrito, si', () => {
    assert.equal(cuerpoValido('Hola'), true);
  });

  it('vacio o solo espacios, no: el servidor tambien lo rechaza', () => {
    assert.equal(cuerpoValido(''), false);
    assert.equal(cuerpoValido('   \n  '), false);
  });

  it('el tope es el mismo que el del servidor', () => {
    assert.equal(cuerpoValido('a'.repeat(CUERPO_MAX)), true);
    assert.equal(cuerpoValido('a'.repeat(CUERPO_MAX + 1)), false);
  });
});

describe('tituloMensaje y estadoMensaje', () => {
  it('distinguen contacto de reclamacion: no es lo mismo para quien lo lee', () => {
    assert.notEqual(tituloMensaje('contacto'), tituloMensaje('reclamacion'));
    assert.match(tituloMensaje('reclamacion'), /Reclamaci/);
  });

  it('cada estado tiene su frase, y ninguna es el codigo crudo', () => {
    for (const estado of ['pendiente', 'en_revision', 'resuelta'] as const) {
      const texto = estadoMensaje(estado);
      assert.ok(texto.length > 0 && !texto.includes('_'), `${estado} sin frase`);
    }
  });
});

describe('pieDeMiMensaje', () => {
  it('respondida: se ensena la respuesta', () => {
    assert.equal(pieDeMiMensaje({ status: 'resuelta', answer: 'Lo hemos revisado' }), 'Lo hemos revisado');
  });

  it('sin respuesta todavia, lo dice: si no, parece que se perdio', () => {
    assert.match(pieDeMiMensaje({ status: 'pendiente', answer: '' }), /Todav/);
    assert.match(pieDeMiMensaje({ status: 'en_revision', answer: '' }), /revisando/);
  });

  it('resuelta sin texto no deja el hueco vacio', () => {
    assert.ok(pieDeMiMensaje({ status: 'resuelta', answer: '' }).length > 0);
  });
});

describe('traducirErrorMensaje', () => {
  it('el tope diario se explica, y dice cuantos son', () => {
    const texto = traducirErrorMensaje('TOO_MANY_MESSAGES');
    assert.match(texto, new RegExp(String(MENSAJES_POR_DIA)));
    assert.ok(!texto.includes('TOO_MANY_MESSAGES'));
  });

  it('los demas codigos tampoco salen crudos', () => {
    for (const codigo of ['BODY_REQUIRED', 'BODY_TOO_LONG', 'NOTICE_NOT_FOUND', 'NOT_AUTHENTICATED']) {
      assert.ok(!traducirErrorMensaje(codigo).includes(codigo), `${codigo} sale crudo`);
    }
  });

  it('la migracion sin aplicar se dice claro', () => {
    const postgrest = 'Could not find the function public.send_admin_message in the schema cache';
    assert.match(traducirErrorMensaje(postgrest), /0026/);
  });

  it('lo que no conoce pasa tal cual', () => {
    assert.equal(traducirErrorMensaje('Se cayo la red'), 'Se cayo la red');
  });
});

describe('avisoDeConflicto', () => {
  it('avisa cuando la decision reclamada la tomo quien la esta mirando', () => {
    // Art. 20.6 del DSA: la revision no puede ser automatica.
    const texto = avisoDeConflicto({ kind: 'reclamacion', decidido_por_mi: true });
    assert.ok(texto && /tomaste t/.test(texto));
  });

  it('no avisa si la tomo otra persona', () => {
    assert.equal(avisoDeConflicto({ kind: 'reclamacion', decidido_por_mi: false }), null);
  });

  it('ni en un mensaje normal, que no reclama nada', () => {
    assert.equal(avisoDeConflicto({ kind: 'contacto', decidido_por_mi: true }), null);
  });
});
