import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  avanzar,
  barajar,
  CARTAS,
  crearAzar,
  crearPartida,
  formatearTiempo,
  ID_PAREJAS,
  nota,
  notaValida,
  parejasEncontradas,
  SIMBOLOS,
  tiempo,
  TIEMPO_MAXIMO,
  TIEMPO_MINIMO,
  tocar,
  VISTA_FALLO,
  VOLTEO,
  type Partida,
} from './modelo.ts';
import { formatearNota } from '../../nota.ts';

/** Donde esta la pareja de la carta i. */
const pareja = (p: Partida, i: number) => p.cartas.findIndex((c, k) => k !== i && c.simbolo === p.cartas[i]?.simbolo);

/**
 * Juega perfecto (memoria total) tocando cada carta en cuanto se puede, mas
 * `extra` segundos. Devuelve la partida terminada.
 */
function jugarPerfecto(semilla: number, extra = 0): Partida {
  let p = crearPartida(semilla);
  let t = 100;
  const hechas = new Set<number>();
  for (let i = 0; i < CARTAS; i++) {
    if (hechas.has(i)) continue;
    const j = pareja(p, i);
    p = tocar(p, i, t);
    t = p.bloqueadaHasta + extra;
    p = tocar(p, j, t);
    t = p.bloqueadaHasta + extra;
    hechas.add(i).add(j);
  }
  return p;
}

test('barajar: siempre 8 parejas exactas, una de cada simbolo', () => {
  for (let s = 0; s < 500; s++) {
    const mazo = barajar(s);
    assert.equal(mazo.length, 16);
    for (const simbolo of SIMBOLOS) assert.equal(mazo.filter((x) => x === simbolo).length, 2, `semilla ${s}`);
  }
});

test('barajar: la misma semilla da el mismo tablero; otra, otro', () => {
  assert.deepEqual(barajar(42), barajar(42));
  assert.notDeepEqual(barajar(42), barajar(43));
  // De verdad baraja: la primera carta cambia entre semillas.
  const primeras = new Set(Array.from({ length: 200 }, (_, s) => barajar(s)[0]));
  assert.equal(primeras.size, 8);
});

test('crearAzar: entre 0 y 1', () => {
  const azar = crearAzar(7);
  for (let i = 0; i < 1000; i++) {
    const x = azar();
    assert.ok(x >= 0 && x < 1);
  }
});

test('el reloj no corre antes del primer toque', () => {
  const p = crearPartida(1);
  assert.equal(tiempo(p, 0), 0);
  assert.equal(tiempo(p, 9999), 0);
  const q = tocar(p, 0, 50);
  assert.equal(q.inicio, 50);
  assert.equal(tiempo(q, 53.5), 3.5);
});

test('un toque mientras gira una carta no hace nada', () => {
  const p = tocar(crearPartida(1), 0, 10);
  const otra = p.cartas.findIndex((c, k) => k !== 0 && c.estado === 'tapada');
  assert.equal(tocar(p, otra, 10 + VOLTEO / 2), p);
  assert.notEqual(tocar(p, otra, 10 + VOLTEO), p);
});

test('no se voltea una tercera carta mientras dos se ven, y se tapan a los 0,8 s', () => {
  let p = crearPartida(3);
  const a = 0;
  const b = p.cartas.findIndex((c, k) => k !== a && c.simbolo !== p.cartas[a]?.simbolo);
  const c = p.cartas.findIndex((x, k) => k !== a && k !== b && x.estado === 'tapada');
  p = tocar(p, a, 0);
  p = tocar(p, b, VOLTEO);
  assert.equal(p.fallos, 1);
  assert.equal(p.intentos, 1);
  const tapan = VOLTEO + VOLTEO + VISTA_FALLO;
  // Justo antes de taparse: nada.
  const quieta = tocar(p, c, tapan - 0.01);
  assert.equal(quieta.cartas.filter((x) => x.estado === 'vista').length, 2);
  assert.equal(quieta.cartas[c]?.estado, 'tapada');
  // Al taparse, la tercera ya entra.
  const sigue = tocar(p, c, tapan);
  assert.equal(sigue.cartas[a]?.estado, 'tapada');
  assert.equal(sigue.cartas[b]?.estado, 'tapada');
  assert.equal(sigue.cartas[c]?.estado, 'vista');
  // avanzar solo tapa cuando toca.
  assert.equal(avanzar(p, tapan - 0.01), p);
  assert.deepEqual(avanzar(p, tapan).abiertas, []);
});

