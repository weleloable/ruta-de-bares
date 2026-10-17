import assert from 'node:assert/strict';
import { test } from 'node:test';

import { direccion, empezarGesto, moverGesto, soltarGesto, UMBRAL, UMBRAL_SOLTAR, type DireccionGesto } from './gestos.ts';

/** Un dedo que baja en (0,0) y pasa por esos puntos; devuelve las acciones que ha dado, en orden. */
function dedo(puntos: [number, number][], soltar?: [number, number]): DireccionGesto[] {
  const g = empezarGesto(0, 0);
  const acciones: DireccionGesto[] = [];
  for (const [x, y] of puntos) {
    const a = moverGesto(g, x, y);
    if (a) acciones.push(a);
  }
  if (soltar) {
    const a = soltarGesto(g, soltar[0], soltar[1]);
    if (a) acciones.push(a);
  }
  return acciones;
}

test('un deslizamiento, una accion: un arrastre corto a la derecha = un carril', () => {
  assert.deepEqual(dedo([[10, 0], [UMBRAL, 0], [30, 0]], [30, 0]), ['derecha']);
  assert.deepEqual(dedo([[-10, 0], [-UMBRAL, 0]], [-UMBRAL, 0]), ['izquierda']);
});

test('un arrastre LARGO sigue siendo una sola accion (antes cambiaba dos o tres carriles)', () => {
  const largo: [number, number][] = Array.from({ length: 40 }, (_, i) => [i * 10, 0]);
  assert.deepEqual(dedo(largo, [400, 0]), ['derecha']);
  const aLaIzquierda: [number, number][] = Array.from({ length: 40 }, (_, i) => [-i * 10, 0]);
  assert.deepEqual(dedo(aLaIzquierda, [-400, 0]), ['izquierda']);
});

test('tras la accion, mover el dedo hacia otro lado sin levantarlo NO da otra', () => {
  assert.deepEqual(dedo([[UMBRAL, 0], [-200, 0], [0, 200], [0, -200]], [0, 0]), ['derecha']);
});

test('arriba salta y abajo agacha, tambien de una en una', () => {
  assert.deepEqual(dedo([[0, -UMBRAL], [0, -100]], [0, -100]), ['arriba']);
  assert.deepEqual(dedo([[0, UMBRAL], [0, 100]], [0, 100]), ['abajo']);
});

test('manda el eje en que se ha movido mas (una diagonal no son dos acciones)', () => {
  assert.deepEqual(dedo([[30, 22]], [30, 22]), ['derecha']);
  assert.deepEqual(dedo([[22, 30]], [22, 30]), ['abajo']);
});

test('un toque sin arrastrar NO hace nada (ya no mueve un carril segun el lado tocado)', () => {
  assert.deepEqual(dedo([], [0, 0]), []);
  assert.deepEqual(dedo([[2, 1], [3, -2]], [3, -2]), []);
  assert.deepEqual(dedo([[UMBRAL_SOLTAR - 1, 0]], [UMBRAL_SOLTAR - 1, 0]), []);
});

test('un golpe rapido que se suelta antes del umbral vale con el umbral de soltar', () => {
  assert.ok(UMBRAL_SOLTAR < UMBRAL);
  assert.deepEqual(dedo([[UMBRAL_SOLTAR + 1, 0]], [UMBRAL_SOLTAR + 1, 0]), ['derecha']);
  assert.deepEqual(dedo([[0, -(UMBRAL_SOLTAR + 1)]], [0, -(UMBRAL_SOLTAR + 1)]), ['arriba']);
});

test('un gesto que ya dio su accion no la repite al soltar', () => {
  const g = empezarGesto(0, 0);
  assert.equal(moverGesto(g, UMBRAL, 0), 'derecha');
  assert.equal(soltarGesto(g, UMBRAL + 50, 0), null);
  assert.equal(moverGesto(g, 500, 0), null);
});

test('dos deslizamientos seguidos (levantando el dedo) son dos acciones', () => {
  const a = dedo([[UMBRAL, 0]], [UMBRAL, 0]);
  const b = dedo([[-UMBRAL, 0]], [-UMBRAL, 0]);
  assert.deepEqual([...a, ...b], ['derecha', 'izquierda']);
});

test('direccion: justo en el umbral cuenta, por debajo no', () => {
  assert.equal(direccion(UMBRAL, 0, UMBRAL), 'derecha');
  assert.equal(direccion(UMBRAL - 1, 0, UMBRAL), null);
  assert.equal(direccion(0, 0, UMBRAL), null);
});
