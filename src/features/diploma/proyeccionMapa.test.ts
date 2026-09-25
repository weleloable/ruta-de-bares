import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aPixelesMundo, calcularVista, proyectar, teselas, tramo, urlTesela } from './proyeccionMapa.ts';

// Paradas reales del catalogo (Alcala de Henares).
const RUTA = [
  { lat: 40.484937, lng: -3.360688 },
  { lat: 40.483562, lng: -3.363438 },
  { lat: 40.483312, lng: -3.363563 },
  { lat: 40.483062, lng: -3.363938 },
];
const ANCHO = 360;
const ALTO = 320;
const MARGEN = 36;

describe('aPixelesMundo', () => {
  it('el (0, 0) cae en el centro del mundo', () => {
    assert.deepEqual(aPixelesMundo({ lat: 0, lng: 0 }, 1), { x: 256, y: 256 });
  });
  it('el meridiano opuesto queda al borde', () => {
    assert.equal(aPixelesMundo({ lat: 0, lng: -180 }, 2).x, 0);
    assert.equal(aPixelesMundo({ lat: 0, lng: 180 }, 2).x, 1024);
  });
  it('mas al norte, menos y', () => {
    assert.ok(aPixelesMundo({ lat: 41, lng: 0 }, 5).y < aPixelesMundo({ lat: 40, lng: 0 }, 5).y);
  });
});

describe('calcularVista', () => {
  const vista = calcularVista(RUTA, ANCHO, ALTO, MARGEN);

  it('todas las paradas caben dentro del mapa con su margen', () => {
    for (const p of RUTA) {
      const { x, y } = proyectar(p, vista);
      assert.ok(x >= MARGEN - 0.001 && x <= ANCHO - MARGEN + 0.001, `x=${x}`);
      assert.ok(y >= MARGEN - 0.001 && y <= ALTO - MARGEN + 0.001, `y=${y}`);
    }
  });

  it('es el zoom mas alto que cabe: con uno mas, alguna parada se saldria', () => {
    const mas = calcularVista(RUTA, ANCHO, ALTO, MARGEN, vista.zoom + 1, vista.zoom + 1);
    // Forzar zoom+1 no cabe: cae a minZoom = zoom+1 sin comprobar, asi que se mira a mano.
    const px = RUTA.map((p) => aPixelesMundo(p, mas.zoom));
    const ancho = Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x));
    const alto = Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y));
    assert.ok(ancho > ANCHO - 2 * MARGEN || alto > ALTO - 2 * MARGEN);
  });

  it('el conjunto queda centrado', () => {
    const ps = RUTA.map((p) => proyectar(p, vista));
    const cx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
    const cy = (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2;
    assert.ok(Math.abs(cx - ANCHO / 2) < 0.001);
    assert.ok(Math.abs(cy - ALTO / 2) < 0.001);
  });

  it('una sola parada usa el zoom maximo y queda en el centro', () => {
    const v = calcularVista([RUTA[0]], ANCHO, ALTO, MARGEN, 16);
    assert.equal(v.zoom, 16);
    const { x, y } = proyectar(RUTA[0], v);
    assert.ok(Math.abs(x - ANCHO / 2) < 0.001 && Math.abs(y - ALTO / 2) < 0.001);
  });

  it('sin paradas no revienta', () => {
    assert.equal(calcularVista([], ANCHO, ALTO, MARGEN).zoom, 3);
  });

  it('una ruta enorme (dos continentes) baja el zoom en vez de salirse', () => {
    const v = calcularVista([{ lat: 40, lng: -3 }, { lat: -34, lng: 151 }], ANCHO, ALTO, MARGEN);
    assert.ok(v.zoom <= 3);
  });
});

describe('teselas', () => {
  const vista = calcularVista(RUTA, ANCHO, ALTO, MARGEN);
  const lista = teselas(vista, ANCHO, ALTO);

  it('cubren todo el mapa, sin huecos', () => {
    const minIzq = Math.min(...lista.map((t) => t.izquierda));
    const maxDer = Math.max(...lista.map((t) => t.izquierda + 256));
    const minArr = Math.min(...lista.map((t) => t.arriba));
    const maxAbj = Math.max(...lista.map((t) => t.arriba + 256));
    assert.ok(minIzq <= 0 && maxDer >= ANCHO && minArr <= 0 && maxAbj >= ALTO);
  });

  it('son pocas: unas pocas peticiones a OpenStreetMap, no docenas', () => {
    assert.ok(lista.length >= 1 && lista.length <= 9, `${lista.length} teselas`);
  });

  it('las URL son de OpenStreetMap con su zoom, x e y', () => {
    for (const t of lista) {
      assert.equal(t.url, `https://tile.openstreetmap.org/${t.zoom}/${t.x}/${t.y}.png`);
    }
  });

  it('teselas contiguas encajan sin solaparse', () => {
    const t = lista[0];
    const derecha = lista.find((o) => o.y === t.y && o.x === t.x + 1);
    if (derecha) assert.equal(derecha.izquierda - t.izquierda, 256);
  });
});

describe('urlTesela', () => {
  it('envuelve la x al otro lado del mundo', () => {
    assert.equal(urlTesela(2, -1, 1), 'https://tile.openstreetmap.org/2/3/1.png');
    assert.equal(urlTesela(2, 4, 1), 'https://tile.openstreetmap.org/2/0/1.png');
  });
});

describe('tramo', () => {
  it('mide y orienta el segmento entre dos paradas', () => {
    const t = tramo({ x: 0, y: 0 }, { x: 30, y: 40 });
    assert.equal(t.largo, 50);
    assert.ok(Math.abs(t.grados - 53.1301) < 0.001);
  });
  it('hacia la izquierda, 180 grados', () => {
    assert.equal(tramo({ x: 10, y: 0 }, { x: 0, y: 0 }).grados, 180);
  });
});
