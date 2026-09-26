import assert from 'node:assert/strict';
import { test } from 'node:test';

import { candidatos, NOMBRE_MAX, nombreFinal, sugerirNombre } from './nombres.ts';

const ESTILOS = ['Pilsner', 'Lager ámbar', 'Dunkel', 'Schwarzbier', 'Rubia', 'IPA', 'Amber Ale', 'Tostada', 'Stout'];

test('ningun candidato pasa de 30 caracteres, con jugadores de todos los largos', () => {
  for (const estilo of ESTILOS) {
    for (const jugador of ['', 'Ana', 'Gonzalo', 'x'.repeat(30)]) {
      for (const n of candidatos(estilo, jugador)) assert.ok(n.length <= NOMBRE_MAX, `${n} (${n.length})`);
    }
  }
});

test('mezcla estilo, referencias de Alcala y el nombre del jugador', () => {
  const c = candidatos('IPA', 'Gonzalo');
  assert.ok(c.includes('IPA Complutense'));
  assert.ok(c.includes('IPA de Cervantes'));
  assert.ok(c.includes('IPA de Gonzalo'));
  assert.ok(c.includes('IPA Complutense de Gonzalo'));
});

test('sin nombre de jugador no se cuela un "de " vacio', () => {
  for (const n of candidatos('Stout', '  ')) assert.ok(!n.endsWith('de '), n);
  assert.ok(candidatos('Stout', '').length >= 2);
});

test('un jugador con nombre larguisimo no rompe: se descartan solo los que no caben', () => {
  const c = candidatos('Stout', 'y'.repeat(30));
  assert.ok(c.length >= 2);
  assert.ok(c.every((n) => !n.includes('yyyy')));
});

test('sugerirNombre es determinista con el mismo azar y evita la sugerencia anterior', () => {
  assert.equal(sugerirNombre('IPA', 'Ana', () => 0), sugerirNombre('IPA', 'Ana', () => 0));
  const primero = sugerirNombre('IPA', 'Ana', () => 0);
  for (const azar of [0, 0.3, 0.7, 0.999]) {
    assert.notEqual(sugerirNombre('IPA', 'Ana', () => azar, primero), primero);
  }
});

test('el azar en el borde (1 o mas) no se sale de la lista', () => {
  const n = sugerirNombre('IPA', 'Ana', () => 1);
  assert.ok(candidatos('IPA', 'Ana').includes(n));
});

test('nombreFinal recorta a 30, y con el campo vacio recupera la sugerencia', () => {
  assert.equal(nombreFinal('Mi cerveza', 'IPA Complutense'), 'Mi cerveza');
  assert.equal(nombreFinal('', 'IPA Complutense'), 'IPA Complutense');
  assert.equal(nombreFinal('    ', 'IPA Complutense'), 'IPA Complutense');
  assert.equal(nombreFinal('a'.repeat(50), 'x').length, NOMBRE_MAX);
  assert.equal(nombreFinal('  hola  ', 'x'), 'hola');
});
