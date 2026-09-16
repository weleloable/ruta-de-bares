import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { confirmar } from './confirmar.web.ts';

// react-native-web hace que Alert.alert() no haga nada (ver confirmar.ts):
// esta es la variante que de verdad se ejecuta en el navegador, via
// window.confirm. Por eso el bug de "Cerrar sesion no funciona" solo
// aparecia en web, nunca en nativo.

// El tipo real de `window` en tsconfig (lib "dom") trae 200+ propiedades: el
// mock solo necesita `confirm`, de ahi el `as unknown as typeof globalThis`.
function simularVentana(confirm: (mensaje?: string) => boolean) {
  (globalThis as { window?: unknown }).window = { confirm } as unknown as typeof globalThis;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('confirmar (web)', () => {
  test('devuelve true cuando window.confirm acepta', async () => {
    simularVentana(() => true);
    const resultado = await confirmar({ titulo: 'Cerrar sesion', mensaje: 'Aviso.' });
    assert.equal(resultado, true);
  });

  test('devuelve false cuando window.confirm cancela', async () => {
    simularVentana(() => false);
    const resultado = await confirmar({ titulo: 'Cerrar sesion', mensaje: 'Aviso.' });
    assert.equal(resultado, false);
  });

  test('incluye titulo y mensaje en el texto mostrado', async () => {
    let recibido = '';
    simularVentana((mensaje) => {
      recibido = mensaje ?? '';
      return true;
    });
    await confirmar({ titulo: 'Cerrar sesion', mensaje: 'Tendras que volver a entrar.' });
    assert.match(recibido, /Cerrar sesion/);
    assert.match(recibido, /Tendras que volver a entrar\./);
  });
});
