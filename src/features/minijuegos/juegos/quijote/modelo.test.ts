import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aplicarAccion,
  aspaEn,
  asegurarCamino,
  avanzar,
  carrilesBarridos,
  CONFIG,
  embestidaLista,
  crearEstado,
  elegirPatron,
  estaAgachado,
  filaPasable,
  metros,
  PATRONES,
  puntuacion,
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
function conObstaculo(o: Omit<Obstaculo, 'id' | 'golpeado' | 'variante'>): Estado {
  const e = crearEstado();
  e.generadoHasta = Number.POSITIVE_INFINITY;
  e.obstaculos = [{ ...o, id: 1, golpeado: false, variante: 0 }];
  return e;
}

/** Un molino a la izquierda que barre `alcance` carriles. */
function molino(s: number, alcance: 1 | 2, fase = 0): Obstaculo {
  return { id: 99, s, carril: 0, tipo: 'molino', golpeado: false, variante: 0, molino: { lado: -1, alcance, fase } };
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
    e.obstaculos = [0, 1, 2, 3].map((k) => ({ id: k, s: 3 + k * 5, carril: 1 as const, tipo: 'bloque' as const, golpeado: false, variante: 0 }));
    correr(e, 1.5);
    assert.equal(e.vidas, CONFIG.vidas - 1, 'los siguientes, en plena invulnerabilidad, no cuentan');
    for (let k = 0; k < 3; k++) {
      e.obstaculos.push({ id: 10 + k, s: e.dist + 3, carril: 1, tipo: 'bloque', golpeado: false, variante: 0 });
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
    // Agrupa por posicion: en cada punto, algun carril sin carreta ni aspas de molino.
    const porS = new Map<number, Set<number>>();
    for (const o of todos) {
      if (o.tipo !== 'bloque' && o.tipo !== 'molino') continue;
      const clave = Math.round(o.s);
      const ya = porS.get(clave) ?? new Set<number>();
      (o.tipo === 'molino' ? carrilesBarridos(o) : [o.carril]).forEach((c) => ya.add(c));
      porS.set(clave, ya);
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

describe('quijote: jarras, yelmo y queso', () => {
  it('una jarra da 10 puntos y carga la Embestida; diez la llenan', () => {
    const e = crearEstado();
    e.generadoHasta = Number.POSITIVE_INFINITY;
    e.recogibles = Array.from({ length: 10 }, (_, k) => ({ id: k, s: 5 + k * 3, carril: 1 as const, altura: 1, tipo: 'jarra' as const }));
    correr(e, 3);
    assert.equal(e.jarras, 10);
    assert.equal(e.carga, CONFIG.jarrasEmbestida);
    assert.ok(embestidaLista(e));
    assert.equal(puntuacion(e), Math.floor(e.dist) + 100);
  });

  it('en otro carril no se coge; todas las jarras generadas se pueden alcanzar', () => {
    const e = crearEstado();
    e.generadoHasta = Number.POSITIVE_INFINITY;
    e.recogibles = [{ id: 1, s: 5, carril: 0, altura: 1, tipo: 'jarra' }];
    correr(e, 1);
    assert.equal(e.jarras, 0);
    const camino = crearEstado();
    const azar = semilla(4);
    for (let d = 0; d < 3000; d += 50) {
      camino.dist = d;
      asegurarCamino(camino, azar);
      assert.ok(camino.recogibles.every((r) => r.altura >= 1 && r.altura <= 1 + CONFIG.salto.altura));
    }
  });

  it('el yelmo para un golpe (y se pierde); el queso devuelve una vida, hasta tres', () => {
    const e = conObstaculo({ s: 8, carril: 1, tipo: 'bloque' });
    e.recogibles = [{ id: 2, s: 3, carril: 1, altura: 1, tipo: 'yelmo' }];
    correr(e, 1);
    assert.equal(e.vidas, CONFIG.vidas, 'el golpe se lo lleva el yelmo');
    assert.equal(e.escudo, false);
    const q = crearEstado();
    q.generadoHasta = Number.POSITIVE_INFINITY;
    q.vidas = 2;
    q.recogibles = [3, 6].map((s, k) => ({ id: k, s, carril: 1 as const, altura: 1, tipo: 'queso' as const }));
    correr(q, 1);
    assert.equal(q.vidas, CONFIG.vidas);
  });
});

describe('quijote: embestida', () => {
  it('con la barra llena: 3 s mas rapido, derriba lo que tiene delante y no choca', () => {
    const e = conObstaculo({ s: 10, carril: 1, tipo: 'bloque' });
    aplicarAccion(e, 'embestida');
    assert.equal(e.eventos.includes('embestida'), false, 'sin barra llena no hay embestida');
    e.carga = CONFIG.jarrasEmbestida;
    aplicarAccion(e, 'embestida');
    assert.ok(e.eventos.includes('embestida'));
    assert.equal(e.carga, 0);
    const carreta = e.obstaculos[0]!;
    correr(e, 1);
    assert.equal(e.vidas, CONFIG.vidas);
    assert.ok(carreta.derribadoEn !== undefined);
    assert.equal(e.bonus, CONFIG.embestida.puntosObstaculo);
    assert.ok(e.velocidad > velocidadEn(e.dist) * 1.2);
    correr(e, CONFIG.embestida.duracion);
    assert.ok(Math.abs(e.velocidad - velocidadEn(e.dist)) < 0.5, 'al acabar, a su velocidad');
  });

  it('un molino derribado es un gigante: cuenta y da su bonus', () => {
    const e = crearEstado();
    e.generadoHasta = Number.POSITIVE_INFINITY;
    e.obstaculos = [molino(15, 2)];
    e.carga = CONFIG.jarrasEmbestida;
    aplicarAccion(e, 'embestida');
    correr(e, 1.5);
    assert.equal(e.molinos, 1);
    assert.equal(e.bonus, CONFIG.embestida.puntosMolino);
  });
});

describe('quijote: molinos', () => {
  it('las aspas barren uno o dos carriles desde el borde, nunca los tres', () => {
    assert.deepEqual(carrilesBarridos(molino(0, 1)), [0]);
    assert.deepEqual(carrilesBarridos(molino(0, 2)), [0, 1]);
  });

  it('en su carril, el aspa pasa a ratos: hay momentos de peligro y huecos para pasar', () => {
    const m = molino(0, 1);
    let peligro = 0;
    for (let k = 0; k < 400; k++) if (aspaEn(m, k / 100, xDeCarril(0))) peligro++;
    assert.ok(peligro > 20 && peligro < 300, `${peligro} de 400 instantes`);
    for (let k = 0; k < 400; k++) assert.equal(aspaEn(m, k / 100, xDeCarril(2)), false, 'el carril de la derecha, libre');
  });

  it('en el carril barrido choca si pasa con el aspa encima; en otro carril, nunca', () => {
    let chocados = 0;
    for (let k = 0; k < 20; k++) {
      const fase = (k / 20) * Math.PI;
      const e = crearEstado();
      e.generadoHasta = Number.POSITIVE_INFINITY;
      e.carril = 0;
      e.x = xDeCarril(0);
      e.obstaculos = [molino(10, 1, fase)];
      correr(e, 1);
      if (e.vidas < CONFIG.vidas) chocados++;
      const libre = crearEstado();
      libre.generadoHasta = Number.POSITIVE_INFINITY;
      libre.obstaculos = [molino(10, 1, fase)];
      correr(libre, 1);
      assert.equal(libre.vidas, CONFIG.vidas);
    }
    assert.ok(chocados > 0 && chocados < 20, `choca en ${chocados} de 20 fases`);
  });
});
