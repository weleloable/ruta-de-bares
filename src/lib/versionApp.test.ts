import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OCULTA_MINIMO_MS, decidirVersion, leerVersionRemota, urlVersion } from './versionApp.ts';

const A = '2a07e8d1c0ffee2a07e8d1c0ffee2a07e8d1c0ff';
const B = '880b417aa0bbcc880b417aa0bbcc880b417aa0bb';

const base = { local: A, remota: B, esAdmin: false, ocultaMs: OCULTA_MINIMO_MS, bloqueada: false };

test('leerVersionRemota: solo acepta un commit; lo demas es "no se sabe"', () => {
  assert.equal(leerVersionRemota({ version: A }), A);
  assert.equal(leerVersionRemota({ version: ` ${B}\n` }), B);
  assert.equal(leerVersionRemota({ version: 'abc1234' }), 'abc1234');
  for (const raro of [null, undefined, 'x', [], {}, { version: 3 }, { version: '' }, { version: '<html>404' }, { version: 'abc' }]) {
    assert.equal(leerVersionRemota(raro), null, JSON.stringify(raro));
  }
});

test('decidirVersion: misma version o sin datos, nada', () => {
  assert.equal(decidirVersion({ ...base, remota: A }), 'nada');
  assert.equal(decidirVersion({ ...base, remota: null }), 'nada');
  // Desarrollo / export local sin EXPO_PUBLIC_APP_VERSION: no hay con que comparar.
  assert.equal(decidirVersion({ ...base, local: undefined }), 'nada');
  assert.equal(decidirVersion({ ...base, local: '' }), 'nada');
  assert.equal(decidirVersion({ ...base, local: '  ' }), 'nada');
});

test('decidirVersion: un admin ve el aviso, este delante o vuelva de segundo plano', () => {
  assert.equal(decidirVersion({ ...base, esAdmin: true, ocultaMs: 0 }), 'aviso');
  assert.equal(decidirVersion({ ...base, esAdmin: true }), 'aviso');
  // Ni a mitad de partida se le recarga: decide el.
  assert.equal(decidirVersion({ ...base, esAdmin: true, bloqueada: true }), 'aviso');
});

test('decidirVersion: el resto, sin aviso; recarga solo al volver tras un rato fuera', () => {
  assert.equal(decidirVersion(base), 'recargar');
  assert.equal(decidirVersion({ ...base, ocultaMs: 10 * 60 * 60 * 1000 }), 'recargar');
  // Con la app delante (sondeo) nunca: estaria a mitad de algo.
  assert.equal(decidirVersion({ ...base, ocultaMs: 0 }), 'nada');
  // Salir un momento (pasar una invitacion por WhatsApp) tampoco.
  assert.equal(decidirVersion({ ...base, ocultaMs: OCULTA_MINIMO_MS - 1 }), 'nada');
});

test('decidirVersion: con una partida en marcha no se recarga a nadie', () => {
  assert.equal(decidirVersion({ ...base, bloqueada: true }), 'nada');
});

test('urlVersion: junto a la app, con y sin subruta, y sin cache', () => {
  assert.equal(urlVersion('/ruta-de-bares', 5), '/ruta-de-bares/version.json?t=5');
  assert.equal(urlVersion('/ruta-de-bares/', 5), '/ruta-de-bares/version.json?t=5');
  assert.equal(urlVersion(undefined, 7), '/version.json?t=7');
  assert.equal(urlVersion('', 7), '/version.json?t=7');
});
