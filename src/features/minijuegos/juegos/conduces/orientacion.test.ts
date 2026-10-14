import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cajaDeEscena, hayQueGirar, puntoLocal } from './orientacion.ts';

describe('hayQueGirar', () => {
  it('gira con el movil en vertical y no con el movil en horizontal ni en un cuadrado', () => {
    assert.equal(hayQueGirar(390, 844), true);
    assert.equal(hayQueGirar(844, 390), false);
    assert.equal(hayQueGirar(500, 500), false);
  });
});

describe('cajaDeEscena', () => {
  it('en horizontal no toca nada', () => {
    assert.deepEqual(cajaDeEscena({ ancho: 844, alto: 390 }), { ancho: 844, alto: 390, girada: false, transform: null });
  });
  it('en vertical intercambia los lados y la corre a la derecha para que no se salga', () => {
    assert.deepEqual(cajaDeEscena({ ancho: 390, alto: 844 }), {
      ancho: 844,
      alto: 390,
      girada: true,
      transform: 'translate(390px, 0px) rotate(90deg)',
    });
  });
});

describe('puntoLocal', () => {
  it('sin giro es la resta de siempre', () => {
    assert.deepEqual(puntoLocal(110, 70, { left: 100, top: 50, width: 300 }, false), { x: 10, y: 20 });
  });

  // Pantalla de 390 x 844 en vertical; la escena girada mide 844 x 390 y su caja de pantalla es la ventana entera.
  const caja = { left: 0, top: 0, width: 390 };
  it('girada: arriba del movil es el principio del eje x del juego', () => {
    assert.deepEqual(puntoLocal(390, 0, caja, true), { x: 0, y: 0 }); // esquina superior derecha = origen del juego
  });
  it('girada: bajar el dedo por la pantalla avanza en x; ir hacia la izquierda sube en y', () => {
    assert.deepEqual(puntoLocal(390, 100, caja, true), { x: 100, y: 0 });
    assert.deepEqual(puntoLocal(290, 0, caja, true), { x: 0, y: 100 });
  });
  it('girada: la esquina inferior izquierda de la pantalla es la esquina opuesta del juego', () => {
    assert.deepEqual(puntoLocal(0, 844, caja, true), { x: 844, y: 390 });
  });
  it('coincide con la geometria real: gira el punto y comprueba que vuelve al mismo sitio', () => {
    // Un punto (x, y) del juego, tras rotar 90 grados y correr 390 px, cae en pantalla en (390 - y, x).
    for (const [x, y] of [[0, 0], [100, 25], [844, 390], [300, 200]] as const) {
      const pantalla = { x: 390 - y, y: x };
      assert.deepEqual(puntoLocal(pantalla.x, pantalla.y, caja, true), { x, y });
    }
  });
});
