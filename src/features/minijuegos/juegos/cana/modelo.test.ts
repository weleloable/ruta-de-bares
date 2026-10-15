import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ASENTAMIENTO,
  avanzar,
  curvaAlta,
  derrameTotal,
  ESPUMA_IDEAL,
  estaLleno,
  ESTADO_VACIO,
  fraccionEspuma,
  haDerramado,
  LLENO,
  puntuar,
  PUNTUACION_MAXIMA,
  TIEMPO_LENTO,
  TIEMPO_RAPIDO,
  total,
  UMBRAL_CURVA,
  vaso,
} from './modelo.ts';

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

// Una cana "de manual": hasta el borde, con la espuma justo en la banda ideal.
const MANUAL = vaso(LLENO * (1 - ESPUMA_IDEAL.max), LLENO * ESPUMA_IDEAL.max);

test('una cana perfecta, tirada de un tiron, es 100; una buena, no', () => {
  const d = puntuar(MANUAL, TIEMPO_RAPIDO);
  assert.equal(d.nivel, 40);
  assert.equal(d.espuma, 40);
  assert.equal(d.rapidez, 20);
  assert.equal(d.total, 100);
  // Tardar 6 s en vez de 5 ya no la deja en 100.
  assert.ok(puntuar(MANUAL, 6).total < 100);
});

test('la nota lleva dos decimales y no se redondea a entero', () => {
  const d = puntuar(vaso(0.81, 0.18), 6.3);
  assert.notEqual(d.total, Math.round(d.total), `salio entera: ${d.total}`);
  assert.equal(d.total, Math.round(d.total * 100) / 100);
  assert.ok(d.total > 0 && d.total < 100);
});

test('dos tiradas casi iguales ya no empatan: cada milesima del vaso cuenta', () => {
  const a = puntuar(vaso(0.822, 0.177), 5.4).total;
  const b = puntuar(vaso(0.82, 0.176), 5.4).total;
  assert.notEqual(a, b);
});

test('la banda ideal de espuma es estrecha', () => {
  assert.ok(ESPUMA_IDEAL.max - ESPUMA_IDEAL.min <= 0.02);
  // Un 15 % de espuma, que antes daba los 40 puntos, ahora ya no.
  assert.ok(puntuar(vaso(0.85, 0.15), 5).espuma < 40);
});

describe_curva();
function describe_curva() {
  test('la curva alta no toca nada por debajo de 90 y sigue siendo continua en 90', () => {
    for (const x of [0, 40, 75.5, 89.99, UMBRAL_CURVA]) assert.equal(curvaAlta(x), x);
    assert.ok(Math.abs(curvaAlta(UMBRAL_CURVA + 1e-9) - UMBRAL_CURVA) < 1e-4);
  });

  test('por encima de 90 cada punto cuesta mas y el 100 solo sale de una partida perfecta', () => {
    assert.equal(curvaAlta(100), PUNTUACION_MAXIMA);
    assert.ok(Math.abs(curvaAlta(95) - 92.93) < 0.01);
    assert.ok(Math.abs(curvaAlta(99) - 96.84) < 0.01);
    // Nunca premia: la nota final no supera a la bruta.
    for (let x = 90; x <= 100; x += 0.25) assert.ok(curvaAlta(x) <= x + 1e-12, `${x}`);
    // Y no se pasa de 100 aunque la entrada se pase.
    assert.equal(curvaAlta(120), 100);
  });

  test('es creciente: mejorar la nota bruta nunca empeora la final', () => {
    let anterior = -1;
    for (let x = 0; x <= 100; x += 0.05) {
      const y = curvaAlta(x);
      assert.ok(y >= anterior, `baja en ${x}`);
      anterior = y;
    }
  });

  test('un fallo pequeno cuesta mas cuanto mas arriba: medio punto bruto duele mas en 100 que en 95 que en 90', () => {
    const duele = (desde: number) => curvaAlta(desde) - curvaAlta(desde - 0.5);
    assert.ok(duele(100) > duele(95), `${duele(100)} vs ${duele(95)}`);
    assert.ok(duele(95) > duele(90.5), `${duele(95)} vs ${duele(90.5)}`);
  });

  test('para sacar 99 hay que tener la nota bruta casi perfecta', () => {
    // La otra cara de lo mismo: con la nota bruta en 99 ya solo se llega a 96,84.
    assert.ok(curvaAlta(99.5) < 99);
    assert.ok(curvaAlta(99.9) >= 98.9 && curvaAlta(99.9) <= 99.1);
  });
}

test('un vaso de espuma puntua mal la espuma', () => {
  const d = puntuar(vaso(0.1, 0.78), 6);
  assert.equal(d.espuma, 0);
});

test('sin nada de espuma no se puntua la espuma, y con algo de espuma si', () => {
  assert.equal(puntuar(vaso(LLENO, 0), 6).espuma, 0);
  const poca = puntuar(vaso(LLENO * 0.9, LLENO * 0.1), 6).espuma;
  assert.ok(poca > 0 && poca < 40, `espuma ${poca}`);
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
  // `penalizacion` es lo que se pierde ANTES de la curva alta.
  assert.ok(Math.abs(poco.penalizacion - (limpia.bruta - poco.bruta)) < 0.02);
});

test('la rapidez baja con el tiempo y llega a 0', () => {
  const e = vaso(LLENO * 0.82, LLENO * 0.18);
  assert.equal(puntuar(e, TIEMPO_RAPIDO).rapidez, 20);
  assert.ok(puntuar(e, 10).rapidez < puntuar(e, 6).rapidez);
  assert.equal(puntuar(e, TIEMPO_LENTO).rapidez, 0);
  assert.equal(puntuar(e, 60).rapidez, 0);
});

test('el desglose suma la nota bruta y de ahi sale el total', () => {
  const d = puntuar(vaso(0.5, 0.2), 10);
  assert.ok(Math.abs(d.bruta - (d.nivel + d.espuma + d.rapidez - d.penalizacion)) < 0.03);
  // Por debajo del umbral la curva no toca nada.
  assert.ok(d.bruta < UMBRAL_CURVA);
  assert.equal(d.total, d.bruta);
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
  assert.ok(puntuar(e, 6).espuma >= 20, `espuma ${puntuar(e, 6).espuma}`);
});

test('llegar justo al borde no cuenta como derrame por redondeo', () => {
  assert.equal(haDerramado(vaso(LLENO * 0.82, LLENO * 0.18)), false);
});

test('un tiempo roto (NaN, infinito) no produce una nota NaN', () => {
  for (const seg of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5]) {
    const d = puntuar(MANUAL, seg);
    assert.ok(Number.isFinite(d.total) && d.total >= 0 && d.total <= 100, `${seg} -> ${d.total}`);
  }
  // Un NaN cuenta como lo mas lento: nada de rapidez.
  assert.equal(puntuar(MANUAL, Number.NaN).rapidez, 0);
});
