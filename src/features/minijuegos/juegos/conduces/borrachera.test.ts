import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  avanzarBorrachera,
  EFECTOS,
  intensidad,
  mandosBorrachos,
  nuevaBorrachera,
  visuales,
  type EstadoBorrachera,
} from './borrachera.ts';
import { comoVas, MENSAJE_SEGURIDAD, mensajeFinal, metrosTexto, nombreNivel } from './mensajes.ts';
import { CHOQUES_MAX, GOLPE_MINIMO, INVULNERABLE, registrarGolpe } from './modelo.ts';

const fijo = (v: number) => () => v;
const RECTO = { giro: 0, acelerar: true, frenar: false };

/** Simula `segundos` a 60 fps con un azar dado y devuelve el estado final. */
function pasar(e: EstadoBorrachera, I: number, segundos: number, azar: () => number) {
  for (let t = 0; t < segundos; t += 1 / 60) e = avanzarBorrachera(e, I, 1 / 60, azar);
  return e;
}

describe('la intensidad', () => {
  it('nivel 1 casi nada, el maximo del todo, y siempre creciendo', () => {
    assert.ok(intensidad(1, 8) < 0.06);
    assert.equal(intensidad(8, 8), 1);
    for (let n = 1; n < 8; n++) assert.ok(intensidad(n + 1, 8) > intensidad(n, 8));
    assert.ok(intensidad(1, 1) < 0.06, 'una ruta de un bar: el unico nivel es suave');
  });
});

describe('los efectos', () => {
  it('a intensidad minima casi no hay efectos', () => {
    const I = intensidad(1, 10);
    const e = pasar(nuevaBorrachera(fijo(0.5)), I, 30, Math.random);
    const v = visuales(e, I);
    assert.equal(v.borroso, 0);
    assert.equal(v.invertidos, false);
    assert.ok(Math.abs(v.balanceo.ang) < 0.01);
    const { mandos } = mandosBorrachos(e, I, { giro: 0.5, acelerar: true, frenar: false });
    assert.equal(mandos.giro, 0.5, 'ni tira el volante ni lo invierte');
  });

  it('a tope hay de todo: tiron, retraso, vision doble y, alguna vez, volante al reves', () => {
    const I = 1;
    let e = nuevaBorrachera(fijo(0.3));
    let vioInvertidos = false;
    let vioHipo = false;
    let azarN = 1;
    const azar = () => ((azarN = (azarN * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < 120; t += 1 / 60) {
      e = avanzarBorrachera(e, I, 1 / 60, azar);
      const v = visuales(e, I);
      vioInvertidos ||= v.invertidos;
      vioHipo ||= v.hipo;
    }
    assert.ok(vioInvertidos, 'en dos minutos sale alguna rafaga de volante al reves');
    assert.ok(vioHipo, 'y algun hipo');
    const v = visuales(e, I);
    assert.ok(Math.hypot(v.doble.x, v.doble.y) > 0 || v.doble.x !== 0, 'vision doble');
    assert.ok(v.borroso >= EFECTOS.borroso.maximo);
  });

  it('el volante tira solo hacia un lado y cambia de lado con el tiempo', () => {
    const I = 1;
    let e = nuevaBorrachera(fijo(0.9));
    const lados = new Set<number>();
    for (let t = 0; t < 30; t += 1 / 60) {
      e = avanzarBorrachera(e, I, 1 / 60, fijo(0.99));
      const { mandos } = mandosBorrachos(e, I, { giro: 0, acelerar: false, frenar: false });
      if (e.t >= e.hipo && e.t >= e.invertidos) lados.add(Math.sign(mandos.giro));
    }
    assert.ok(lados.has(1) && lados.has(-1));
  });

  it('con volante al reves, girar a la derecha lleva a la izquierda', () => {
    const e: EstadoBorrachera = { ...nuevaBorrachera(fijo(0.5)), t: 10, invertidos: 12 };
    const I = EFECTOS.invertidos.desde; // con poco tiron
    const { mandos } = mandosBorrachos(e, I, { giro: 1, acelerar: false, frenar: false });
    assert.ok(mandos.giro < 0);
  });

  it('el retraso: lo que pides llega un rato despues', () => {
    const I = 1;
    let e: EstadoBorrachera = { ...nuevaBorrachera(fijo(0.5)), tironCambia: 1e9 };
    const retraso = EFECTOS.retraso.maximo * I;
    // Medio segundo pidiendo ir recto, y de golpe frenar.
    let m = RECTO;
    for (let t = 0; t < 1; t += 1 / 60) {
      e = { ...e, t: e.t + 1 / 60 };
      ({ estado: e, mandos: m } = mandosBorrachos(e, I, RECTO));
    }
    const frenar = { giro: 0, acelerar: false, frenar: true };
    ({ estado: e, mandos: m } = mandosBorrachos(e, I, frenar));
    assert.equal(m.frenar, false, 'aun no ha llegado');
    for (let t = 0; t < retraso + 0.05; t += 1 / 60) {
      e = { ...e, t: e.t + 1 / 60 };
      ({ estado: e, mandos: m } = mandosBorrachos(e, I, frenar));
    }
    assert.equal(m.frenar, true, 'pasado el retraso, si');
    assert.ok(e.historial.length < 60, 'no guarda historial de mas');
  });
});

describe('los choques', () => {
  it('un roce no cuenta, un golpe si, y luego hay unos segundos sin que cuente otro', () => {
    let e = { choques: 0, invulnerableHasta: 0 };
    assert.equal(registrarGolpe(e, GOLPE_MINIMO - 0.1, 1).choque, false);
    ({ estado: e } = registrarGolpe(e, 10, 1));
    assert.equal(e.choques, 1);
    assert.equal(registrarGolpe(e, 10, 1 + INVULNERABLE - 0.1).choque, false);
    assert.equal(registrarGolpe(e, 10, 1 + INVULNERABLE + 0.1).choque, true);
  });

  it('no pasa de tres', () => {
    let e = { choques: 0, invulnerableHasta: 0 };
    for (let k = 0; k < 6; k++) e = registrarGolpe(e, 20, k * 10).estado;
    assert.equal(e.choques, CHOQUES_MAX);
  });
});

describe('los textos', () => {
  it('singular y plural de las cañas', () => {
    assert.equal(nombreNivel(1), '1 caña');
    assert.equal(nombreNivel(4), '4 cañas');
  });

  it('el mensaje depende del nivel y de la distancia, y nivel alto con poco es "la primera ronda"', () => {
    assert.match(mensajeFinal(8, 8, 120), /primera ronda/);
    assert.notEqual(mensajeFinal(1, 8, 120), mensajeFinal(1, 8, 2000));
    assert.notEqual(mensajeFinal(1, 8, 120), mensajeFinal(8, 8, 120));
    assert.ok(comoVas(1, 8).length > 0 && comoVas(8, 8) !== comoVas(1, 8));
  });

  it('el mensaje de seguridad es claro', () => {
    assert.match(MENSAJE_SEGURIDAD, /ni una caña/);
    assert.match(MENSAJE_SEGURIDAD, /taxi/);
  });

  it('los metros se redondean', () => {
    assert.equal(metrosTexto(12.6), '13 m');
  });
});
