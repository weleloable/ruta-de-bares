import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInviteUrl } from '../invites/link.ts';
import { urlConfirmacionWeb } from './confirmacionUrl.ts';

const TOKEN = 'abcDEF0123456789_-abcDEF0123456789_-abcDEF0';
assert.equal(TOKEN.length, 43);

describe('urlConfirmacionWeb', () => {
  it('sin invitacion: la raiz de la app, con la subruta de GitHub Pages', () => {
    assert.equal(urlConfirmacionWeb('https://weleloable.github.io', '/ruta-de-bares/', null), 'https://weleloable.github.io/ruta-de-bares/');
    assert.equal(urlConfirmacionWeb('http://localhost:8081/', '/', null), 'http://localhost:8081/');
  });

  it('con invitacion: va a /invitacion con el token, en Pages y en localhost', () => {
    assert.equal(
      urlConfirmacionWeb('https://weleloable.github.io', '/ruta-de-bares/', TOKEN),
      `https://weleloable.github.io/ruta-de-bares/invitacion?token=${TOKEN}`,
    );
    assert.equal(urlConfirmacionWeb('http://localhost:8081', '/', TOKEN), `http://localhost:8081/invitacion?token=${TOKEN}`);
  });

  it('un token con mala forma no entra en la URL', () => {
    for (const malo of ['corto', `${TOKEN}x`, `${TOKEN.slice(0, 42)}&`, '<script>'.padEnd(43, 'a'), '']) {
      assert.equal(urlConfirmacionWeb('https://x.io', '/app/', malo), 'https://x.io/app/', malo);
    }
  });

  it('la URL que produce es la misma que reparte buildInviteUrl', () => {
    // Si el enlace compartido y este se separan, la confirmacion llevaria a otro sitio.
    assert.equal(urlConfirmacionWeb('https://weleloable.github.io', '/ruta-de-bares/', TOKEN), buildInviteUrl(TOKEN));
  });
});
