import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ANCHO_FOTO,
  ANCHO_MINIATURA,
  CALIDAD_FOTO,
  CALIDAD_MINIATURA,
  anchoDestino,
  recorteCuadrado,
} from './imagenes.ts';

describe('recorteCuadrado', () => {
  it('de una foto apaisada coge el cuadrado del centro', () => {
    assert.deepEqual(recorteCuadrado(3088, 2316), { originX: 386, originY: 0, width: 2316, height: 2316 });
  });

  it('de una foto vertical, igual pero por arriba y por abajo', () => {
    assert.deepEqual(recorteCuadrado(3456, 4608), { originX: 0, originY: 576, width: 3456, height: 3456 });
  });

  it('una foto ya cuadrada no se recorta', () => {
    assert.deepEqual(recorteCuadrado(800, 800), { originX: 0, originY: 0, width: 800, height: 800 });
  });
});

describe('anchoDestino', () => {
  it('reduce las fotos grandes a la medida que pinta la pantalla', () => {
    assert.equal(anchoDestino(3456, ANCHO_FOTO), 1080);
    assert.equal(anchoDestino(2316, ANCHO_MINIATURA), 400);
  });

  it('nunca agranda: una foto pequena se sube tal cual', () => {
    assert.equal(anchoDestino(320, ANCHO_MINIATURA), 320);
    assert.equal(anchoDestino(900, ANCHO_FOTO), 900);
  });
});

describe('medidas elegidas', () => {
  // Si alguien las cambia, que sea a sabiendas: son las que miden ~19 KB la
  // miniatura y ~107 KB la foto con fotos reales de movil.
  it('miniatura de 400 px para la casilla de 133 pt a 3x, y ficha de 1080', () => {
    assert.equal(ANCHO_MINIATURA, 400);
    assert.equal(ANCHO_FOTO, 1080);
    assert.ok(CALIDAD_MINIATURA <= CALIDAD_FOTO && CALIDAD_MINIATURA >= 0.6);
    assert.ok(CALIDAD_FOTO <= 0.85);
  });
});
