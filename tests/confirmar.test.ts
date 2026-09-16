import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Alert.alert en react-native-web es una funcion vacia: un boton que confirma
 * con el no hace nada en la web ni en la PWA instalada, y ningun otro test lo
 * ve (llego a pasar con Cerrar sesion). Las confirmaciones van por
 * src/lib/confirmar.ts, que tiene variante web.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function listar(carpeta: string): string[] {
  return readdirSync(join(raiz, carpeta)).flatMap((nombre) => {
    const ruta = join(raiz, carpeta, nombre);
    const rel = relative(raiz, ruta).replace(/\\/g, '/');
    if (statSync(ruta).isDirectory()) return listar(rel);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre) ? [rel] : [];
  });
}

const PERMITIDO = 'src/lib/confirmar.ts';

describe('confirmaciones que funcionan en web', () => {
  it('ninguna pantalla ni componente llama a Alert.alert directamente', () => {
    const culpables = ['app', 'src']
      .flatMap(listar)
      .filter((ruta) => ruta !== PERMITIDO)
      .filter((ruta) => /\bAlert\s*\.\s*alert\s*\(/.test(readFileSync(join(raiz, ruta), 'utf8')));
    assert.deepEqual(culpables, []);
  });

  it('confirmar tiene variante web con la misma firma', () => {
    const nativa = readFileSync(join(raiz, 'src/lib/confirmar.ts'), 'utf8');
    const web = readFileSync(join(raiz, 'src/lib/confirmar.web.ts'), 'utf8');
    for (const codigo of [nativa, web]) {
      assert.match(codigo, /export function confirmar\(\{[^}]*\}: Confirmacion\): Promise<boolean>/);
    }
    assert.doesNotMatch(web, /Alert/, 'la variante web no puede depender de Alert');
  });
});
