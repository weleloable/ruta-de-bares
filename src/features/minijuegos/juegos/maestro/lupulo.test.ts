import assert from 'node:assert/strict';
import { test } from 'node:test';

import { avanzar, DURACION, INICIO, MARCAS, resumen, terminado, tocar, VENTANA, type Estado } from './lupulo.ts';

const en = (id: 'amargor' | 'aroma') => MARCAS.find((m) => m.id === id)!.en;
const enTiempo = (t: number): Estado => ({ ...INICIO, t });

test('las marcas caben dentro de la barra con su ventana', () => {
  for (const m of MARCAS) {
    assert.ok(m.en - VENTANA >= 0 && m.en + VENTANA <= DURACION, m.id);
  }
  assert.ok(en('amargor') < en('aroma'), 'el amargor va antes que el aroma');
});

test('tocar justo en la marca da precision 1 y va a esa marca', () => {
  const r = tocar(enTiempo(en('amargor')));
  assert.equal(r.marca, 'amargor');
  assert.equal(r.precision, 1);
  assert.equal(r.estado.resultados.amargor, 1);
  assert.equal(r.estado.resultados.aroma, null);
});

test('la precision baja en recta hasta 0 en el borde de la ventana', () => {
  const medio = tocar(enTiempo(en('amargor') + VENTANA / 2));
  assert.ok(Math.abs(medio.precision - 0.5) < 1e-9);
  assert.equal(tocar(enTiempo(en('amargor') + VENTANA)).precision, 0);
});

test('tocar antes de la ventana se ignora y no gasta la marca', () => {
  const e = enTiempo(en('amargor') - VENTANA - 0.1);
  const r = tocar(e);
  assert.equal(r.marca, null);
  assert.equal(r.estado, e);
});

test('despues de la primera marca, el siguiente toque va al aroma', () => {
  let r = tocar(enTiempo(en('amargor')));
  r = tocar({ ...r.estado, t: en('aroma') - 0.3 });
  assert.equal(r.marca, 'aroma');
  assert.ok(Math.abs(r.precision - 0.8) < 1e-9);
});

test('una marca que se deja pasar vale 0 y el toque siguiente ya va a la otra', () => {
  let e = INICIO;
  while (e.t < en('amargor') + VENTANA + 0.1) e = avanzar(e, 0.05);
  assert.equal(e.resultados.amargor, 0);
  const r = tocar({ ...e, t: en('aroma') });
  assert.equal(r.marca, 'aroma');
  assert.equal(r.precision, 1);
});

test('sin tocar nada se termina con todo a 0', () => {
  let e = INICIO;
  for (let i = 0; i < 60 * 30 && !terminado(e); i++) e = avanzar(e, 1 / 60);
  assert.ok(terminado(e));
  assert.deepEqual(resumen(e), { amargor: 0, aroma: 0 });
  assert.equal(avanzar(e, 1), e);
});

test('una partida perfecta da 1 y 1', () => {
  let r = tocar(enTiempo(en('amargor')));
  r = tocar({ ...r.estado, t: en('aroma') });
  assert.deepEqual(resumen(r.estado), { amargor: 1, aroma: 1 });
});

test('cuando no queda ninguna marca, tocar no hace nada', () => {
  let r = tocar(enTiempo(en('amargor')));
  r = tocar({ ...r.estado, t: en('aroma') });
  const otra = tocar({ ...r.estado, t: 19 });
  assert.equal(otra.marca, null);
});
