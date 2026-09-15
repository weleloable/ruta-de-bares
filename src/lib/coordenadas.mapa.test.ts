import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estadoCampoCoordenadas, normalizarLongitud, puntoDesdeMapa } from './coordenadas.ts';

const cerca = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('normalizarLongitud', () => {
  it('deja igual lo que ya esta en rango', () => {
    for (const lng of [-180, -3.7038, 0, 2.17, 179.99, 180]) assert.equal(normalizarLongitud(lng), lng);
  });

  it('trae de vuelta las copias del mundo de Leaflet', () => {
    assert.ok(cerca(normalizarLongitud(-363.7038), -3.7038));
    assert.ok(cerca(normalizarLongitud(356.2962), -3.7038));
    assert.ok(cerca(normalizarLongitud(716.2962), -3.7038));
  });

  it('siempre devuelve un valor en [-180, 180]', () => {
    for (let lng = -1000; lng <= 1000; lng += 7.3) {
      const n = normalizarLongitud(lng);
      assert.ok(n >= -180 && n <= 180, `${lng} -> ${n}`);
    }
  });

  it('no inventa numeros con entradas no finitas', () => {
    assert.ok(Number.isNaN(normalizarLongitud(Number.NaN)));
  });
});

describe('puntoDesdeMapa', () => {
  it('un toque normal da texto valido y el mismo punto', () => {
    const { texto, punto } = puntoDesdeMapa(40.415512, -3.700487);
    assert.ok(punto);
    assert.ok(cerca(punto.lat, 40.415512) && cerca(punto.lng, -3.700487));
    assert.deepEqual(estadoCampoCoordenadas(texto).punto, punto);
  });

  it('reproduce el fallo visto: un toque en la copia del mundo ya no da un campo con error', () => {
    const { texto, punto } = puntoDesdeMapa(40.4168, -363.7038);
    assert.ok(punto, `el campo rechaza "${texto}"`);
    assert.ok(cerca(punto.lng, -3.7038));
  });

  it('campo y punto guardado coinciden siempre: si el texto no vale, el punto es null', () => {
    const casos: [number, number][] = [
      [40.4168, -3.7038],
      [-33.8688, 151.2093],
      [95, 10],
      [Number.NaN, 3],
      [40.1234567, -725.1],
    ];
    for (const [lat, lng] of casos) {
      const { texto, punto } = puntoDesdeMapa(lat, lng);
      assert.deepEqual(punto, estadoCampoCoordenadas(texto).punto, `${lat}, ${lng}`);
    }
  });
});
