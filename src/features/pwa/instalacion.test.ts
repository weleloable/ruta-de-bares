import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectarPlataforma, estadoInstalacion, rutasPwa } from './instalacion.ts';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipadModerno:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

describe('detectarPlataforma', () => {
  it('iPhone es ios', () => {
    assert.equal(detectarPlataforma(UA.iphone, 5), 'ios');
  });

  it('un iPad moderno dice Macintosh, pero tiene pantalla tactil: ios', () => {
    assert.equal(detectarPlataforma(UA.ipadModerno, 5), 'ios');
  });

  it('el mismo userAgent sin pantalla tactil es un Mac: escritorio', () => {
    assert.equal(detectarPlataforma(UA.ipadModerno, 0), 'escritorio');
  });

  it('Android y Windows', () => {
    assert.equal(detectarPlataforma(UA.android, 5), 'android');
    assert.equal(detectarPlataforma(UA.windows, 0), 'escritorio');
  });
});

describe('estadoInstalacion', () => {
  const base = { esWeb: true, standalone: false, hayAvisoInstalacion: false, userAgent: UA.android, maxTouchPoints: 5 };

  it('en la app nativa no se ofrece nada', () => {
    assert.deepEqual(estadoInstalacion({ ...base, esWeb: false, hayAvisoInstalacion: true }), { tipo: 'no-web' });
  });

  it('abierta como app gana a todo lo demas', () => {
    assert.deepEqual(estadoInstalacion({ ...base, standalone: true, hayAvisoInstalacion: true }), { tipo: 'instalada' });
  });

  it('con aviso del navegador: boton de un toque', () => {
    assert.deepEqual(estadoInstalacion({ ...base, hayAvisoInstalacion: true }), { tipo: 'boton' });
  });

  it('en iPhone, sin aviso posible, explica el menu Compartir', () => {
    const estado = estadoInstalacion({ ...base, userAgent: UA.iphone });
    assert.equal(estado.tipo, 'instrucciones');
    if (estado.tipo !== 'instrucciones') return;
    assert.equal(estado.plataforma, 'ios');
    assert.ok(estado.pasos.some((paso) => /Compartir/.test(paso)));
    assert.ok(estado.pasos.some((paso) => /pantalla de inicio/.test(paso)));
  });

  it('en Android sin aviso (otro navegador, o ya rechazado) explica el menu', () => {
    const estado = estadoInstalacion(base);
    assert.equal(estado.tipo === 'instrucciones' && estado.plataforma, 'android');
  });

  it('todas las instrucciones tienen al menos un paso', () => {
    for (const userAgent of Object.values(UA)) {
      for (const maxTouchPoints of [0, 5]) {
        const estado = estadoInstalacion({ ...base, userAgent, maxTouchPoints });
        assert.ok(estado.tipo === 'instrucciones' && estado.pasos.length > 0);
      }
    }
  });
});

describe('rutasPwa', () => {
  it('sin baseUrl (localhost) todo cuelga de la raiz', () => {
    const esperadas = {
      manifest: '/manifest.json',
      iconoApple: '/icons/apple-touch-icon.png',
      serviceWorker: '/sw.js',
      alcance: '/',
    };
    assert.deepEqual(rutasPwa(undefined), esperadas);
    assert.deepEqual(rutasPwa(null), esperadas);
    assert.deepEqual(rutasPwa(''), esperadas);
    assert.deepEqual(rutasPwa('  /  '), esperadas);
  });

  it('con el baseUrl de GitHub Pages todo cuelga de /ruta-de-bares', () => {
    assert.deepEqual(rutasPwa('/ruta-de-bares'), {
      manifest: '/ruta-de-bares/manifest.json',
      iconoApple: '/ruta-de-bares/icons/apple-touch-icon.png',
      serviceWorker: '/ruta-de-bares/sw.js',
      alcance: '/ruta-de-bares/',
    });
  });

  it('normaliza barras de sobra o que faltan', () => {
    for (const variante of ['ruta-de-bares', '/ruta-de-bares/', '//ruta-de-bares//']) {
      assert.equal(rutasPwa(variante).manifest, '/ruta-de-bares/manifest.json', variante);
    }
  });

  it('el alcance del service worker nunca es la raiz del dominio en Pages', () => {
    // weleloable.github.io aloja mas repos: un alcance "/" se meteria en todos.
    assert.equal(rutasPwa('/ruta-de-bares').alcance, '/ruta-de-bares/');
  });
});
