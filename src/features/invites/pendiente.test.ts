import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  guardarInvitacionPendiente,
  olvidarInvitacionPendiente,
  tomarInvitacionPendiente,
} from './pendiente.ts';

const TOKEN = 'aB3-_dEfGhIjKlMnOpQrStUvWxYz0123456789abcde';

describe('invitacion pendiente', () => {
  beforeEach(() => olvidarInvitacionPendiente());

  it('sin nada guardado no devuelve nada', () => {
    assert.equal(tomarInvitacionPendiente(), null);
  });

  it('guarda y devuelve el token', () => {
    guardarInvitacionPendiente(TOKEN);
    assert.equal(tomarInvitacionPendiente(), TOKEN);
  });

  it('es de un solo uso: la segunda vez ya no esta', () => {
    guardarInvitacionPendiente(TOKEN);
    tomarInvitacionPendiente();
    assert.equal(
      tomarInvitacionPendiente(),
      null,
      'un token que revive mete a alguien en una ruta que ya no esperaba',
    );
  });

  it('guardar otro pisa al anterior: vale el ultimo enlace abierto', () => {
    guardarInvitacionPendiente(TOKEN);
    guardarInvitacionPendiente('otro');
    assert.equal(tomarInvitacionPendiente(), 'otro');
  });

  it('olvidar lo borra sin tener que consumirlo', () => {
    guardarInvitacionPendiente(TOKEN);
    olvidarInvitacionPendiente();
    assert.equal(tomarInvitacionPendiente(), null);
  });
});
