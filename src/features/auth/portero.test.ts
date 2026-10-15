import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { destinoDelPortero } from './portero.ts';

const TOKEN = 'A'.repeat(43);
const invitacion = { pathname: '/invitacion', params: { token: TOKEN } };

describe('portero: sin sesion', () => {
  it('manda al login desde cualquier pantalla privada', () => {
    for (const primero of ['(tabs)', 'editor', 'admin', 'cana', undefined]) {
      assert.deepEqual(destinoDelPortero({ sesion: false, primero, pendiente: null }), { pathname: '/login' }, String(primero));
    }
  });

  it('deja en paz login, registro, invitacion y privacidad', () => {
    for (const primero of ['(auth)', 'invitacion', 'privacidad']) {
      assert.equal(destinoDelPortero({ sesion: false, primero, pendiente: TOKEN }), null, primero);
    }
  });
});

describe('portero: con sesion', () => {
  it('en login o registro: a la invitacion si hay una pendiente, si no a la raiz', () => {
    assert.deepEqual(destinoDelPortero({ sesion: true, primero: '(auth)', pendiente: TOKEN }), invitacion);
    assert.deepEqual(destinoDelPortero({ sesion: true, primero: '(auth)', pendiente: null }), { pathname: '/' });
  });

  it('LA CLAVE: con una pendiente va a la invitacion aunque la sesion aparezca en la app (vuelta de Google, enlace del correo)', () => {
    for (const primero of ['(tabs)', undefined, 'avisos']) {
      assert.deepEqual(destinoDelPortero({ sesion: true, primero, pendiente: TOKEN }), invitacion, String(primero));
    }
  });

  it('sin pendiente no mueve a nadie de donde esta', () => {
    for (const primero of ['(tabs)', 'editor', 'cana', undefined]) {
      assert.equal(destinoDelPortero({ sesion: true, primero, pendiente: null }), null, String(primero));
    }
  });

  it('en la propia invitacion o en privacidad no se toca: sin bucle', () => {
    for (const primero of ['invitacion', 'privacidad']) {
      assert.equal(destinoDelPortero({ sesion: true, primero, pendiente: TOKEN }), null, primero);
    }
  });
});
