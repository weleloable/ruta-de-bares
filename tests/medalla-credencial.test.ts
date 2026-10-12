import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * La medalla de credencial completa vive en la tarjeta de la credencial, en la
 * misma fila que el nombre y la barra de progreso (pequena, para no gastar
 * altura), y NO se guarda: se deduce de los sellos.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('pantalla Sellos', () => {
  const codigo = sinComentarios(leer('app/(tabs)/index.tsx'));

  it('pinta la medalla solo cuando la credencial esta completa', () => {
    assert.match(
      codigo,
      /\{credencialCompleta\(conseguidos, bares.length\) \? \(\s*<View style=\{styles\.medallaHueco\}>\s*<View style=\{styles\.medallaEscala\}>\s*<Medalla onPress=\{\(\) => setDiplomaAbierto\(true\)\} \/>\s*<\/View>\s*<\/View>\s*\) : null\}/,
    );
  });

  it('el globo verde "Ruta completa. Compostelana ganada." ya no existe', () => {
    assert.doesNotMatch(codigo, /Compostelana ganada/);
    assert.doesNotMatch(codigo, /<Banner tone="success">/);
  });

  it('la medalla va en la fila del nombre, a su derecha, antes de la ruta y la barra', () => {
    const fila = /<View style=\{styles\.credencialFila\}>([\s\S]*?)<View style=\{styles\.rutaFila\}>/.exec(codigo);
    assert.ok(fila, 'no encuentro la fila de la credencial');
    const iNombre = fila[1].indexOf('styles.credencialNombre');
    const iMedalla = fila[1].indexOf('<Medalla onPress=');
    assert.ok(iNombre > -1 && iMedalla > iNombre, 'la medalla tiene que ir despues del nombre');
    assert.match(codigo, /credencialFila:\s*\{\s*flexDirection:\s*'row'/);
  });

  it('no hay nada persistido: ni tablas ni llamadas nuevas para la medalla', () => {
    assert.doesNotMatch(codigo, /supabase|route_completions|from\('/);
  });
});

describe('Medalla', () => {
  it('tiene etiqueta de accesibilidad', () => {
    assert.match(leer('src/components/Medalla.tsx'), /accessibilityLabel="Medalla: ruta completa\./);
  });
});
