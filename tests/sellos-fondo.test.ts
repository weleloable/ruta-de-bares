import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fondo decorativo de la pantalla Sellos (app/(tabs)/index.tsx): la imagen
 * pedida, estirada a la pantalla ('fill', no 'cover': no debe recortarse ni
 * respetar su proporcion) y semitransparente para no tapar la rejilla de
 * sellos. `pointerEvents="none"` porque cubre toda la pantalla por detras: sin
 * eso, un toque sobre ella no llegaria ni a los chips ni al scroll.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const codigo = readFileSync(join(raiz, 'app/(tabs)/index.tsx'), 'utf8');

describe('fondo de Sellos', () => {
  it('el fichero de la imagen existe', () => {
    assert.ok(existsSync(join(raiz, 'assets/fondos/sellos-fondo.jpg')));
  });

  it('se pinta con contentFit "fill" (estirada, no recortada)', () => {
    assert.match(codigo, /contentFit="fill"/);
  });

  it('no deja pasar los toques (esta detras de todo, cubre la pantalla entera)', () => {
    assert.match(codigo, /pointerEvents="none"/);
  });

  it('es semitransparente: ni invisible ni opaca del todo', () => {
    const m = /fondo:\s*\{[^}]*opacity:\s*([\d.]+)/.exec(codigo);
    assert.ok(m, 'no se encuentra opacity en el estilo "fondo"');
    const opacidad = Number(m[1]);
    assert.ok(opacidad > 0 && opacidad < 1, `opacity ${opacidad} deberia estar entre 0 y 1`);
  });

  it('cubre toda la pantalla (posicion absoluta a los cuatro bordes)', () => {
    const m = /fondo:\s*\{([^}]*)\}/.exec(codigo);
    assert.ok(m);
    for (const borde of ['top: 0', 'left: 0', 'right: 0', 'bottom: 0']) {
      assert.match(m[1], new RegExp(borde.replace(': ', ':\\s*')));
    }
    assert.match(m[1], /position:\s*'absolute'/);
  });
});
