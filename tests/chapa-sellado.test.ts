import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Un sello validado lleva la chapa de botellin verde alrededor del logo.
 * Sin renderizador en el repo, se vigila el cableado por codigo.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('StampSeal', () => {
  const codigo = sinComentarios(leer('src/components/StampSeal.tsx'));

  it('pinta la chapa solo si esta sellado', () => {
    assert.match(codigo, /\{sellado \? <ChapaSellado tamanoLogo=\{TAMANO\} \/> : null\}/);
  });

  it('ya no lleva el rotulo APPROVED ni los sellos de prueba descartados', () => {
    assert.doesNotMatch(codigo, /APPROVED/);
    assert.doesNotMatch(codigo, /SelloFecha|SelloTinta/);
  });

  it('el logo pendiente sigue al 50 % y el sellado a tope', () => {
    assert.match(codigo, /OPACIDAD_SELLO_PENDIENTE = 0\.5;/);
    assert.match(codigo, /opacity: sellado \? 1 : OPACIDAD_SELLO_PENDIENTE/);
  });

  it('la etiqueta de accesibilidad conserva la fecha y hora del sellado', () => {
    assert.match(codigo, /sellado el \$\{diaCorto\(stampedAt\)\} a las \$\{hora\(stampedAt\)\}/);
  });
});

describe('ChapaSellado', () => {
  const codigo = sinComentarios(leer('src/components/ChapaSellado.tsx'));

  it('usa la imagen del usuario, teñida de verde', () => {
    assert.match(codigo, /require\('\.\.\/\.\.\/assets\/marca\/chapa\.png'\)/);
    assert.match(codigo, /tintColor: colors\.green/);
  });

  it('es decoracion: no intercepta toques', () => {
    assert.match(codigo, /pointerEvents="none"/);
  });

  it('el archivo de la chapa existe y es un PNG', () => {
    const ruta = join(raiz, 'assets/marca/chapa.png');
    assert.ok(existsSync(ruta));
    assert.equal(readFileSync(ruta).subarray(1, 4).toString('latin1'), 'PNG');
  });

  it('el PNG conserva canal alfa (color type 6): sin el, el blanco taparia el logo', () => {
    const cabecera = readFileSync(join(raiz, 'assets/marca/chapa.png'));
    assert.equal(cabecera[25], 6);
  });

  it('el PNG mide 350 x 350, las medidas en las que se basa chapa.ts', () => {
    const png = readFileSync(join(raiz, 'assets/marca/chapa.png'));
    assert.equal(png.readUInt32BE(16), 350);
    assert.equal(png.readUInt32BE(20), 350);
    assert.match(leer('src/components/chapa.ts'), /LADO_IMAGEN_ORIGINAL = 350;/);
  });
});
