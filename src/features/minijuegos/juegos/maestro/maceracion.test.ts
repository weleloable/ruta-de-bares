import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acierto, avanzar, calentar, DURACION, INICIO, precision, terminado, TOLERANCIA, ZONA, type Estado } from './maceracion.ts';

const DT = 1 / 60;

/** Juega hasta el final; `politica` decide en cada fotograma si se toca. */
function jugar(politica: (e: Estado) => boolean, ruido = 0): Estado {
  let e = INICIO;
  for (let i = 0; i < 60 * 40 && !terminado(e); i++) {
    if (politica(e)) e = calentar(e);
    e = avanzar(e, DT, ruido);
  }
  return e;
}

test('acierto: 1 en la zona, baja en recta y es 0 a TOLERANCIA grados', () => {
  assert.equal(acierto(ZONA.min), 1);
  assert.equal(acierto(65), 1);
  assert.equal(acierto(ZONA.max), 1);
  assert.equal(acierto(ZONA.min - TOLERANCIA / 2), 0.5);
  assert.equal(acierto(ZONA.max + TOLERANCIA), 0);
  assert.equal(acierto(20), 0);
});

test('sin tocar, la olla se enfria y la aguja se aleja de la zona', () => {
  const e = avanzar(INICIO, 1, 0);
  assert.ok(e.temp < INICIO.temp);
});

test('un toque calienta', () => {
  assert.ok(calentar(INICIO).temp > INICIO.temp);
});

test('el juego dura exactamente DURACION y no se pasa', () => {
  const e = jugar(() => false);
  assert.ok(Math.abs(e.t - DURACION) < 1e-6);
  assert.ok(e.acumulado <= DURACION + 1e-6);
  // Una vez terminado no cambia nada.
  assert.equal(avanzar(e, 1, 1), e);
  assert.equal(calentar(e), e);
});

test('no tocar nunca da precision baja', () => {
  assert.ok(precision(jugar(() => false)) < 0.25);
});

test('mantener la aguja en la zona da precision casi perfecta', () => {
  const e = jugar((s) => s.temp < 65);
  assert.ok(precision(e) > 0.85, `precision ${precision(e)}`);
});

test('con la deriva empujando en contra, tocar bien sigue siendo mejor que no tocar', () => {
  const tocando = precision(jugar((s) => s.temp < 65, -1));
  const quieto = precision(jugar(() => false, -1));
  assert.ok(tocando > quieto);
});

test('la temperatura nunca sale del rango del termometro', () => {
  const e = jugar(() => true, 1);
  assert.ok(e.temp <= 85);
  const f = jugar(() => false, -1);
  assert.ok(f.temp >= 40);
});
