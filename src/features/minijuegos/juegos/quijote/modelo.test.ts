import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aplicarAccion,
  asegurarCamino,
  avanzar,
  CONFIG,
  crearEstado,
  elegirPatron,
  estaAgachado,
  filaPasable,
  metros,
  PATRONES,
  velocidadEn,
  xDeCarril,
  type Estado,
  type Obstaculo,
} from './modelo.ts';

/** Azar repetible. */
function semilla(n: number) {
  let s = n;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
const nada = () => 0.5;

/** Estado sin camino generado, con un solo obstaculo a `delante` metros. */
function conObstaculo(o: Omit<Obstaculo, 'id' | 'golpeado'>): Estado {
  const e = crearEstado();
  e.generadoHasta = Number.POSITIVE_INFINITY;
  e.obstaculos = [{ ...o, id: 1, golpeado: false }];
  return e;
}

/** Avanza `segundos` en pasos de `dt`. */
function correr(e: Estado, segundos: number, dt = 1 / 60, azar = nada) {
  for (let t = 0; t < segundos; t += dt) avanzar(e, dt, azar);
  return e;
}

describe('quijote: moverse', () => {
  it('cambia de carril sin salirse del camino, deslizandose hacia el carril', () => {
    const e = crearEstado();
    aplicarAccion(e, 'izquierda');
    assert.equal(e.carril, 0);
    aplicarAccion(e, 'izquierda');
    assert.equal(e.carril, 0, 'no hay carril mas a la izquierda');
    assert.deepEqual(e.eventos, ['carril', 'tope']);
    avanzar(e, 0.05, nada);
    assert.ok(e.x < 0 && e.x > xDeCarril(0), 'a medio camino');
    correr(e, 0.3);
    assert.equal(e.x, xDeCarril(0));
  });

  it('salta y vuelve al suelo; un salto pedido en el aire salta al aterrizar', () => {
    const e = crearEstado();
    e.generadoHasta = Number.POSITIVE_INFINITY;
    aplicarAccion(e, 'arriba');
    correr(e, CONFIG.salto.duracion / 2);
    assert.ok(Math.abs(e.y - CONFIG.salto.altura) < 0.1, `altura maxima ~${CONFIG.salto.altura}, es ${e.y}`);
    correr(e, CONFIG.salto.duracion / 2 - 0.1);
    aplicarAccion(e, 'arriba');
    correr(e, 0.2);
    assert.ok(e.y > 0, 'el salto guardado se hace al tocar suelo');
  });

  it('agacharse dura un rato; en el aire, baja de golpe y se agacha al llegar', () => {
    const e = crearEstado();
    e.generadoHasta = Number.POSITIVE_INFINITY;
    aplicarAccion(e, 'abajo');
    assert.ok(estaAgachado(e));
    correr(e, CONFIG.agachado + 0.05);
    assert.ok(!estaAgachado(e));
    aplicarAccion(e, 'arriba');
    correr(e, 0.15);
    aplicarAccion(e, 'abajo');
    correr(e, 0.2);
    assert.equal(e.y, 0, 'ya en el suelo, mucho antes de lo que dura un salto');
    assert.ok(estaAgachado(e));
  });

  it('la velocidad sube con los metros sin pasar la maxima', () => {
    assert.equal(velocidadEn(0), CONFIG.velocidadInicial);
    assert.ok(velocidadEn(1000) > velocidadEn(500));
    assert.ok(velocidadEn(1e7) <= CONFIG.velocidadMaxima);
  });

  it('va igual a 30 que a 144 fotogramas por segundo', () => {
    const a = correr(crearEstado(), 10, 1 / 30);
    const b = correr(crearEstado(), 10, 1 / 144);
    // Sin chocar (azar fijo puede generar choques distintos): solo la distancia.
    assert.ok(Math.abs(a.dist - b.dist) < 1.5, `${a.dist} vs ${b.dist}`);
  });
});

describe('quijote: obstaculos', () => {
  const a = (dist: number) => dist + 3;

  it('lo bajo se salta; si no, choca', () => {
    // Saltando con tiempo (a 6 m, a la velocidad de salida): pegado a la valla ya no da.
    const salta = conObstaculo({ s: 6, carril: 1, tipo: 'bajo' });
    aplicarAccion(salta, 'arriba');
    correr(salta, 0.6);
    assert.equal(salta.vidas, CONFIG.vidas);
    const choca = conObstaculo({ s: a(0), carril: 1, tipo: 'bajo' });
    correr(choca, 0.6);
    assert.equal(choca.vidas, CONFIG.vidas - 1);
  });

  it('lo alto se pasa agachado; saltando, choca', () => {
    const agacha = conObstaculo({ s: a(0), carril: 1, tipo: 'alto' });
    aplicarAccion(agacha, 'abajo');
    correr(agacha, 0.5);
    assert.equal(agacha.vidas, CONFIG.vidas);
    const salta = conObstaculo({ s: a(0), carril: 1, tipo: 'alto' });
    aplicarAccion(salta, 'arriba');
    correr(salta, 0.5);
    assert.equal(salta.vidas, CONFIG.vidas - 1);
  });

  it('una carreta solo se pasa cambiando de carril', () => {
    const cambia = conObstaculo({ s: a(0) + 5, carril: 1, tipo: 'bloque' });
    aplicarAccion(cambia, 'derecha');
    correr(cambia, 1);
    assert.equal(cambia.vidas, CONFIG.vidas);
    const salta = conObstaculo({ s: a(0), carril: 1, tipo: 'bloque' });
    aplicarAccion(salta, 'arriba');
    correr(salta, 1);
    assert.equal(salta.vidas, CONFIG.vidas - 1);
  });

  it('tras un choque parpadea 2 s sin perder mas vidas; con 3 choques se acaba', () => {
    const e = crearEstado();
    e.generadoHasta = Number.POSITIVE_INFINITY;
    e.obstaculos = [0, 1, 2, 3].map((k) => ({ id: k, s: 3 + k * 5, carril: 1 as const, tipo: 'bloque' as const, golpeado: false }));
    correr(e, 1.5);
    assert.equal(e.vidas, CONFIG.vidas - 1, 'los siguientes, en plena invulnerabilidad, no cuentan');
    for (let k = 0; k < 3; k++) {
      e.obstaculos.push({ id: 10 + k, s: e.dist + 3, carril: 1, tipo: 'bloque', golpeado: false });
      correr(e, CONFIG.invulnerable + 0.1);
    }
    assert.equal(e.vidas, 0);
    assert.ok(e.terminado);
    const quieto = metros(e);
    correr(e, 1);
    assert.equal(metros(e), quieto, 'terminado, ya no avanza');
  });
});

describe('quijote: patrones y camino', () => {
  it('cada fila de cada patron deja pasar, y entre filas da tiempo a reaccionar', () => {
    for (const p of PATRONES) {
      for (const f of p.filas) assert.ok(filaPasable(f), `${p.nombre}: una fila sin salida`);
      for (let k = 1; k < p.filas.length; k++) {
        assert.ok(p.filas[k]!.en - p.filas[k - 1]!.en >= 0.55, `${p.nombre}: filas demasiado juntas`);
      }
    }
  });

  it('al principio solo salen los sencillos', () => {
    const azar = semilla(3);
    for (let k = 0; k < 200; k++) assert.equal(elegirPatron(0, azar).filas.length, 1);
    assert.ok(new Set(Array.from({ length: 400 }, () => elegirPatron(5000, azar).nombre)).size === PATRONES.length);
  });

  it('en 6 km de camino generado no hay ningun punto sin salida, y la salida esta libre', () => {
    const e = crearEstado();
    const azar = semilla(7);
    const todos: Obstaculo[] = [];
    for (let d = 0; d < 6000; d += 20) {
      e.dist = d;
      asegurarCamino(e, azar);
      for (const o of e.obstaculos) if (!todos.some((x) => x.id === o.id)) todos.push(o);
    }
    assert.ok(todos.every((o) => o.s >= CONFIG.salidaLibre));
    // Agrupa por posicion: en cada punto, algun carril sin carreta.
    const porS = new Map<number, Set<number>>();
    for (const o of todos) {
      if (o.tipo !== 'bloque') continue;
      const clave = Math.round(o.s);
      porS.set(clave, (porS.get(clave) ?? new Set()).add(o.carril));
    }
    for (const [s, carriles] of porS) assert.ok(carriles.size < 3, `todo tapado en ${s} m`);
  });

  it('solo se recuerda lo cercano', () => {
    const e = crearEstado();
    e.dist = 3000;
    asegurarCamino(e, semilla(1));
    assert.ok(e.obstaculos.every((o) => o.s > e.dist - CONFIG.vista.detras));
    assert.ok(e.generadoHasta >= e.dist + CONFIG.vista.delante);
  });
});
