import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rutasPwa } from './pwa-rutas.ts';

describe('rutasPwa', () => {
  it('en localhost (sin baseUrl) las rutas van a la raiz', () => {
    assert.deepEqual(rutasPwa(undefined), {
      manifest: '/manifest.json',
      iconoApple: '/icons/apple-touch-icon.png',
      serviceWorker: '/sw.js',
      alcance: '/',
    });
  });

  it('en GitHub Pages van bajo el baseUrl', () => {
    assert.deepEqual(rutasPwa('/ruta-de-bares'), {
      manifest: '/ruta-de-bares/manifest.json',
      iconoApple: '/ruta-de-bares/icons/apple-touch-icon.png',
      serviceWorker: '/ruta-de-bares/sw.js',
      alcance: '/ruta-de-bares/',
    });
  });

  it('tolera barras de mas al principio o al final del baseUrl', () => {
    assert.deepEqual(rutasPwa('/ruta-de-bares/'), rutasPwa('ruta-de-bares'));
  });
});
