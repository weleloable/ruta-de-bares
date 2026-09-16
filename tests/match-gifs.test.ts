import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { leerFichero } from './pglite-supabase.ts';

/**
 * El chat guarda solo el id del GIF (0003_tirate_una_cana.sql, match_gifs) y
 * la app lo pinta con su propio fichero (src/features/match/gifs.ts). Si los
 * dos catalogos se separan, el servidor acepta un GIF que la app no sabe pintar
 * o la app ofrece uno que el servidor rechaza. gifs.ts no se puede importar en
 * Node (require de imagenes es cosa de Metro), asi que se lee como texto.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogoTs = readFileSync(join(raiz, 'src/features/match/gifs.ts'), 'utf8');
const migracion = leerFichero('supabase/migrations/0003_tirate_una_cana.sql');

const entradasTs = [...catalogoTs.matchAll(/\{ id: '([a-z0-9-]+)', etiqueta: '[^']+', fuente: require\('([^']+)'\) \}/g)].map(
  (m) => ({ id: m[1], ruta: m[2] }),
);

const idsSql = (() => {
  const bloque = /insert into public\.match_gifs[\s\S]*?on conflict/.exec(migracion);
  assert.ok(bloque, 'no se encuentra el insert de match_gifs');
  return [...bloque[0].matchAll(/\('([a-z0-9-]+)', '[^']+', \d+\)/g)].map((m) => m[1]);
})();

describe('catalogo de GIFs', () => {
  it('app y servidor tienen exactamente los mismos ids', () => {
    assert.ok(entradasTs.length > 0, 'no se ha leido ningun GIF de gifs.ts');
    assert.deepEqual(entradasTs.map((e) => e.id).sort(), [...idsSql].sort());
  });

  it('cada GIF existe, es un GIF de verdad, se llama como su id y pesa poco', () => {
    for (const { id, ruta } of entradasTs) {
      const fichero = join(raiz, 'src/features/match', ruta);
      assert.ok(ruta.endsWith(`/${id}.gif`), `${id} apunta a ${ruta}`);
      assert.equal(readFileSync(fichero).subarray(0, 6).toString('ascii'), 'GIF89a', `${ruta} no es un GIF`);
      // Van dentro del bundle: uno grande engorda la app entera.
      assert.ok(statSync(fichero).size < 200 * 1024, `${ruta} pasa de 200 KB`);
    }
  });
});
