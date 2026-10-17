import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DURACIONES_MIN,
  DURACION_POR_DEFECTO,
  duracionValida,
  hace,
  leCorresponde,
  limpiarTexto,
  MAX_CARACTERES,
  minutosRestantes,
  textoDuracion,
  validarTexto,
  vigente,
} from './reglas.ts';

const MIN = 60_000;
const a = (creadoMs: number, o: { retirado?: boolean; duracionMin?: number; soloAdmins?: boolean } = {}) => ({
  creadoMs,
  retirado: o.retirado ?? false,
  duracionMin: o.duracionMin ?? 15,
  soloAdmins: o.soloAdmins ?? false,
});

test('cada anuncio caduca a SU tiempo (5, 15 o 60 min), ni uno antes ni uno despues', () => {
  assert.deepEqual([...DURACIONES_MIN], [5, 15, 60]);
  assert.equal(DURACION_POR_DEFECTO, 15);
  for (const d of DURACIONES_MIN) {
    assert.equal(vigente(a(0, { duracionMin: d }), d * MIN - 1), true, `${d} min: aun vigente`);
    assert.equal(vigente(a(0, { duracionMin: d }), d * MIN), false, `${d} min: caducado`);
  }
});

test('solo valen las duraciones de la lista', () => {
  assert.equal(duracionValida(5), true);
  assert.equal(duracionValida(60), true);
  assert.equal(duracionValida(30), false);
  assert.equal(duracionValida(0), false);
});

test('un anuncio retirado no se ve aunque no haya caducado', () => {
  assert.equal(vigente(a(0, { retirado: true }), 1 * MIN), false);
});

test('a quien le corresponde: solo admins no llega a los demas', () => {
  assert.equal(leCorresponde(a(0), false), true);
  assert.equal(leCorresponde(a(0), true), true);
  assert.equal(leCorresponde(a(0, { soloAdmins: true }), false), false);
  assert.equal(leCorresponde(a(0, { soloAdmins: true }), true), true);
});

test('minutos restantes: hacia arriba, nunca negativos, con la duracion de cada uno', () => {
  assert.equal(minutosRestantes(a(0), 0), 15);
  assert.equal(minutosRestantes(a(0), 2 * MIN), 13);
  assert.equal(minutosRestantes(a(0), 15 * MIN - 1), 1);
  assert.equal(minutosRestantes(a(0), 99 * MIN), 0);
  assert.equal(minutosRestantes(a(0, { duracionMin: 5 }), 0), 5);
  assert.equal(minutosRestantes(a(0, { duracionMin: 60 }), 10 * MIN), 50);
});

test('texto de la duracion', () => {
  assert.equal(textoDuracion(5), '5 min');
  assert.equal(textoDuracion(59), '59 min');
  assert.equal(textoDuracion(60), '1 h');
  assert.equal(textoDuracion(65), '1 h 5 min');
});

test('hace cuanto se envio', () => {
  assert.equal(hace(a(0), 20_000), 'ahora mismo');
  assert.equal(hace(a(0), 60_000), 'hace 1 min');
  assert.equal(hace(a(0), 7 * MIN + 30_000), 'hace 7 min');
});

test('el texto: 200 como mucho, sin espacios de mas, y no vacio', () => {
  assert.equal(MAX_CARACTERES, 200);
  assert.deepEqual(validarTexto('  Nuevo   bar\n en 5 minutos  '), { ok: true, texto: 'Nuevo bar en 5 minutos' });
  assert.equal(validarTexto('   \n ').ok, false);
  assert.equal(validarTexto('a'.repeat(200)).ok, true);
  assert.equal(validarTexto('a'.repeat(201)).ok, false);
  assert.equal(validarTexto(`${'a'.repeat(200)}    `).ok, true);
  assert.equal(limpiarTexto('x\t\ty'), 'x y');
});
