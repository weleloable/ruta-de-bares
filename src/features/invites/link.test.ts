import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildInviteUrl,
  buildShareMessage,
  isValidTokenShape,
  parseInviteToken,
} from './link.ts';

const TOKEN = 'aB3-_dEfGhIjKlMnOpQrStUvWxYz0123456789abcde'; // 43 chars base64url

describe('isValidTokenShape', () => {
  it('acepta 43 caracteres base64url', () => {
    assert.equal(TOKEN.length, 43);
    assert.ok(isValidTokenShape(TOKEN));
  });

  it('rechaza longitudes distintas y caracteres fuera del alfabeto', () => {
    assert.ok(!isValidTokenShape(TOKEN.slice(0, 42)));
    assert.ok(!isValidTokenShape(`${TOKEN}x`));
    assert.ok(!isValidTokenShape(`${TOKEN.slice(0, 42)}+`));
    assert.ok(!isValidTokenShape(`${TOKEN.slice(0, 42)}=`));
    assert.ok(!isValidTokenShape(''));
  });
});

describe('buildInviteUrl', () => {
  it('construye el deep link', () => {
    assert.equal(buildInviteUrl(TOKEN), `rutadebares://invitacion?token=${TOKEN}`);
  });

  it('se niega a construir un enlace con un token invalido', () => {
    assert.throws(() => buildInviteUrl('corto'), /invalido/);
  });

  it('lo que construye, se parsea', () => {
    assert.equal(parseInviteToken(buildInviteUrl(TOKEN)), TOKEN);
  });
});

describe('parseInviteToken', () => {
  it('lee el deep link de produccion', () => {
    assert.equal(parseInviteToken(`rutadebares://invitacion?token=${TOKEN}`), TOKEN);
  });

  it('lee la url del servidor de desarrollo de Expo', () => {
    assert.equal(
      parseInviteToken(`exp://192.168.1.40:8081/--/invitacion?token=${TOKEN}`),
      TOKEN,
    );
  });

  it('lee un enlace https con otros parametros delante', () => {
    assert.equal(
      parseInviteToken(`https://ruta.example/invitacion?utm=wa&token=${TOKEN}`),
      TOKEN,
    );
  });

  it('acepta el token pegado a mano, con espacios sobrantes', () => {
    assert.equal(parseInviteToken(`  ${TOKEN}\n`), TOKEN);
  });

  it('devuelve null cuando no hay token con forma valida', () => {
    assert.equal(parseInviteToken(''), null);
    assert.equal(parseInviteToken('   '), null);
    assert.equal(parseInviteToken('rutadebares://invitacion'), null);
    assert.equal(parseInviteToken('rutadebares://invitacion?token=corto'), null);
    assert.equal(parseInviteToken('hola que tal'), null);
  });

  it('no confunde otro parametro que acabe en token', () => {
    assert.equal(parseInviteToken(`rutadebares://x?mytoken=${TOKEN}`), null);
  });
});

describe('buildShareMessage', () => {
  it('nombra la ruta, y lleva enlace y codigo', () => {
    const mensaje = buildShareMessage(TOKEN, 'Ruta de La Latina');
    assert.ok(mensaje.includes(buildInviteUrl(TOKEN)));
    assert.ok(mensaje.includes(TOKEN));
    assert.ok(mensaje.includes('Ruta de La Latina'));
  });

  it('sin nombre de ruta no deja unas comillas vacias colgando', () => {
    const mensaje = buildShareMessage(TOKEN, '   ');
    assert.ok(!mensaje.includes('""'));
    assert.ok(mensaje.startsWith('Te apuntas a la ruta?'));
  });

  it('el codigo va aparte del enlace: en la web el deep link no abre nada', () => {
    const mensaje = buildShareMessage(TOKEN, 'Ruta');
    const lineas = mensaje.split('\n');
    assert.ok(
      lineas.some((l) => l === TOKEN),
      'el token tiene que ir en su propia linea para poder copiarlo suelto',
    );
  });
});
