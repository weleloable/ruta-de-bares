import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aLocal, aMundo, avanceLocal, Ciudad, LADO, POR_DELANTE, POR_DETRAS } from './ciudad.ts';
import { avanzarCoche, PASO, resolverChoques, type Coche } from './modelo.ts';
import { avanzarTrafico, cajaDe, situar, TRAFICO, type CocheTrafico } from './trafico.ts';

/** Azar con semilla (mulberry32): las mismas ciudades en cada ejecucion. */
function semilla(n: number) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Recorre la ciudad tramo a tramo, generando por delante como en el juego. */
function recorrer(ciudad: Ciudad, tramos: number) {
  for (let k = 0; k < tramos; k++) ciudad.asegurar(k);
}

describe('la ciudad', () => {
  it('local y mundo son inversos', () => {
    const p = { x: 3, y: -7 };
    for (const rot of [0, Math.PI / 2, -Math.PI / 2, 1]) {
      const vuelta = aLocal(aMundo(p, rot, { x: 40, y: -80 }), rot, { x: 40, y: -80 });
      assert.ok(Math.abs(vuelta.x - p.x) < 1e-9 && Math.abs(vuelta.y - p.y) < 1e-9);
    }
  });

  it('nunca pone dos tramos en la misma casilla, y cada uno sigue al anterior', () => {
    for (let n = 1; n <= 30; n++) {
      const ciudad = new Ciudad(semilla(n));
      const vistas = new Set<string>();
      let anterior: { i: number; j: number } | null = null;
      for (let k = 0; k < 300; k++) {
        ciudad.asegurar(k);
        const t = ciudad.tramos.find((x) => x.indice === k);
        assert.ok(t, `falta el tramo ${k}`);
        const c = `${t.celda.i},${t.celda.j}`;
        assert.ok(!vistas.has(c), `semilla ${n}: casilla ${c} repetida`);
        vistas.add(c);
        if (anterior) assert.equal(Math.abs(t.celda.i - anterior.i) + Math.abs(t.celda.j - anterior.j), 1);
        anterior = t.celda;
      }
    }
  });

  it('el camino es continuo: la salida de un tramo es la entrada del siguiente', () => {
    const ciudad = new Ciudad(semilla(7));
    recorrer(ciudad, 60);
    const t = ciudad.tramos;
    for (let k = 1; k < t.length; k++) {
      const a = t[k - 1].camino.at(-1)!;
      const b = t[k].camino[0];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, `corte entre ${t[k - 1].indice} y ${t[k].indice}`);
      assert.ok(Math.abs(t[k].sInicio - (t[k - 1].sInicio + t[k - 1].longitud)) < 1e-6);
    }
  });

  it('solo guarda una ventana alrededor del coche', () => {
    const ciudad = new Ciudad(semilla(3));
    recorrer(ciudad, 50);
    const indices = ciudad.tramos.map((t) => t.indice);
    assert.equal(Math.min(...indices), 49 - POR_DETRAS);
    assert.equal(Math.max(...indices), 49 + POR_DELANTE);
  });

  it('el avance dentro de un tramo va de 0 en la entrada a 1 en la salida, tambien en las curvas', () => {
    assert.equal(avanceLocal('recta', 'recto', { x: 0, y: LADO / 2 }), 0);
    assert.equal(avanceLocal('recta', 'recto', { x: 0, y: -LADO / 2 }), 1);
    assert.ok(Math.abs(avanceLocal('curva', 'derecha', { x: LADO / 2, y: 0 }) - 1) < 1e-9);
    assert.ok(Math.abs(avanceLocal('curva', 'izquierda', { x: -LADO / 2, y: 0 }) - 1) < 1e-9);
    assert.equal(avanceLocal('curva', 'derecha', { x: 0, y: LADO / 2 }), 0);
  });

  it('siguiendo el camino por su carril no se choca con nada, en cientos de tramos', () => {
    for (let n = 1; n <= 12; n++) {
      const ciudad = new Ciudad(semilla(100 + n));
      // Desde 5 m: antes, la cola del coche tocaria la valla trasera (detras de la salida).
      for (let s = 5; s < 4000; s += 1.5) {
        if (s > ciudad.longitudCamino - 2) break;
        const { x, y, ang } = situar({ s, carril: 1 } as CocheTrafico, ciudad);
        const coche: Coche = { x, y, ang, vx: 0, vy: 0 };
        const tramo = ciudad.tramoEn(coche);
        if (tramo) ciudad.asegurar(tramo.indice);
        const r = resolverChoques(coche, ciudad.obstaculos());
        const movido = Math.hypot(r.coche.x - x, r.coche.y - y);
        assert.ok(movido < 1e-6, `semilla ${100 + n}: a ${s.toFixed(1)} m (${tramo?.tipo}) choca y se mueve ${movido.toFixed(2)} m`);
      }
    }
  });

  it('lo recorrido crece al avanzar y no al ir hacia atras', () => {
    const ciudad = new Ciudad(semilla(9));
    const a = ciudad.recorrido({ x: 2, y: 10 })!;
    const b = ciudad.recorrido({ x: 2, y: -10 })!;
    assert.ok(b > a);
    assert.ok(Math.abs(b - a - 20) < 1e-6);
  });

  it('marcha atras desde la salida hay una valla: no se puede escapar de la ciudad', () => {
    const ciudad = new Ciudad(semilla(5));
    let c: Coche = { ...ciudad.salida(), vx: 0, vy: 0 };
    for (let t = 0; t < 6; t += PASO) {
      c = resolverChoques(avanzarCoche(c, { giro: 0, acelerar: false, frenar: true }, PASO), ciudad.obstaculos()).coche;
    }
    assert.ok(c.y < LADO / 2, `se ha quedado dentro: y=${c.y.toFixed(2)}`);
  });
});

