import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { INSTAGRAM_URL, TELEGRAM_URL } from './enlacesExternos.ts';

/**
 * abrirEnlaceExterno (Linking.openURL) NO se testea aqui: vive en
 * app/(tabs)/index.tsx a proposito (ver el comentario de enlacesExternos.ts),
 * y esa pantalla se vigila leyendo su codigo como texto en
 * tests/enlaces-sellos.test.ts, no importandola como modulo.
 */

describe('enlaces externos de la ruta', () => {
  it('Instagram: la url exacta pedida, sin typos de copiar y pegar', () => {
    assert.equal(INSTAGRAM_URL, 'https://www.instagram.com/rutadebaresoficial/');
  });

  it('Telegram: la url exacta pedida, con el "+" de invitacion intacto', () => {
    // t.me/+xxxx es un enlace de invitacion: sin el "+" apunta a un usuario
    // "WYZC4FDOKKcyMDNk" que no existe, no al grupo.
    assert.equal(TELEGRAM_URL, 'https://t.me/+WYZC4FDOKKcyMDNk');
  });

  it('las dos son https, no http ni un esquema a medio escribir', () => {
    for (const url of [INSTAGRAM_URL, TELEGRAM_URL]) {
      assert.equal(new URL(url).protocol, 'https:', url);
    }
  });
});
