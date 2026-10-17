import assert from 'node:assert/strict';
import { test } from 'node:test';

import { juegosDelMenu } from './visibilidad.ts';

const JUEGOS = [
  { id: 'cana-perfecta' },
  { id: 'tapon-al-vuelo' },
  { id: 'la-penul', visibilidad: 'la-penul' as const },
  { id: 'parejas-de-barra' },
];
const ids = (r: ReturnType<typeof juegosDelMenu<(typeof JUEGOS)[number]>>) => r.map((x) => x.juego.id);

test('persona normal con el interruptor APAGADO: no sale', () => {
  const r = juegosDelMenu(JUEGOS, { esAdmin: false, penulVisible: false });
  assert.deepEqual(ids(r), ['cana-perfecta', 'tapon-al-vuelo', 'parejas-de-barra']);
});

test('persona normal con el interruptor ENCENDIDO: sale la ULTIMA, sin etiqueta', () => {
  const r = juegosDelMenu(JUEGOS, { esAdmin: false, penulVisible: true });
  assert.deepEqual(ids(r), ['cana-perfecta', 'tapon-al-vuelo', 'parejas-de-barra', 'la-penul']);
  assert.equal(r.at(-1)?.soloAdmins, false);
});

test('admin con el interruptor apagado: sale la ultima, con "Solo admins"', () => {
  const r = juegosDelMenu(JUEGOS, { esAdmin: true, penulVisible: false });
  assert.equal(r.at(-1)?.juego.id, 'la-penul');
  assert.equal(r.at(-1)?.soloAdmins, true);
  assert.equal(r.length, 4);
});

test('admin con el interruptor encendido: la ultima, sin etiqueta (la ve todo el mundo)', () => {
  const r = juegosDelMenu(JUEGOS, { esAdmin: true, penulVisible: true });
  assert.equal(r.at(-1)?.juego.id, 'la-penul');
  assert.equal(r.at(-1)?.soloAdmins, false);
});

test('un juego nuevo sumado DESPUES de La Penul en la lista queda por delante de ella (penultimo)', () => {
  const conNuevo = [...JUEGOS, { id: 'juego-nuevo' }];
  for (const esAdmin of [true, false]) {
    const r = juegosDelMenu(conNuevo, { esAdmin, penulVisible: true });
    assert.deepEqual(ids(r).slice(-2), ['juego-nuevo', 'la-penul'], `esAdmin=${esAdmin}`);
  }
  // Y metida al principio, igual: la ultima.
  const alPrincipio = [{ id: 'la-penul', visibilidad: 'la-penul' as const }, { id: 'a' }, { id: 'b' }];
  assert.deepEqual(ids(juegosDelMenu(alPrincipio, { esAdmin: true, penulVisible: false })), ['a', 'b', 'la-penul']);
});

test('el resto de juegos no lleva nunca la etiqueta y conserva su orden', () => {
  for (const esAdmin of [true, false]) {
    for (const penulVisible of [true, false]) {
      const r = juegosDelMenu(JUEGOS, { esAdmin, penulVisible }).filter((x) => x.juego.id !== 'la-penul');
      assert.deepEqual(ids(r), ['cana-perfecta', 'tapon-al-vuelo', 'parejas-de-barra']);
      assert.ok(r.every((x) => !x.soloAdmins));
    }
  }
});

test('con la lista real: La Penul es el unico juego con visibilidad especial', async () => {
  // juegos.ts importa componentes; se lee el fichero en vez de cargarlo.
  const { readFileSync } = await import('node:fs');
  const fuente = readFileSync('src/features/minijuegos/juegos.ts', 'utf8');
  assert.equal((fuente.match(/visibilidad: 'la-penul'/g) ?? []).length, 1);
});
