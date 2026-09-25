import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aPixelesMundo, calcularVista, proyectar, teselas, tramo, urlTesela } from './proyeccionMapa.ts';

// Paradas reales del catalogo (Alcala de Henares): las nueve de una ruta.
const RUTA = [
  { lat: 40.484937, lng: -3.360688 },
  { lat: 40.483562, lng: -3.363438 },
  { lat: 40.483312, lng: -3.363563 },
  { lat: 40.483062, lng: -3.363938 },
  { lat: 40.481562, lng: -3.364563 },
  { lat: 40.482062, lng: -3.365437 },
  { lat: 40.481812, lng: -3.366563 },
  { lat: 40.481687, lng: -3.366563 },
  { lat: 40.481687, lng: -3.367563 },
];
const ANCHO = 272;
const ALTO = 238;
const MARGEN = 27;

const extremos = (ps: { x: number; y: number }[]) => ({
  minX: Math.min(...ps.map((p) => p.x)),
  maxX: Math.max(...ps.map((p) => p.x)),
  minY: Math.min(...ps.map((p) => p.y)),
  maxY: Math.max(...ps.map((p) => p.y)),
});

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
  it('acepta un zoom decimal: a mitad de camino entre dos niveles, la distancia sube en proporcion', () => {
    const a = aPixelesMundo({ lat: 40, lng: -3 }, 16).x;
    const b = aPixelesMundo({ lat: 40, lng: -3 }, 17).x;
    assert.ok(Math.abs(aPixelesMundo({ lat: 40, lng: -3 }, 16.5).x - Math.sqrt(a * b)) < 1e-6);
  });
});

describe('calcularVista: el zoom justo', () => {
  const vista = calcularVista(RUTA, ANCHO, ALTO, MARGEN, 18);
  const ps = RUTA.map((p) => proyectar(p, vista));
  const e = extremos(ps);

  it('todas las paradas caben dentro del mapa con su margen', () => {
    assert.ok(e.minX >= MARGEN - 0.001 && e.maxX <= ANCHO - MARGEN + 0.001, `x ${e.minX}..${e.maxX}`);
    assert.ok(e.minY >= MARGEN - 0.001 && e.maxY <= ALTO - MARGEN + 0.001, `y ${e.minY}..${e.maxY}`);
  });

  it('y las mas alejadas TOCAN el margen en el eje que manda (ni un pixel de mas)', () => {
    const tocaX = Math.abs(e.minX - MARGEN) < 0.001 && Math.abs(e.maxX - (ANCHO - MARGEN)) < 0.001;
    const tocaY = Math.abs(e.minY - MARGEN) < 0.001 && Math.abs(e.maxY - (ALTO - MARGEN)) < 0.001;
    assert.ok(tocaX || tocaY, 'ninguno de los dos ejes toca el margen: sobra zoom por acercar');
  });

  it('el zoom es decimal, no un nivel entero', () => {
    assert.notEqual(vista.zoom, Math.round(vista.zoom));
  });

  it('con solo niveles enteros quedaria mas lejos: el zoom continuo es estrictamente mayor que el entero de abajo', () => {
    assert.ok(vista.zoom > Math.floor(vista.zoom));
  });

  it('el conjunto queda centrado', () => {
    assert.ok(Math.abs((e.minX + e.maxX) / 2 - ANCHO / 2) < 0.001);
    assert.ok(Math.abs((e.minY + e.maxY) / 2 - ALTO / 2) < 0.001);
  });

  it('una sola parada usa el zoom maximo y queda en el centro', () => {
    const v = calcularVista([RUTA[0]], ANCHO, ALTO, MARGEN, 16);
    assert.equal(v.zoom, 16);
    const { x, y } = proyectar(RUTA[0], v);
    assert.ok(Math.abs(x - ANCHO / 2) < 0.001 && Math.abs(y - ALTO / 2) < 0.001);
  });

  it('paradas en el mismo sitio, igual que una sola', () => {
    assert.equal(calcularVista([RUTA[0], RUTA[0]], ANCHO, ALTO, MARGEN, 16).zoom, 16);
  });

  it('sin paradas no revienta', () => {
    assert.equal(calcularVista([], ANCHO, ALTO, MARGEN).zoom, 3);
  });

  it('el zoom nunca pasa del maximo, aunque las paradas esten muy juntas', () => {
    const juntas = [RUTA[0], { lat: RUTA[0].lat + 1e-6, lng: RUTA[0].lng }];
    assert.equal(calcularVista(juntas, ANCHO, ALTO, MARGEN, 17).zoom, 17);
  });

  it('una ruta enorme (dos continentes) baja el zoom al minimo en vez de salirse', () => {
    const v = calcularVista([{ lat: 40, lng: -3 }, { lat: -34, lng: 151 }], ANCHO, ALTO, MARGEN);
    assert.equal(v.zoom, 3);
  });

  it('un margen mas grande aleja el mapa', () => {
    assert.ok(calcularVista(RUTA, ANCHO, ALTO, 50, 18).zoom < vista.zoom);
  });
});

describe('teselas', () => {
  const vista = calcularVista(RUTA, ANCHO, ALTO, MARGEN, 18);
  const lista = teselas(vista, ANCHO, ALTO);

  it('cubren todo el mapa, sin huecos', () => {
    const minIzq = Math.min(...lista.map((t) => t.izquierda));
    const maxDer = Math.max(...lista.map((t) => t.izquierda + t.lado));
    const minArr = Math.min(...lista.map((t) => t.arriba));
    const maxAbj = Math.max(...lista.map((t) => t.arriba + t.lado));
    assert.ok(minIzq <= 0 && maxDer >= ANCHO && minArr <= 0 && maxAbj >= ALTO);
  });

  it('son pocas: unas pocas peticiones a OpenStreetMap, no docenas', () => {
    assert.ok(lista.length >= 1 && lista.length <= 12, `${lista.length} teselas`);
  });

  it('piden el nivel entero mas cercano al zoom decimal', () => {
    for (const t of lista) assert.equal(t.zoom, Math.round(vista.zoom));
  });

  it('se dibujan con el lado que compensa la diferencia (entre 0,7 y 1,42 veces 256)', () => {
    for (const t of lista) assert.ok(t.lado >= 256 * 0.7 && t.lado <= 256 * 1.42, `lado ${t.lado}`);
  });

  it('las URL son de OpenStreetMap con su zoom, x e y', () => {
    for (const t of lista) {
      assert.equal(t.url, `https://tile.openstreetmap.org/${t.zoom}/${t.x}/${t.y}.png`);
    }
  });

  it('teselas contiguas encajan sin solaparse: separadas exactamente su lado', () => {
    const t = lista[0];
    const derecha = lista.find((o) => o.y === t.y && o.x === t.x + 1);
    if (derecha) assert.ok(Math.abs(derecha.izquierda - t.izquierda - t.lado) < 1e-9);
  });

  it('con un zoom entero, el lado es 256 exacto', () => {
    const v = { zoom: 16, izquierda: 1000, arriba: 1000 };
    for (const t of teselas(v, 300, 300)) assert.equal(t.lado, 256);
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
