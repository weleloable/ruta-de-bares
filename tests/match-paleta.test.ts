import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Diseno pidio que Tirate una cana respete la paleta cervecera de la app: el
 * estado de cada tarjeta se marca con colores de src/lib/theme.ts (cerveza,
 * tostada, crema, tinta) y con forma (vaso, doble aro, borde discontinuo),
 * nunca con verde, rojo o turquesa. Un color escrito a mano o un verde que
 * vuelva por descuido no rompe nada visible en los tests, asi que se vigila.
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

const FICHEROS = ['app/(tabs)/cana.tsx', ...listar('app/cana'), ...listar('src/features/match')];

describe('Tirate una cana usa solo la paleta cervecera', () => {
  it('hay ficheros que revisar', () => {
    assert.ok(FICHEROS.length >= 10, `solo ${FICHEROS.length} ficheros: ¿se ha movido la feature?`);
  });

  it('ningun verde ni turquesa del tema', () => {
    const culpables = FICHEROS.filter((ruta) =>
      /colors\.(green|greenSoft|teal|tealSoft|stampSoft)\b/.test(readFileSync(join(raiz, ruta), 'utf8')),
    );
    assert.deepEqual(culpables, []);
  });

  it('ningun color hexadecimal escrito a mano: todos salen de theme.ts', () => {
    const culpables = FICHEROS.flatMap((ruta) =>
      [...readFileSync(join(raiz, ruta), 'utf8').matchAll(/['"`]#[0-9A-Fa-f]{3,8}['"`]/g)].map(
        (m) => `${ruta}: ${m[0]}`,
      ),
    );
    assert.deepEqual(culpables, []);
  });
});