describe('el trafico', () => {
  const colores = ['#123456'];
  let id = 0;
  const nuevoId = () => ++id;

  it('aparece por delante, cada uno en su carril y sin pisarse', () => {
    const ciudad = new Ciudad(semilla(11));
    let coches: CocheTrafico[] = [];
    const azar = semilla(11);
    let alguno = false;
    for (let k = 0; k < 2000; k++) {
      coches = avanzarTrafico(coches, ciudad, { x: 0, y: 1000 }, 0, 1 / 60, azar, colores, nuevoId);
      alguno ||= coches.length > 0;
    }
    assert.ok(alguno);
    for (const carril of [1, -1]) {
      // Los que tiene por delante (los de detras se van quitando solos).
      const s = coches.filter((c) => c.carril === carril && c.s > 0).map((c) => c.s).sort((a, b) => a - b);
      assert.ok(s.length <= TRAFICO.maximo);
      for (let i = 1; i < s.length; i++) assert.ok(s[i] - s[i - 1] >= TRAFICO.hueco - 1e-6, 'demasiado juntos');
    }
  });

  it('los de tu sentido avanzan contigo y los de frente vienen hacia ti', () => {
    const ciudad = new Ciudad(semilla(12));
    const lejos = { x: 999, y: 999 };
    const mismo: CocheTrafico = { id: 1, s: 30, carril: 1, vel: TRAFICO.velMismoSentido, color: '#fff', golpeado: false, frenando: false };
    const frente: CocheTrafico = { ...mismo, id: 2, s: 60, carril: -1, vel: -TRAFICO.velDeFrente };
    const [a, b] = avanzarTrafico([mismo, frente], ciudad, lejos, 0, 1, () => 0.99, colores, nuevoId);
    assert.ok(a.s > 30 && b.s < 60);
    // Carriles a lados distintos de la raya.
    const pa = situar(a, ciudad);
    const pb = situar(b, ciudad);
    assert.ok(pa.x > 0 && pb.x < 0, `derecha ${pa.x}, izquierda ${pb.x}`);
  });

  it('frena si te tiene delante, y si le has dado se queda quieto', () => {
    const ciudad = new Ciudad(semilla(13));
    const c: CocheTrafico = { id: 1, s: 20, carril: 1, vel: TRAFICO.velMismoSentido, color: '#fff', golpeado: false, frenando: false };
    const pos = situar(c, ciudad);
    const delante = { x: pos.x, y: pos.y - 5 };
    const [frenado] = avanzarTrafico([c], ciudad, delante, 0, 0.5, () => 0.99, colores, nuevoId);
    assert.equal(frenado.s, 20);
    assert.ok(frenado.frenando);
    const [quieto] = avanzarTrafico([{ ...c, golpeado: true }], ciudad, { x: 999, y: 999 }, 0, 0.5, () => 0.99, colores, nuevoId);
    assert.equal(quieto.s, 20);
  });

  it('su caja es la de un coche, mirando hacia donde va', () => {
    const ciudad = new Ciudad(semilla(14));
    const c: CocheTrafico = { id: 1, s: 10, carril: -1, vel: -9, color: '#fff', golpeado: false, frenando: false };
    const k = cajaDe(c, ciudad);
    assert.ok(Math.abs(Math.abs(k.ang) - Math.PI) < 1e-9, 'el de frente mira hacia abajo');
  });
});
