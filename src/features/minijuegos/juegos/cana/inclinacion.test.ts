import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ANGULO_MAX, anguloDesdeAcelerometro, limitarAngulo, suavizar } from './inclinacion.ts';

test('movil recto = 0 grados; a 45 grados, gravedad repartida a partes iguales', () => {
  assert.equal(anguloDesdeAcelerometro(0, 1, 0), 0);
  const a = anguloDesdeAcelerometro(0.7071, 0.7071, 0);
  assert.ok(a !== null && Math.abs(a - 45) < 0.1);
});

test('da igual el signo: iOS y Android lo miden al reves', () => {
  assert.equal(anguloDesdeAcelerometro(0.5, 0.8, 0), anguloDesdeAcelerometro(-0.5, -0.8, 0));
});

test('movil tumbado no inventa angulo', () => {
  assert.equal(anguloDesdeAcelerometro(0, 0, 1), 0);
});

test('movil casi tumbado: el ruido de x e y no hace saltar el vaso a 90 grados', () => {
  // Plano en la mesa, con algo de ruido: sin el corte, atan2(0.03, 0.001) daria ~88 grados.
  assert.equal(anguloDesdeAcelerometro(0.03, 0.001, 9.8), 0);
  assert.equal(anguloDesdeAcelerometro(-0.2, 0.15, -9.7), 0);
  // Inclinado de verdad hacia atras pero con la pantalla aun de cara: si cuenta.
  const a = anguloDesdeAcelerometro(4, 6, 6);
  assert.ok(a !== null && a > 30 && a < 40, `${a}`);
});

test('lecturas que no son numeros (escritorio) devuelven null', () => {
  assert.equal(anguloDesdeAcelerometro(NaN, 0, 0), null);
  assert.equal(anguloDesdeAcelerometro(null as unknown as number, 0, 0), null);
  assert.equal(anguloDesdeAcelerometro(0, undefined as unknown as number, 0), null);
});

test('suavizar se acerca al valor nuevo sin saltar', () => {
  assert.equal(suavizar(0, 10, 0.5), 5);
  assert.equal(suavizar(10, 10), 10);
});

test('limitarAngulo recorta a 0..ANGULO_MAX', () => {
  assert.equal(limitarAngulo(-5), 0);
  assert.equal(limitarAngulo(999), ANGULO_MAX);
  assert.equal(limitarAngulo(30), 30);
});

test('el motivo del deslizador se explica, salvo cuando lo eligio la persona', async () => {
  const { textoMotivo } = await import('./inclinacion.ts');
  assert.match(textoMotivo('https') ?? '', /https/);
  assert.match(textoMotivo('permiso') ?? '', /permiso/);
  assert.match(textoMotivo('sin-sensor') ?? '', /deslizador/);
  assert.equal(textoMotivo('elegido'), null);
  assert.equal(textoMotivo(null), null);
});
