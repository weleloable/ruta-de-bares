import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { agarraChapa, ALTO_MINIMO, BARRA_PX, crearEscala } from './escena.ts';
import { ALTURA_SALIDA, CAMPO, DIANAS } from './modelo.ts';

describe('escala de Tapon al Vuelo', () => {
  it('sin medidas no hay escala (primer render, pestana oculta)', () => {
    assert.equal(crearEscala(0, 400, CAMPO), null);
    assert.equal(crearEscala(360, 0, CAMPO), null);
  });

  it('el campo entero cabe a lo ancho y la barra queda abajo', () => {
    for (const [w, h] of [[336, 300], [336, 520], [700, 260], [390, 410]]) {
      const esc = crearEscala(w, h, CAMPO)!;
      assert.ok(esc.px(CAMPO.xMin) >= -1e-9 && esc.px(CAMPO.xMax) <= w + 1e-9, `${w}x${h}`);
      assert.equal(esc.py(0), h - BARRA_PX);
      // Lo mas alto que tiene que verse queda dentro.
      assert.ok(esc.py(ALTO_MINIMO) >= -1e-9, `${w}x${h}`);
      for (const d of DIANAS) assert.ok(esc.px(d.distancia) > 0 && esc.px(d.distancia) < w);
    }
  });

  it('se agarra la chapa tocando cerca, no en cualquier sitio', () => {
    const esc = crearEscala(336, 400, CAMPO)!;
    const cx = esc.px(0);
    const cy = esc.py(ALTURA_SALIDA);
    assert.ok(agarraChapa(esc, 0, ALTURA_SALIDA, cx + 20, cy + 20));
    assert.ok(!agarraChapa(esc, 0, ALTURA_SALIDA, cx + 200, cy));
  });
});
