import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LevaduraId } from './datos.ts';
import {
  acierto,
  avanzar,
  INICIO,
  inerciaRestante,
  precision,
  sembrar,
  suerte,
  TEMP_GRIFO,
  TEMP_INICIAL,
  TEMP_MUERTE,
  terminado,
  TIEMPO_MAX,
  TOLERANCIA,
  VELOCIDAD_MAX,
  VENTANAS,
  type Estado,
} from './siembra.ts';

const DT = 1 / 60;
const centro = (l: LevaduraId) => (VENTANAS[l].min + VENTANAS[l].max) / 2;

/**
 * Juega hasta sembrar. `grifo(e)` decide en cada fotograma si se mantiene
 * pulsado; `echar(e)` si se siembra ya.
 */
function jugar(grifo: (e: Estado) => boolean, echar: (e: Estado) => boolean): Estado {
  let e = INICIO;
  for (let i = 0; i < 60 * (TIEMPO_MAX + 5) && !terminado(e); i++) {
    if (echar(e)) {
      e = sembrar(e);
      break;
    }
    e = avanzar(e, DT, grifo(e));
  }
  return e;
}

test('las ventanas son las habituales y la lager es mas fria que la ale', () => {
  assert.deepEqual(VENTANAS.ale, { min: 18, max: 22 });
  assert.deepEqual(VENTANAS.lager, { min: 8, max: 12 });
  assert.ok(VENTANAS.lager.max < VENTANAS.ale.min);
  // Las dos se pueden alcanzar: el grifo enfria por debajo de la lager.
  assert.ok(TEMP_GRIFO < VENTANAS.lager.min);
});

test('acierto: 1 en la ventana, baja en recta y es 0 a TOLERANCIA grados', () => {
  for (const l of ['ale', 'lager'] as const) {
    const { min, max } = VENTANAS[l];
    assert.equal(acierto(min, l), 1);
    assert.equal(acierto(max, l), 1);
    assert.equal(acierto(centro(l), l), 1);
    assert.equal(acierto(max + TOLERANCIA / 2, l), 0.5);
    assert.equal(acierto(min - TOLERANCIA, l), 0);
    assert.equal(acierto(max + TOLERANCIA + 1, l), 0);
  }
});

test('acierto: por encima de la temperatura de muerte es 0 aunque no hubiera tolerancia que lo dijera', () => {
  assert.equal(acierto(TEMP_MUERTE, 'ale'), 0);
  assert.equal(acierto(TEMP_INICIAL, 'ale'), 0);
});

test('suerte: muerta, estresada, perfecta o dormida', () => {
  assert.equal(suerte(TEMP_INICIAL, 'ale'), 'muerta');
  assert.equal(suerte(TEMP_MUERTE, 'lager'), 'muerta');
  assert.equal(suerte(25, 'ale'), 'estresada');
  assert.equal(suerte(20, 'ale'), 'perfecta');
  assert.equal(suerte(15, 'ale'), 'dormida');
  assert.equal(suerte(15, 'lager'), 'estresada');
  assert.equal(suerte(10, 'lager'), 'perfecta');
  assert.equal(suerte(5, 'lager'), 'dormida');
});

test('sin abrir el grifo apenas se enfria: hace falta jugar', () => {
  const e = avanzar(INICIO, 5, false);
  assert.ok(e.temp > TEMP_INICIAL - 3, `${e.temp}`);
});

test('con el grifo abierto el enfriamiento ARRANCA poco a poco (no a tope de golpe)', () => {
  const tras01 = avanzar(INICIO, 0.1, true);
  assert.ok(-tras01.velocidad < VELOCIDAD_MAX / 2, `${tras01.velocidad}`);
  let e = INICIO;
  for (let i = 0; i < 120; i++) e = avanzar(e, DT, true);
  assert.ok(-e.velocidad > VELOCIDAD_MAX * 0.9, `${e.velocidad}`);
});

