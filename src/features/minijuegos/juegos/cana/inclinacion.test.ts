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

test('con signo: a la derecha es positivo y a la izquierda negativo, en Android Y en iOS', async () => {
  const { inclinacionConSigno } = await import('./inclinacion.ts');
  const g = 9.81;
  const s = (deg: number) => Math.sin((deg * Math.PI) / 180) * g;
  const c = (deg: number) => Math.cos((deg * Math.PI) / 180) * g;
  // Android: vertical y = +g; inclinado a la DERECHA, x negativa.
  assert.ok(Math.abs((inclinacionConSigno(-s(30), c(30), 0) ?? 0) - 30) < 0.01);
  assert.ok(Math.abs((inclinacionConSigno(s(30), c(30), 0) ?? 0) + 30) < 0.01);
  // iOS: todo invertido (vertical y = -g; a la derecha, x positiva): mismo resultado.
  assert.ok(Math.abs((inclinacionConSigno(s(30), -c(30), 0) ?? 0) - 30) < 0.01);
  assert.ok(Math.abs((inclinacionConSigno(-s(30), -c(30), 0) ?? 0) + 30) < 0.01);
  // Recto y tumbado: 0.
  assert.equal(inclinacionConSigno(0, g, 0), 0);
  assert.equal(inclinacionConSigno(0.02, 0.01, 9.8), 0);
  // El valor absoluto es el de siempre.
  assert.equal(Math.abs(inclinacionConSigno(-s(45), c(45), 0) ?? 0), anguloDesdeAcelerometro(-s(45), c(45), 0));
  assert.equal(inclinacionConSigno(NaN, 1, 0), null);
});

test('limitarGiro recorta a cada lado y deja pasar lo de dentro', async () => {
  const { limitarGiro } = await import('./inclinacion.ts');
  assert.equal(limitarGiro(90), ANGULO_MAX);
  assert.equal(limitarGiro(-90), -ANGULO_MAX);
  assert.equal(limitarGiro(-20), -20);
});

test('suavizarEnTiempo: el mismo movimiento aunque el tiempo se parta distinto (sensor a 20 Hz o a 60)', async () => {
  const { suavizarEnTiempo, TAU_GIRO } = await import('./inclinacion.ts');
  const de = (pasos: number, dt: number) => {
    let v = 0;
    for (let i = 0; i < pasos; i++) v = suavizarEnTiempo(v, 30, dt, TAU_GIRO);
    return v;
  };
  // 0,24 s en pasos de 50 ms, de 16,7 ms o de 4 ms: el mismo punto del camino.
  assert.ok(Math.abs(de(5, 0.048) - de(15, 0.016) ) < 1e-9);
  assert.ok(Math.abs(de(6, 0.04) - de(60, 0.004)) < 1e-9);
});

test('suavizarEnTiempo: sube sin saltos bruscos, no se pasa del objetivo y para el reloj si dt no es positivo', async () => {
  const { suavizarEnTiempo, TAU_GIRO } = await import('./inclinacion.ts');
  let v = 0;
  let mayorSalto = 0;
  for (let i = 0; i < 120; i++) {
    const nuevo = suavizarEnTiempo(v, 30, 1 / 60, TAU_GIRO);
    mayorSalto = Math.max(mayorSalto, nuevo - v);
    assert.ok(nuevo >= v && nuevo <= 30);
    v = nuevo;
  }
  // Un escalon de 30 grados se reparte en fotogramas: el primero mueve menos de 4 grados, no 30.
  assert.ok(mayorSalto < 4, `salto de ${mayorSalto}`);
  assert.ok(v > 29.9, `llego a ${v}`);
  assert.equal(suavizarEnTiempo(5, 30, 0, TAU_GIRO), 5);
  assert.equal(suavizarEnTiempo(5, 30, -1, TAU_GIRO), 5);
  assert.equal(suavizarEnTiempo(5, 30, Number.NaN, TAU_GIRO), 5);
  assert.equal(suavizarEnTiempo(5, 30, 0.1, 0), 30);
  // Con un fotograma enorme (pestana en segundo plano) llega, no se pasa.
  assert.ok(suavizarEnTiempo(0, 30, 100, TAU_GIRO) <= 30);
});

test('suavizarEnTiempo funciona igual hacia los dos lados (el vaso gira a izquierda y derecha)', async () => {
  const { suavizarEnTiempo, TAU_GIRO } = await import('./inclinacion.ts');
  assert.ok(Math.abs(suavizarEnTiempo(0, 30, 0.05, TAU_GIRO) + suavizarEnTiempo(0, -30, 0.05, TAU_GIRO)) < 1e-12);
});
