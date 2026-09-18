import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WEB_APP_URL,
  buildAppLink,
  buildInviteUrl,
  buildShareMessage,
  debeCopiarTrasFalloDeCompartir,
  isValidTokenShape,
  parseInviteParam,
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
  it('construye una URL https de la web publicada, no un esquema propio', () => {
    assert.equal(
      buildInviteUrl(TOKEN),
      `https://weleloable.github.io/ruta-de-bares/invitacion?token=${TOKEN}`,
    );
  });

  it('es una URL valida de verdad y el token sale intacto de su query', () => {
    const url = new URL(buildInviteUrl(TOKEN));
    assert.equal(url.protocol, 'https:');
    assert.equal(url.pathname, '/ruta-de-bares/invitacion');
    assert.equal(url.searchParams.get('token'), TOKEN);
  });

  it('WEB_APP_URL no acaba en barra: evitaria un // que Pages no resuelve igual', () => {
    assert.ok(!WEB_APP_URL.endsWith('/'));
    assert.ok(!buildInviteUrl(TOKEN).replace('https://', '').includes('//'));
  });

  it('se niega a construir un enlace con un token invalido', () => {
    assert.throws(() => buildInviteUrl('corto'), /invalido/);
  });

  it('lo que construye, se parsea', () => {
    assert.equal(parseInviteToken(buildInviteUrl(TOKEN)), TOKEN);
  });
});

describe('buildAppLink', () => {
  it('construye el deep link de la app nativa', () => {
    assert.equal(buildAppLink(TOKEN), `rutadebares://invitacion?token=${TOKEN}`);
  });

  it('se niega a construir un enlace con un token invalido', () => {
    assert.throws(() => buildAppLink('corto'), /invalido/);
  });

  it('lo que construye, se parsea', () => {
    assert.equal(parseInviteToken(buildAppLink(TOKEN)), TOKEN);
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

  it('lee el enlace https que se comparte, con o sin barra antes de la query', () => {
    assert.equal(
      parseInviteToken(`https://weleloable.github.io/ruta-de-bares/invitacion?token=${TOKEN}`),
      TOKEN,
    );
    assert.equal(
      parseInviteToken(`https://weleloable.github.io/ruta-de-bares/invitacion/?token=${TOKEN}`),
      TOKEN,
    );
  });

  it('lee el enlace aunque WhatsApp o el correo le peguen puntuacion o un fragmento', () => {
    assert.equal(parseInviteToken(`https://x.io/invitacion?token=${TOKEN}#`), TOKEN);
    assert.equal(parseInviteToken(`(https://x.io/invitacion?token=${TOKEN}).`), TOKEN);
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

  it('con varios token=, vale el primero que tenga forma de token', () => {
    assert.equal(parseInviteToken(`https://x.io/invitacion?token=corto&token=${TOKEN}`), TOKEN);
    assert.equal(parseInviteToken(`https://x.io/invitacion?token=${TOKEN}&token=corto`), TOKEN);
    assert.equal(parseInviteToken('https://x.io/invitacion?token=a&token=b'), null);
  });

  it('WhatsApp con _cursiva_ o -guiones- pegados al enlace: sobra un caracter y se quita', () => {
    assert.equal(parseInviteToken(`_https://x.io/invitacion?token=${TOKEN}_`), TOKEN);
    assert.equal(parseInviteToken(`-https://x.io/invitacion?token=${TOKEN}-`), TOKEN);
  });

  it('pero no adivina: dos sobrantes, o uno que no es _ ni -, no son un token', () => {
    assert.equal(parseInviteToken(`https://x.io/invitacion?token=${TOKEN}__`), null);
    assert.equal(parseInviteToken(`https://x.io/invitacion?token=${TOKEN}x`), null);
  });

  it('un token de 43 que TERMINA en _ o - sigue siendo el token entero', () => {
    const acabaEnGuion = `${TOKEN.slice(0, 42)}-`;
    assert.equal(parseInviteToken(`https://x.io/invitacion?token=${acabaEnGuion}`), acabaEnGuion);
  });
});

describe('parseInviteParam (lo que entrega expo-router)', () => {
  it('string, array y ausente', () => {
    assert.equal(parseInviteParam(TOKEN), TOKEN);
    assert.equal(parseInviteParam([TOKEN]), TOKEN);
    assert.equal(parseInviteParam(undefined), null);
    assert.equal(parseInviteParam(''), null);
    assert.equal(parseInviteParam([]), null);
  });

  it('?token=a&token=b llega como array y NO lanza: el primero valido gana', () => {
    assert.doesNotThrow(() => parseInviteParam(['corto', TOKEN]));
    assert.equal(parseInviteParam(['corto', TOKEN]), TOKEN);
    assert.equal(parseInviteParam(['corto', 'otro']), null);
  });

  it('valores que no son string (nunca deberian llegar) se ignoran sin lanzar', () => {
    assert.equal(parseInviteParam([undefined, TOKEN] as unknown as string[]), TOKEN);
    assert.equal(parseInviteParam(42 as unknown as string), null);
  });
});

describe('debeCopiarTrasFalloDeCompartir', () => {
  it('cerrar la hoja de compartir (AbortError) es cancelar: no se pisa el portapapeles', () => {
    assert.equal(debeCopiarTrasFalloDeCompartir(Object.assign(new Error('x'), { name: 'AbortError' })), false);
  });

  it('cualquier otro fallo (sin navigator.share en escritorio) si copia', () => {
    assert.equal(debeCopiarTrasFalloDeCompartir(new Error('Share is not supported')), true);
    assert.equal(debeCopiarTrasFalloDeCompartir(undefined), true);
    assert.equal(debeCopiarTrasFalloDeCompartir(null), true);
    assert.equal(debeCopiarTrasFalloDeCompartir('texto'), true);
  });
});

describe('buildShareMessage', () => {
  it('nombra la ruta y lleva el enlace https', () => {
    const mensaje = buildShareMessage(TOKEN, 'Ruta de La Latina');
    assert.ok(mensaje.includes(buildInviteUrl(TOKEN)));
    assert.ok(mensaje.includes('Ruta de La Latina'));
    assert.ok(!mensaje.includes('rutadebares://'), 'el esquema propio no es un enlace de verdad');
  });

  it('sin nombre de ruta no deja unas comillas vacias colgando', () => {
    const mensaje = buildShareMessage(TOKEN, '   ');
    assert.ok(!mensaje.includes('""'));
    assert.ok(mensaje.startsWith('Te apuntas a la ruta?'));
  });

  it('la URL va sola en la ultima linea, sin puntuacion pegada que la corte', () => {
    const lineas = buildShareMessage(TOKEN, 'Ruta').split('\n');
    assert.equal(lineas[lineas.length - 1], buildInviteUrl(TOKEN));
  });

  it('un nombre de ruta con comillas o saltos de linea no rompe la URL', () => {
    const mensaje = buildShareMessage(TOKEN, 'La "buena"\nruta');
    assert.ok(mensaje.endsWith(buildInviteUrl(TOKEN)));
  });
});
