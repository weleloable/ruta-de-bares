import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Ciudad } from './ciudad.ts';
import {
  adelante,
  avanzarCoche,
  bolaDelJoystick,
  circuloContraCaja,
  difAngulo,
  ENTRADA_NULA,
  FISICA,
  giroDelJoystick,
  PASO,
  resolverChoques,
  seguirCoche,
  velocidadAdelante,
  velocidadLateral,
  ZONA_MUERTA,
  type Caja,
  type Coche,
  type Entrada,
} from './modelo.ts';

const PARADO: Coche = { x: 0, y: 0, ang: 0, vx: 0, vy: 0 };
const cerca = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

/** Simula `segundos` con la misma entrada, a paso fijo. */
function simular(c: Coche, e: Entrada, segundos: number, cajas: readonly Caja[] = []): Coche {
  for (let t = 0; t < segundos; t += PASO) c = resolverChoques(avanzarCoche(c, e, PASO), cajas).coche;
  return c;
}

describe('el coche', () => {
  it('acelerando va hacia delante (arriba en el mapa) y no pasa de la maxima', () => {
    const c = simular(PARADO, { giro: 0, acelerar: true, frenar: false }, 10);
    assert.ok(c.y < -50, `ha avanzado ${-c.y} m`);
    assert.ok(cerca(c.x, 0));
    assert.ok(velocidadAdelante(c) <= FISICA.velMax + 1e-9);
    assert.ok(velocidadAdelante(c) > FISICA.velMax * 0.8, 'llega cerca de la maxima');
  });

  it('frena y, ya parado, da marcha atras sin pasar de la suya', () => {
    let c = simular(PARADO, { giro: 0, acelerar: true, frenar: false }, 3);
    c = simular(c, { giro: 0, acelerar: false, frenar: true }, 1.5);
    assert.ok(velocidadAdelante(c) <= 0.5, 'frenado');
    c = simular(c, { giro: 0, acelerar: false, frenar: true }, 5);
    assert.ok(velocidadAdelante(c) < 0, 'marcha atras');
    assert.ok(velocidadAdelante(c) >= -FISICA.velMaxAtras - 1e-9);
  });

  it('sin pedales se para solo', () => {
    let c = simular(PARADO, { giro: 0, acelerar: true, frenar: false }, 2);
    c = simular(c, ENTRADA_NULA, 15);
    assert.ok(Math.abs(velocidadAdelante(c)) < 0.01);
  });

  it('parado no gira; en marcha gira hacia el lado del volante; marcha atras, al reves', () => {
    assert.equal(simular(PARADO, { giro: 1, acelerar: false, frenar: false }, 1).ang, 0);
    const adelanteDerecha = simular(PARADO, { giro: 1, acelerar: true, frenar: false }, 2);
    assert.ok(adelanteDerecha.ang > 0.3, 'gira a la derecha');
    assert.ok(adelanteDerecha.x > 0, 'y se va a la derecha');
    const atrasDerecha = simular(PARADO, { giro: 1, acelerar: false, frenar: true }, 2);
    assert.ok(atrasDerecha.ang < 0, 'marcha atras con el volante a la derecha: el morro se va a la izquierda');
  });

  it('en una curva rapida derrapa un poco y el agarre lo endereza', () => {
    let c = simular(PARADO, { giro: 0, acelerar: true, frenar: false }, 4);
    c = simular(c, { giro: 1, acelerar: true, frenar: false }, 0.4);
    assert.ok(Math.abs(velocidadLateral(c)) > 0.3, `derrape ${velocidadLateral(c)}`);
    c = simular(c, { giro: 0, acelerar: true, frenar: false }, 2);
    assert.ok(Math.abs(velocidadLateral(c)) < 0.05, 'recto, deja de derrapar');
  });

  it('es determinista: la misma entrada da el mismo recorrido', () => {
    const e = { giro: 0.4, acelerar: true, frenar: false };
    assert.deepEqual(simular(PARADO, e, 2), simular(PARADO, e, 2));
  });
});