test('tocar la misma carta dos veces, o una emparejada, no cuenta intento', () => {
  let p = crearPartida(5);
  p = tocar(p, 0, 0);
  const mismo = tocar(p, 0, 1);
  assert.equal(mismo, p, 'la misma carta otra vez no hace nada');
  p = tocar(p, pareja(p, 0), 1);
  assert.equal(p.intentos, 1);
  assert.equal(p.cartas[0]?.estado, 'emparejada');
  const otraVez = tocar(p, 0, 5);
  assert.equal(otraVez.intentos, 1);
  assert.deepEqual(otraVez.abiertas, []);
});

test('partida perfecta lo mas rapida posible: exactamente TIEMPO_MINIMO', () => {
  assert.equal(TIEMPO_MINIMO, 4);
  for (const s of [1, 2, 99, 12345]) {
    const p = jugarPerfecto(s);
    assert.equal(p.fin !== null, true);
    assert.equal(nota(p), TIEMPO_MINIMO);
    assert.equal(p.intentos, 8);
    assert.equal(p.fallos, 0);
    assert.equal(parejasEncontradas(p), 8);
  }
});

test('ninguna partida baja de TIEMPO_MINIMO (10.000 jugadores al azar, tocando a lo loco)', () => {
  const azar = crearAzar(2026);
  for (let n = 0; n < 10000; n++) {
    let p = crearPartida(n);
    let t = azar() * 10;
    let toques = 0;
    // A veces con memoria perfecta, a veces al azar; siempre con toques mas
    // rapidos de lo que el juego deja (para probar que se ignoran).
    const memoria = azar() < 0.3;
    while (p.fin === null && toques < 5000) {
      let i: number;
      if (memoria && p.abiertas.length === 1) i = pareja(p, p.abiertas[0] as number);
      else i = Math.floor(azar() * CARTAS);
      p = tocar(p, i, t);
      t += azar() * 0.4;
      toques++;
    }
    assert.ok(p.fin !== null, `la partida ${n} no termino`);
    const final = nota(p) as number;
    assert.ok(final >= TIEMPO_MINIMO, `partida ${n}: ${final} < ${TIEMPO_MINIMO}`);
    assert.equal(p.intentos, p.fallos + 8);
  }
});

test('el reloj se para al encontrar la octava pareja', () => {
  const p = jugarPerfecto(8, 0.5);
  const final = tiempo(p, (p.fin as number) + 100);
  assert.equal(final, tiempo(p, (p.fin as number) + 1));
  // 16 volteos de 0,25 + 15 esperas de 0,5 entre toques.
  assert.equal(nota(p), 4 + 15 * 0.5);
  // Ya terminada, tocar no hace nada.
  assert.equal(tocar(p, 0, (p.fin as number) + 1), p);
});

test('notaValida: el mismo rango que el servidor (0070)', () => {
  assert.equal(notaValida(TIEMPO_MINIMO), true);
  assert.equal(notaValida(23.47), true);
  assert.equal(notaValida(TIEMPO_MAXIMO), true);
  assert.equal(notaValida(TIEMPO_MINIMO - 0.01), false);
  assert.equal(notaValida(TIEMPO_MAXIMO + 0.01), false);
  assert.equal(notaValida(12.345), false);
  assert.equal(notaValida(Number.NaN), false);
});

test('notaValida: TODAS las centesimas del rango valen (coma flotante: 4,35 * 100 no es 435)', () => {
  const fallan = [];
  for (let k = TIEMPO_MINIMO * 100; k <= TIEMPO_MAXIMO * 100; k++) if (!notaValida(k / 100)) fallan.push(k / 100);
  assert.deepEqual(fallan, []);
  // Y la nota de una partida de verdad (reloj con una base grande, como performance.now) tambien.
  const azar = crearAzar(5);
  for (let i = 0; i < 20000; i++) {
    const base = 1000 + azar() * 1e6;
    const p = { ...crearPartida(1), inicio: base, fin: base + 4 + azar() * 590 };
    assert.equal(notaValida(nota(p) as number), true, String(nota(p)));
  }
});

test('formatearTiempo: coma decimal, dos cifras, y redondea como la nota', () => {
  assert.equal(formatearTiempo(0), '0,00 s');
  assert.equal(formatearTiempo(23.47), '23,47 s');
  assert.equal(formatearTiempo(5), '5,00 s');
  // El reloj parado y la nota enviada dicen lo mismo, tambien con un tiempo de muchas cifras.
  const azar = crearAzar(11);
  for (let i = 0; i < 2000; i++) {
    const t = 4 + azar() * 596;
    assert.equal(formatearTiempo(t), formatearNota(ID_PAREJAS, Math.round(t * 100) / 100), String(t));
  }
});