test('nunca baja del agua del grifo', () => {
  const e = jugar(() => true, () => false);
  assert.ok(e.temp >= TEMP_GRIFO);
  let f = INICIO;
  for (let i = 0; i < 60 * 15; i++) f = avanzar(f, DT, true);
  assert.equal(f.temp, TEMP_GRIFO);
});

test('INERCIA: soltar justo al entrar en la ventana se pasa de largo (hay que anticiparse)', () => {
  for (const l of ['ale', 'lager'] as const) {
    let e = INICIO;
    while (e.temp > VENTANAS[l].max) e = avanzar(e, DT, true);
    // Se suelta aqui y se espera a que pare.
    for (let i = 0; i < 60 * 3; i++) e = avanzar(e, DT, false);
    assert.ok(e.temp < VENTANAS[l].min, `${l}: se quedo en ${e.temp}`);
  }
});

test('inerciaRestante predice cuanto bajara al soltar (con menos de 1 grado de error)', () => {
  let e = INICIO;
  for (let i = 0; i < 60 * 3; i++) e = avanzar(e, DT, true);
  const prevista = inerciaRestante(e);
  const antes = e.temp;
  for (let i = 0; i < 60 * 3; i++) e = avanzar(e, DT, false);
  // Lo que baja "de mas" por inercia; lo del enfriamiento natural es aparte y pequeno.
  const real = antes - e.temp - 0.3 * 3;
  assert.ok(Math.abs(real - prevista) < 1, `prevista ${prevista}, real ${real}`);
  assert.equal(inerciaRestante(INICIO), 0);
});

test('JUGABLE: soltando cuando la inercia llega justa y echando en la ventana se clava, con las dos levaduras', () => {
  for (const l of ['ale', 'lager'] as const) {
    const objetivo = centro(l);
    const e = jugar(
      (x) => x.temp - inerciaRestante(x) > objetivo,
      (x) => x.velocidad > -0.5 && x.temp <= VENTANAS[l].max,
    );
    assert.equal(precision(e, l), 1, `${l}: sembrada a ${e.sembradaA}`);
    assert.ok(e.t < TIEMPO_MAX, `${l}: le dio tiempo (${e.t} s)`);
  }
});

test('echar enseguida, con el mosto caliente, mata la levadura y no puntua', () => {
  const e = sembrar(avanzar(INICIO, 0.5, true));
  assert.equal(precision(e, 'ale'), 0);
  assert.equal(suerte(e.sembradaA!, 'ale'), 'muerta');
});

test('sembrar es definitivo: ni otro toque ni el tiempo lo cambian', () => {
  let e = INICIO;
  for (let i = 0; i < 60 * 6; i++) e = avanzar(e, DT, true);
  const sembrada = sembrar(e);
  assert.equal(sembrar(sembrada), sembrada);
  assert.equal(avanzar(sembrada, 1, true), sembrada);
  assert.ok(terminado(sembrada));
});

test('si se agota el tiempo, se echa sola con lo que haya', () => {
  const e = jugar(() => false, () => false);
  assert.ok(terminado(e));
  assert.equal(e.sola, true);
  assert.equal(e.t, TIEMPO_MAX);
  assert.equal(e.sembradaA, e.temp);
  // Sin abrir el grifo sigue casi hirviendo: levadura muerta.
  assert.equal(precision(e, 'lager'), 0);
});

test('precision sin sembrar es 0', () => {
  assert.equal(precision(INICIO, 'ale'), 0);
});

test('fermentacion: una palabra para la tarjeta, de limpia a fallida', async () => {
  const { fermentacion } = await import('./siembra.ts');
  assert.equal(fermentacion(1), 'limpia');
  assert.equal(fermentacion(0.9), 'limpia');
  assert.equal(fermentacion(0.89), 'buena');
  assert.equal(fermentacion(0.5), 'buena');
  assert.equal(fermentacion(0.01), 'con defectos');
  assert.equal(fermentacion(0), 'fallida');
});
