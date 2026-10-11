import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bordesDeDerrame, impactoChorro, profundidadSuperficie, regueroPared } from './escena.ts';

const D = { ancho: 132, alto: 186 };
const rad = (g: number) => (g * Math.PI) / 180;

/** Area por debajo de la superficie contada a mano, punto a punto: no reutiliza el shoelace del codigo. */
function areaContada(angulo: number, superficie: number): number {
  const gx = Math.sin(rad(angulo));
  const gy = Math.cos(rad(angulo));
  const paso = 0.5;
  let n = 0;
  for (let x = -D.ancho / 2 + paso / 2; x < D.ancho / 2; x += paso) {
    for (let y = paso / 2; y < D.alto; y += paso) if (x * gx + y * gy >= superficie) n++;
  }
  return n * paso * paso;
}

test('recto, la superficie esta donde dice la fraccion', () => {
  for (const v of [0, 0.1, 0.5, 0.9, 1]) {
    assert.ok(Math.abs(profundidadSuperficie(0, v, D) - D.alto * (1 - v)) < 1e-6, `v=${v}`);
  }
});

test('inclinado, la superficie horizontal deja debajo la misma cantidad de cerveza', () => {
  for (const a of [-60, -37, -10, 5, 30, 45, 60]) {
    for (const v of [0.05, 0.3, 0.6, 0.85]) {
      const area = areaContada(a, profundidadSuperficie(a, v, D));
      const esperada = v * D.ancho * D.alto;
      assert.ok(Math.abs(area - esperada) / esperada < 0.01, `a=${a} v=${v}: ${area} vs ${esperada}`);
    }
  }
});

test('mas cerveza, superficie mas arriba', () => {
  for (const a of [0, 25, -50]) {
    let anterior = Infinity;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const p = profundidadSuperficie(a, v, D);
      assert.ok(p <= anterior + 1e-9, `a=${a} v=${v}`);
      anterior = p;
    }
  }
});

test('el chorro NUNCA atraviesa el vaso: acaba dentro, en cualquier inclinacion y llenado', () => {
  // El bug: inclinado, el chorro media "lo que falta" por el eje del vaso y salia por la pared.
  for (let a = -60; a <= 60; a += 1) {
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const sup = profundidadSuperficie(a, v, D);
      const { distancia } = impactoChorro(a, sup, D);
      // Punto de choque en el marco del vaso: distancia * gravedad-vista-desde-el-vaso.
      const x = distancia * Math.sin(rad(a));
      const y = distancia * Math.cos(rad(a));
      assert.ok(Math.abs(x) <= D.ancho / 2 + 1e-6, `a=${a} v=${v}: x=${x}`);
      assert.ok(y >= -1e-6 && y <= D.alto + 1e-6, `a=${a} v=${v}: y=${y}`);
    }
  }
});

test('vacio e inclinado 45 grados el chorro choca con la pared baja, no con el fondo', () => {
  const sup = profundidadSuperficie(45, 0, D);
  const i = impactoChorro(45, sup, D);
  assert.equal(i.contra, 'pared');
  assert.equal(i.lado, 1); // girado a la derecha, la pared baja es la derecha
  assert.ok(Math.abs(i.distancia - D.ancho / 2 / Math.sin(rad(45))) < 1e-6);
  // La formula vieja (lo que falta, a lo largo del eje) lo hacia mucho mas largo: atravesaba.
  assert.ok(D.alto * Math.cos(rad(45)) > i.distancia + 30);
  assert.equal(impactoChorro(-45, sup, D).lado, -1);
});

test('recto y vacio, el chorro llega al fondo; con cerveza, a la superficie', () => {
  assert.equal(impactoChorro(0, profundidadSuperficie(0, 0, D), D).contra, 'fondo');
  const sup = profundidadSuperficie(0, 0.5, D);
  const i = impactoChorro(0, sup, D);
  assert.equal(i.contra, 'superficie');
  assert.ok(Math.abs(i.distancia - sup) < 1e-9);
});

test('al chocar con la pared, la cerveza resbala por ella hasta la superficie', () => {
  for (const a of [20, 45, -45, 60]) {
    const sup = profundidadSuperficie(a, 0.2, D);
    const i = impactoChorro(a, sup, D);
    if (i.contra !== 'pared') continue;
    const r = regueroPared(a, i, sup, D);
    assert.ok(r, `a=${a}`);
    assert.equal(r.lado, i.lado);
    assert.ok(r.hasta > r.desde && r.hasta <= D.alto);
    // El final del reguero esta en la superficie: su profundidad real es la de la superficie.
    const prof = (r.lado * D.ancho) / 2 * Math.sin(rad(a)) + r.hasta * Math.cos(rad(a));
    assert.ok(Math.abs(prof - sup) < 1e-6 || r.hasta === D.alto, `a=${a}`);
  }
  // Si choca con la superficie no hay reguero.
  const sup = profundidadSuperficie(10, 0.9, D);
  assert.equal(regueroPared(10, impactoChorro(10, sup, D), sup, D), null);
});

test('se derrama por el borde bajo; recto, por los dos', () => {
  assert.equal(bordesDeDerrame(0, 64).length, 2);
  const [d] = bordesDeDerrame(30, 64);
  assert.ok(d.x > 0 && d.y > 0);
  const [i] = bordesDeDerrame(-30, 64);
  assert.ok(i.x < 0 && i.y > 0);
});
