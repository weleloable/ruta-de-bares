import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fondo decorativo de la pantalla Sellos (app/(tabs)/index.tsx): la imagen
 * pedida, estirada ('fill', no 'cover': no debe recortarse ni respetar su
 * proporcion) y casi transparente para no tapar la rejilla de sellos.
 * `pointerEvents="none"` porque cubre su hueco por detras: sin eso, un toque
 * sobre ella no llegaria ni a los chips ni al scroll.
 *
 * El fondo NO empieza en la pantalla (top: 0): empieza justo debajo de la
 * credencial (altoCabecera, medido con onLayout), porque la credencial es
 * opaca y ese trozo de imagen se perderia detras sin que nadie lo viera.
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

  it('no deja pasar los toques (esta detras de todo, cubre su hueco entero)', () => {
    assert.match(codigo, /pointerEvents="none"/);
  });

  it('es semitransparente: ni invisible ni opaca del todo', () => {
    const m = /fondo:\s*\{[^}]*opacity:\s*([\d.]+)/.exec(codigo);
    assert.ok(m, 'no se encuentra opacity en el estilo "fondo"');
    const opacidad = Number(m[1]);
    assert.ok(opacidad > 0 && opacidad < 1, `opacity ${opacidad} deberia estar entre 0 y 1`);
  });

  it('cubre de borde a borde a los lados y abajo, absoluta', () => {
    const m = /fondo:\s*\{([^}]*)\}/.exec(codigo);
    assert.ok(m);
    for (const borde of ['left: 0', 'right: 0', 'bottom: 0']) {
      assert.match(m[1], new RegExp(borde.replace(': ', ':\\s*')));
    }
    assert.match(m[1], /position:\s*'absolute'/);
  });

  it('el "top" NO esta fijo a 0 en el estilo: lo pone altoCabecera en tiempo real', () => {
    const m = /fondo:\s*\{([^}]*)\}/.exec(codigo);
    assert.ok(m);
    assert.doesNotMatch(m[1], /top:/, 'top fijo en el StyleSheet: volveria a empezar en la pantalla entera');
    assert.match(codigo, /style=\{\[styles\.fondo,\s*\{\s*top:\s*altoCabecera\s*\}\]\}/);
  });

  it('mide la cabecera (aviso+chips+credencial) con onLayout, redondeado y sin repintar si no cambia', () => {
    assert.match(codigo, /onLayout=\{medirCabecera\}/);
    assert.match(codigo, /const \[altoCabecera, setAltoCabecera\] = useState\(0\)/);
    assert.match(codigo, /Math\.round\(y \+ height\)/);
    assert.match(codigo, /setAltoCabecera\(\(previo\) => \(previo === total \? previo : total\)\)/);
  });

  it('la credencial esta DENTRO del bloque medido, no fuera', () => {
    const inicio = codigo.indexOf('onLayout={medirCabecera}');
    const fin = codigo.indexOf('{!activeRoute ? (', inicio);
    assert.ok(inicio > 0 && fin > inicio, 'no se encuentra el bloque de cabecera');
    const bloque = codigo.slice(inicio, fin);
    assert.match(bloque, /styles\.credencial/, 'la credencial deberia estar dentro del bloque medido');
  });
});