describe('los choques', () => {
  const pared: Caja = { x: 0, y: -20, w: 30, h: 2, ang: 0 };

  it('una pared delante para el coche, lo deja fuera y dice lo fuerte que fue', () => {
    let c: Coche = { x: 0, y: -10, ang: 0, vx: 0, vy: -15 };
    let golpe = 0;
    for (let t = 0; t < 1; t += PASO) {
      const r = resolverChoques(avanzarCoche(c, ENTRADA_NULA, PASO), [pared]);
      c = r.coche;
      golpe = Math.max(golpe, r.impacto);
    }
    assert.ok(golpe > 10, `golpe de ${golpe} m/s`);
    assert.ok(c.y > -20 + 1 + 0.5, 'no ha atravesado la pared');
    assert.ok(velocidadAdelante(c) < 1, 'y no sigue empujando hacia ella');
  });

  it('rozar una pared de lado casi no frena, y el golpe es pequeno', () => {
    const lateral: Caja = { x: 2.5, y: -50, w: 2, h: 200, ang: 0 };
    const c: Coche = { x: 1.2, y: 0, ang: 0.05, vx: 0.75, vy: -15 };
    const r = resolverChoques(avanzarCoche(c, ENTRADA_NULA, PASO), [lateral]);
    assert.ok(r.impacto < 2);
    assert.ok(-r.coche.vy > 12);
  });

  it('las cajas giradas tambien chocan, por su forma girada', () => {
    const rombo: Caja = { x: 0, y: 0, w: 4, h: 4, ang: Math.PI / 4 };
    // Su esquina llega a ~2,83 m del centro en los ejes; a 2,5 m (dentro de la esquina) choca.
    assert.ok(circuloContraCaja({ x: 0, y: -3.2 }, 0.5, rombo));
    // En diagonal, la cara esta a 2 m: a 2,4 m del centro (+0,5 de radio) toca, a 2,6 no.
    const diag = (d: number) => ({ x: d * Math.SQRT1_2, y: d * Math.SQRT1_2 });
    assert.ok(circuloContraCaja(diag(2.4), 0.5, rombo));
    assert.equal(circuloContraCaja(diag(2.6), 0.5, rombo), null);
  });

  it('si el coche aparece dentro de una caja, lo saca por el lado mas cercano', () => {
    const caja: Caja = { x: 0, y: 0, w: 10, h: 10, ang: 0 };
    const r = resolverChoques({ x: 4, y: 0, ang: 0, vx: 0, vy: 0 }, [caja]);
    assert.ok(r.coche.x > 5, `sale por la derecha: x=${r.coche.x}`);
  });

  it('desde la salida se puede ir recto un buen rato sin chocar', () => {
    const ciudad = new Ciudad(() => 0.5);
    let c: Coche = { ...ciudad.salida(), vx: 0, vy: 0 };
    let golpe = 0;
    for (let t = 0; t < 4; t += PASO) {
      const r = resolverChoques(avanzarCoche(c, { giro: 0, acelerar: true, frenar: false }, PASO), ciudad.obstaculos());
      c = r.coche;
      golpe = Math.max(golpe, r.impacto);
    }
    assert.equal(golpe, 0);
    assert.ok(c.y < -20);
  });
});

describe('la camara', () => {
  it('se acerca al coche y a su rumbo poco a poco, por el camino corto', () => {
    const coche: Coche = { x: 10, y: -10, ang: 3, vx: 0, vy: 0 };
    let cam = { x: 0, y: 0, ang: -3 };
    cam = seguirCoche(cam, coche, 1 / 60);
    assert.ok(cam.x > 0 && cam.x < 10, 'se mueve, sin saltar');
    // De -3 a 3 rad el camino corto es girar "hacia atras" pasando por PI.
    assert.ok(cam.ang < -3, `gira por el camino corto: ${cam.ang}`);
    for (let i = 0; i < 600; i++) cam = seguirCoche(cam, coche, 1 / 60);
    assert.ok(cerca(cam.x, 10, 1e-3) && cerca(cam.y, -10, 1e-3));
    assert.ok(cerca(difAngulo(cam.ang, coche.ang), 0, 1e-3));
  });

  it('a toda velocidad se adelanta para ver lo que viene', () => {
    const f = adelante(0);
    const rapido: Coche = { x: 0, y: 0, ang: 0, vx: f.x * FISICA.velMax, vy: f.y * FISICA.velMax };
    let cam = { x: 0, y: 0, ang: 0 };
    for (let i = 0; i < 600; i++) cam = seguirCoche(cam, rapido, 1 / 60);
    assert.ok(cam.y < -5, 'la camara mira por delante del coche');
  });
});

describe('el joystick', () => {
  it('solo cuenta el eje horizontal, con zona muerta y sin salto al salir de ella', () => {
    assert.equal(giroDelJoystick(0, 60), 0);
    assert.equal(giroDelJoystick(60 * ZONA_MUERTA * 0.9, 60), 0);
    assert.ok(giroDelJoystick(60 * ZONA_MUERTA * 1.05, 60) < 0.02);
    assert.equal(giroDelJoystick(60, 60), 1);
    assert.equal(giroDelJoystick(-500, 60), -1);
  });

  it('la bola no se sale del aro', () => {
    assert.deepEqual(bolaDelJoystick(10, 0, 60), { x: 10, y: 0 });
    const b = bolaDelJoystick(300, 400, 60);
    assert.ok(cerca(Math.hypot(b.x, b.y), 60));
  });
});
