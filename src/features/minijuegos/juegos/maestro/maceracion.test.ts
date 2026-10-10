import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  acierto,
  ALTO_APP_RESERVADO,
  avanzar,
  calentar,
  climaOlla,
  colorMosto,
  DURACION,
  escalaOlla,
  ESCALA_OLLA_MIN,
  INICIO,
  INTENSIDAD_MINIMA,
  particulaVisible,
  particulasVisibles,
  precision,
  TEMP_INICIAL,
  terminado,
  TOLERANCIA,
  ZONA,
  type Estado,
} from './maceracion.ts';

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

// --- La olla -----------------------------------------------------------------

test('olla: en la zona (bordes incluidos) esta en su punto y no echa ni vapor ni nieve', () => {
  for (const t of [ZONA.min, 65, ZONA.max]) {
    assert.deepEqual(climaOlla(t), { modo: 'justo', intensidad: 0 });
    assert.equal(particulasVisibles(climaOlla(t), 6), 0);
  }
});

test('olla: por debajo nieva y por encima echa vapor, y medio grado ya se nota', () => {
  const frio = climaOlla(ZONA.min - 0.1);
  const caliente = climaOlla(ZONA.max + 0.1);
  assert.equal(frio.modo, 'frio');
  assert.equal(caliente.modo, 'caliente');
  assert.ok(frio.intensidad >= INTENSIDAD_MINIMA);
  assert.equal(particulasVisibles(frio, 7), 2);
  assert.ok(particulasVisibles(caliente, 6) >= 1);
});

test('olla: la senal crece con la distancia y esta al maximo donde ya no se puntua', () => {
  const cerca = climaOlla(ZONA.max + 1).intensidad;
  const lejos = climaOlla(ZONA.max + 3).intensidad;
  assert.ok(lejos > cerca);
  assert.equal(climaOlla(ZONA.max + TOLERANCIA).intensidad, 1);
  assert.equal(climaOlla(ZONA.min - TOLERANCIA - 10).intensidad, 1);
  assert.equal(particulasVisibles(climaOlla(ZONA.min - TOLERANCIA), 7), 7);
});

test('olla: la temperatura inicial ya es fria (antes del primer toque se ve nevar)', () => {
  assert.ok(TEMP_INICIAL < ZONA.min);
  assert.equal(climaOlla(TEMP_INICIAL).modo, 'frio');
});

test('olla: se ven exactamente las que tocan, repartidas y no pegadas a un lado', () => {
  for (const total of [6, 7]) {
    for (let visibles = 0; visibles <= total; visibles++) {
      const encendidas = Array.from({ length: total }, (_, i) => i).filter((i) => particulaVisible(i, visibles, total));
      assert.equal(encendidas.length, visibles, `${visibles} de ${total}`);
      if (visibles >= 2) assert.ok(encendidas.at(-1)! >= total / 2, `${visibles} de ${total}: ${encendidas.join(',')}`);
    }
  }
});

test('olla: el mosto es dorado en su punto, palido en frio, tostado en caliente', () => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [jr, jg, jb] = rgb(colorMosto(65));
  const [fr, fg, fb] = rgb(colorMosto(ZONA.min - TOLERANCIA));
  const [cr, cg, cb] = rgb(colorMosto(ZONA.max + TOLERANCIA));
  assert.match(colorMosto(65), /^#[0-9A-F]{6}$/);
  assert.ok(fb > jb && fg > jg, 'el frio es mas palido');
  assert.ok(cg < jg && cr < jr + 1, 'el caliente es mas tostado');
  assert.equal(colorMosto(ZONA.min), colorMosto(ZONA.max));
  assert.notEqual(colorMosto(ZONA.max + 1), colorMosto(ZONA.max + 3));
});

test('olla: en una pantalla grande va a tamano natural', () => {
  assert.equal(escalaOlla(ALTO_APP_RESERVADO + 232 + 240 + 100, 232, 240), 1);
});

test('olla: se encoge lo justo para que el paso quepa, y deja el hueco exacto', () => {
  const ventana = ALTO_APP_RESERVADO + 232 + 120;
  const escala = escalaOlla(ventana, 232, 240);
  assert.ok(Math.abs(escala - 0.5) < 1e-9);
  assert.ok(232 + 240 * escala + ALTO_APP_RESERVADO <= ventana + 1e-9, 'el paso cabe');
});

test('olla: nunca baja del minimo, ni con una ventana absurda', () => {
  assert.equal(escalaOlla(300, 232, 240), ESCALA_OLLA_MIN);
  assert.equal(escalaOlla(0, 232, 240), ESCALA_OLLA_MIN);
  assert.equal(escalaOlla(NaN, 232, 240), ESCALA_OLLA_MIN);
});

test('olla: crece con la ventana, sin saltos hacia atras', () => {
  let anterior = 0;
  for (let h = 500; h <= 1000; h += 10) {
    const e = escalaOlla(h, 232, 240);
    assert.ok(e >= anterior);
    anterior = e;
  }
});
