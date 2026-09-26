import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ASENTAMIENTO, avanzar, derrameTotal, haDerramado, estaLleno, ESTADO_VACIO, fraccionEspuma, LLENO, puntuar, total, vaso } from './modelo.ts';

test('recto da mucha espuma e inclinado 45 grados, poca', () => {
  assert.ok(fraccionEspuma(0) > 0.6);
  assert.ok(fraccionEspuma(45) <= 0.1 + 1e-9);
  assert.ok(fraccionEspuma(80) >= 0.08);
});

test('con el grifo cerrado no entra nada y la espuma se asienta en liquido', () => {
  const antes = vaso(0.4, 0.2);
  const despues = avanzar(antes, 1, false, 0);
  assert.ok(Math.abs(total(despues) - total(antes)) < 1e-9);
  assert.ok(Math.abs(despues.espuma - 0.2 * Math.exp(-ASENTAMIENTO)) < 1e-9);
});

test('la espuma no desaparece en pocos segundos: aguanta la corona', () => {
  let e = vaso(0.7, 0.18);
  for (let i = 0; i < 10 * 60; i++) e = avanzar(e, 1 / 60, false, 0);
  // 10 s despues sigue quedando mas de la mitad.
  assert.ok(e.espuma > 0.09, `quedan ${e.espuma}`);
  assert.ok(Math.abs(total(e) - 0.88) < 1e-9);
});

test('el asentamiento no depende del tamano del fotograma', () => {
  const grande = avanzar(vaso(0.5, 0.2), 1, false, 0);
  let pequeno = vaso(0.5, 0.2);
  for (let i = 0; i < 100; i++) pequeno = avanzar(pequeno, 0.01, false, 0);
  assert.ok(Math.abs(grande.espuma - pequeno.espuma) < 1e-9);
});

test('la espuma nunca se vuelve negativa', () => {
  const despues = avanzar(vaso(0.5, 0.001), 5, false, 0);
  assert.ok(despues.espuma >= 0);
});

test('con el grifo abierto el total sube', () => {
  const e = avanzar(ESTADO_VACIO, 1, true, 20);
  assert.ok(total(e) > 0.15);
});

test('lo que pasa del borde se derrama y se lleva primero la espuma', () => {
  const e = avanzar(vaso(0.7, 0.29), 1, true, 0);
  assert.ok(total(e) <= LLENO + 1e-9);
  assert.ok(haDerramado(e));
  assert.ok(e.derramado > 0.1);
  // El vaso queda lleno de liquido y la espuma se ha ido por el borde.
  assert.ok(e.espuma < 0.29);
});

test('con el vaso lleno, seguir sirviendo solo aumenta el derrame', () => {
  let e = vaso(0.8, 0.2);
  assert.ok(estaLleno(e));
  const antes = e.derramado;
  e = avanzar(e, 0.5, true, 45);
  assert.ok(e.derramado > antes);
  assert.ok(total(e) <= LLENO + 1e-9);
});

test('la partida se da por perdida con derrame total', () => {
  assert.equal(derrameTotal(vaso(0.8, 0.2, 0.29)), false);
  assert.equal(derrameTotal(vaso(0.8, 0.2, 0.3)), true);
});

test('una cana de manual saca casi todos los puntos', () => {
  const total88 = LLENO;
  const e = vaso(total88 * 0.82, total88 * 0.18);
  const d = puntuar(e, 6);
  assert.equal(d.nivel, 40);
  assert.equal(d.espuma, 40);
  assert.equal(d.rapidez, 20);
  assert.equal(d.total, 100);
});

test('un vaso de espuma puntua mal la espuma', () => {
  const d = puntuar(vaso(0.1, 0.78), 6);
  assert.equal(d.espuma, 0);
});

test('un vaso sin espuma tambien se penaliza, pero menos que uno de espuma', () => {
  const d = puntuar(vaso(LLENO, 0), 6);
  assert.ok(d.espuma < 40 && d.espuma > 0);
});

test('servir en vacio es 0', () => {
  assert.equal(puntuar(ESTADO_VACIO, 3).total, 0);
});

test('derramar penaliza fuerte pero no lo deja en 0', () => {
  const limpia = puntuar(vaso(0.82, 0.18), 6);
  const poco = puntuar(vaso(0.82, 0.18, 0.05), 6);
  const mucho = puntuar(vaso(0.82, 0.18, 0.15), 6);
  const perdido = puntuar(vaso(0.82, 0.18, 0.3), 6);
  assert.ok(limpia.total > poco.total && poco.total > mucho.total && mucho.total > perdido.total);
  assert.ok(perdido.total > 0, 'no es un cero');
  assert.ok(perdido.total <= limpia.total * 0.2 + 1);
  assert.equal(poco.penalizacion, limpia.total - poco.total);
});

test('la rapidez baja con el tiempo y llega a 0', () => {
  const e = vaso(LLENO * 0.82, LLENO * 0.18);
  assert.ok(puntuar(e, 13).rapidez < puntuar(e, 6).rapidez);
  assert.equal(puntuar(e, 20).rapidez, 0);
  assert.equal(puntuar(e, 60).rapidez, 0);
});

test('el desglose suma el total', () => {
  const d = puntuar(vaso(0.5, 0.2), 10);
  assert.equal(d.total, d.nivel + d.espuma + d.rapidez - d.penalizacion);
});

test('esperar no arregla una espuma mal tirada', () => {
  // Todo recto: casi todo espuma. Se sirve hasta arriba y se espera 40 s.
  let e = ESTADO_VACIO;
  while (total(e) < 0.9) e = avanzar(e, 1 / 60, true, 0);
  const alMomento = puntuar(e, 6).espuma;
  for (let i = 0; i < 40 * 60; i++) e = avanzar(e, 1 / 60, false, 0);
  const despues = puntuar(e, 6).espuma;
  assert.ok(e.espuma / total(e) < 0.6, 'la espuma si baja algo');
  assert.ok(despues <= 8, `tras esperar sigue mal (${despues})`);
  assert.ok(despues >= alMomento);
});

test('la tecnica buena (inclinado y recto al final) da buena espuma', () => {
  let e = ESTADO_VACIO;
  while (total(e) < 0.8) e = avanzar(e, 1 / 60, true, 45);
  while (total(e) < 0.97) e = avanzar(e, 1 / 60, true, 0);
  assert.ok(puntuar(e, 6).espuma >= 28, `espuma ${puntuar(e, 6).espuma}`);
});

test('llegar justo al borde no cuenta como derrame por redondeo', () => {
  assert.equal(haDerramado(vaso(LLENO * 0.82, LLENO * 0.18)), false);
});
