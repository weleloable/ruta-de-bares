import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * La medalla de credencial completa vive en la tarjeta de la credencial, a la
 * derecha de los textos, y NO se guarda: se deduce de los sellos.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('pantalla Sellos', () => {
  const codigo = sinComentarios(leer('app/(tabs)/index.tsx'));

  it('pinta la medalla solo cuando la credencial esta completa', () => {
    assert.match(codigo, /\{credencialCompleta\(conseguidos, bars\.length\) \? <Medalla \/> : null\}/);
  });

  it('el globo verde "Ruta completa. Compostelana ganada." ya no existe', () => {
    assert.doesNotMatch(codigo, /Compostelana ganada/);
    assert.doesNotMatch(codigo, /<Banner tone="success">/);
  });

  it('la medalla va en la cabecera de la tarjeta, a la derecha de los textos', () => {
    const cabecera = /<View style=\{styles\.credencialCabecera\}>([\s\S]*?)<\/View>\s*\n\s*<View style=\{styles\.progresoFila\}>/.exec(codigo);
    assert.ok(cabecera, 'no encuentro la cabecera de la credencial');
    const iTextos = cabecera[1].indexOf('styles.credencialTextos');
    const iMedalla = cabecera[1].indexOf('<Medalla />');
    assert.ok(iTextos > -1 && iMedalla > iTextos, 'la medalla tiene que ir despues de los textos');
    assert.match(codigo, /credencialCabecera:\s*\{\s*flexDirection:\s*'row'/);
  });

  it('no hay nada persistido: ni tablas ni llamadas nuevas para la medalla', () => {
    assert.doesNotMatch(codigo, /supabase|route_completions|from\('/);
  });
});

describe('Medalla', () => {
  it('tiene etiqueta de accesibilidad', () => {
    assert.match(leer('src/components/Medalla.tsx'), /accessibilityLabel="Medalla: ruta completa"/);
  });
});
