import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  anuncioDeFila,
  DURACIONES_MIN,
  DURACION_POR_DEFECTO,
  duracionValida,
  hace,
  leCorresponde,
  limpiarTexto,
  MAX_CARACTERES,
  minutosRestantes,
  textoDuracion,
  traducirErrorAnuncios,
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

test('de la fila del servidor: caduca cuando el servidor dice, con el reloj de aqui (da igual que vaya adelantado)', () => {
  const fila = { id: 'x', texto: 'Hola', solo_admins: true, duracion_min: 15, hace_s: 120, restan_s: 780 };
  // El movil va una hora ADELANTADO: lo unico que importa es cuando llego la respuesta.
  const recibido = 1_000_000_000_000 + 60 * MIN;
  const an = anuncioDeFila(fila, recibido);
  assert.deepEqual([an.id, an.texto, an.soloAdmins, an.duracionMin, an.retirado], ['x', 'Hola', true, 15, false]);
  assert.equal(vigente(an, recibido + 780_000 - 1), true);
  assert.equal(vigente(an, recibido + 780_000), false);
  assert.equal(minutosRestantes(an, recibido), 13);
  assert.equal(hace(an, recibido), 'hace 2 min');
});

test('de la fila: los de 5 y 60 minutos cuentan con su duracion, no con la de 15', () => {
  const recibido = 5_000_000;
  const corto = anuncioDeFila({ id: 'a', texto: 't', solo_admins: false, duracion_min: 5, hace_s: 0, restan_s: 300 }, recibido);
  const largo = anuncioDeFila({ id: 'b', texto: 't', solo_admins: false, duracion_min: 60, hace_s: 0, restan_s: 3600 }, recibido);
  assert.equal(vigente(corto, recibido + 5 * MIN - 1), true);
  assert.equal(vigente(corto, recibido + 5 * MIN), false);
  assert.equal(vigente(largo, recibido + 59 * MIN), true);
  assert.equal(vigente(largo, recibido + 60 * MIN), false);
});

test('errores del servidor, en cristiano', () => {
  assert.match(traducirErrorAnuncios('RATE_LIMIT'), /máximo 6/);
  assert.match(traducirErrorAnuncios('TEXT_INVALID'), /200/);
  assert.match(traducirErrorAnuncios('DURATION_INVALID'), /5 minutos/);
  assert.match(traducirErrorAnuncios('FORBIDDEN'), /admins/);
  assert.match(traducirErrorAnuncios('PGRST202 Could not find the function'), /0074/);
  assert.equal(traducirErrorAnuncios(''), 'No se pudo completar.');
});
