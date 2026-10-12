import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { alcancePx, ALTO_MINIMO, BARRA_M, colocar, crearEscala, desdePantallaGirada, hayQueGirar } from './escena.ts';
import { CAMPO, DIANAS } from './modelo.ts';
import { SPRITES } from './spritesGeometria.ts';

describe('escala de Tapon al Vuelo', () => {
  it('sin medidas no hay escala (primer render, pestana oculta)', () => {
    assert.equal(crearEscala(0, 400, CAMPO), null);
    assert.equal(crearEscala(360, 0, CAMPO), null);
  });

  it('en horizontal el campo entero cabe y la barra queda abajo', () => {
    // Movil en horizontal: 740x390, 808x400, 915x412 menos la cabecera del juego.
    for (const [w, h] of [[740, 330], [808, 340], [915, 352], [1280, 600]]) {
      const esc = crearEscala(w, h, CAMPO)!;
      assert.ok(esc.px(CAMPO.xMin) >= -1e-9 && esc.px(CAMPO.xMax) <= w + 1e-9, `${w}x${h}`);
      assert.ok(Math.abs(esc.py(-BARRA_M) - h) < 1e-9);
      assert.ok(esc.py(ALTO_MINIMO) >= -1e-9, `${w}x${h}`);
      for (const d of DIANAS) assert.ok(esc.px(d.distancia) > 0 && esc.px(d.distancia) < w);
    }
  });

  it('la catapulta entera queda dentro, con sitio para estirar detras', () => {
    const esc = crearEscala(740, 330, CAMPO)!;
    assert.ok(esc.px(SPRITES.base.x0) >= 0, 'la base no se sale por la izquierda');
  });

  it('se puede llegar a fuerza maxima sin salirse de la pantalla', () => {
    for (const [w, h] of [[740, 330], [915, 352], [1280, 600], [330, 740]]) {
      const esc = crearEscala(w, h, CAMPO)!;
      assert.ok(alcancePx(esc) < h * 0.5, `${w}x${h}: ${alcancePx(esc)}`);
    }
  });

  it('colocar pone el punto de referencia del dibujo en su sitio', () => {
    const esc = crearEscala(800, 340, CAMPO)!;
    const c = colocar(esc, SPRITES.vaso, 1.2, 0);
    // La referencia (x = 0 del dibujo) cae en px(1,2); su barra (y = 0) en py(0).
    assert.ok(Math.abs(c.left - SPRITES.vaso.x0 * esc.e - esc.px(1.2)) < 1e-9);
    assert.ok(Math.abs(c.top + SPRITES.vaso.y1 * esc.e - esc.py(0)) < 1e-9);
    assert.ok(Math.abs(c.width - (SPRITES.vaso.x1 - SPRITES.vaso.x0) * esc.e) < 1e-9);
  });
});

describe('jugar con el movil en vertical: el juego se pinta tumbado', () => {
  it('solo se tumba si la ventana es mas alta que ancha', () => {
    assert.ok(hayQueGirar(390, 740));
    assert.ok(!hayQueGirar(740, 390));
  });

  it('las esquinas de la pantalla caen en las esquinas del juego', () => {
    // 390x740 en vertical: el juego mide 740 de ancho y 390 de alto, girado a la derecha.
    const caja = { left: 0, top: 0, right: 390 };
    assert.deepEqual(desdePantallaGirada(caja, 390, 0), [0, 0], 'arriba-izquierda del juego: arriba-derecha de la pantalla');
    assert.deepEqual(desdePantallaGirada(caja, 0, 740), [740, 390], 'abajo-derecha del juego: abajo-izquierda de la pantalla');
    assert.deepEqual(desdePantallaGirada(caja, 390, 740), [740, 0]);
  });
});
