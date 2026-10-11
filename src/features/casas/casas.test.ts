import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CASAS, escudoSvg, escudoUri, esCasa, ORDEN_CASAS } from './casas.ts';

describe('las casas', () => {
  it('son cuatro, con los nombres de las cervezas', () => {
    assert.deepEqual(
      ORDEN_CASAS.map((id) => CASAS[id].nombre),
      ['Mahou', 'Cruzcampo', 'Estrella Galicia', 'Alhambra'],
    );
  });

  it('ningun color de una casa se repite en otra (principal, oscuro ni detalle)', () => {
    const vistos = new Map<string, string>();
    for (const id of ORDEN_CASAS) {
      for (const color of [CASAS[id].color, CASAS[id].oscuro, CASAS[id].detalle]) {
        const ya = vistos.get(color.toLowerCase());
        assert.ok(!ya || ya === id, `${color} lo usan ${ya} y ${id}`);
        vistos.set(color.toLowerCase(), id);
      }
    }
  });

  it('los colores principales son de la familia pedida: rojo, naranja, negro y verde', () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [mr, mg, mb] = rgb(CASAS.mahou.color);
    assert.ok(mr > 150 && mg < 60 && mb < 80, 'Mahou rojo');
    const [cr, cg, cb] = rgb(CASAS.cruzcampo.color);
    assert.ok(cr > 200 && cg > 90 && cg < 160 && cb < 60, 'Cruzcampo naranja');
    assert.ok(rgb(CASAS.estrella.color).every((v) => v < 50), 'Estrella negro');
    const [ar, ag, ab] = rgb(CASAS.alhambra.color);
    assert.ok(ag > ar && ag > ab, 'Alhambra verde');
  });

  it('cada escudo es un SVG con su color y su emblema propio', () => {
    const svgs = ORDEN_CASAS.map((id) => escudoSvg(id));
    for (const [k, svg] of svgs.entries()) {
      assert.match(svg, /^<svg[^>]+viewBox="0 0 120 140"/);
      assert.ok(svg.includes(CASAS[ORDEN_CASAS[k]].color));
      assert.ok(svg.trim().endsWith('</svg>'));
      // Sin numeros raros en las coordenadas calculadas.
      assert.ok(!/NaN|undefined/.test(svg));
    }
    assert.equal(new Set(svgs).size, 4, 'los cuatro son distintos');
    assert.match(escudoUri('mahou'), /^data:image\/svg\+xml;utf8,%3Csvg/);
  });

  it('reconoce una casa valida y nada mas', () => {
    assert.ok(esCasa('alhambra'));
    assert.ok(!esCasa('heineken'));
    assert.ok(!esCasa(null));
  });
});
