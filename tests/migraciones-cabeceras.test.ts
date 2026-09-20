import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Las cabeceras de las migraciones dicen la verdad sobre si se pueden repetir.
 *
 * Por que hay test y no basta con corregirlas una vez: casi todas decian
 * "Idempotente: se puede re-ejecutar", y en la mitad era MENTIRA. Cuando una
 * migracion define una funcion que otra POSTERIOR rehace, volver a pegar la
 * vieja **degrada** la funcion a su version antigua, sin dar error y sin avisar.
 *
 * Ya mordio: re-ejecutar la 0006 dejo a `match_require_target` sin la
 * comprobacion de bloqueos, o sea que la gente bloqueada volvia a poder
 * interactuar. Nadie se entero hasta que se comparo el md5 de la funcion.
 *
 * Este test recalcula la lista en cada ejecucion. Asi, el dia que alguien anada
 * una migracion que rehaga una funcion de la 0027, la cabecera de la 0027 deja
 * de ser cierta y esto falla, en vez de quedarse mintiendo durante meses.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(raiz, 'supabase/migrations');
const ficheros = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const leer = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n');
/** Sin comentarios: una funcion NOMBRADA en un comentario no es una definicion. */
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

/** Las funciones de `public` que define cada migracion. */
function definidasPor(f: string): Set<string> {
  const encontradas = [...sinComentarios(leer(f)).matchAll(/create (?:or replace )?function\s+public\.(\w+)/gi)];
  return new Set(encontradas.map((m) => (m[1] as string).toLowerCase()));
}

const defs = ficheros.map((f) => ({ f, fn: definidasPor(f) }));

/** Para cada migracion, que funciones suyas rehace una posterior, y cual. */
function obsoletasDe(indice: number): Map<string, string> {
  const posteriores = new Map<string, string>();
  for (let j = indice + 1; j < defs.length; j++) {
    for (const nombre of defs[j].fn) {
      if (!posteriores.has(nombre)) posteriores.set(nombre, (defs[j].f as string).slice(0, 4));
    }
  }
  const salida = new Map<string, string>();
  for (const nombre of defs[indice].fn) {
    const quien = posteriores.get(nombre);
    if (quien) salida.set(nombre, quien);
  }
  return salida;
}

/**
 * El bloque de comentarios del principio, que es donde vive el aviso. Se corta
 * en la primera linea que no sea comentario ni este en blanco, y NO en un numero
 * fijo de lineas: la 0005 tiene diez funciones obsoletas y se salia del corte.
 */
function cabecera(f: string): string {
  const lineas: string[] = [];
  for (const linea of leer(f).split('\n')) {
    if (linea.trim() !== '' && !linea.startsWith('--')) break;
    lineas.push(linea);
  }
  return lineas.join('\n');
}

describe('las cabeceras de las migraciones no mienten', () => {
  it('hay migraciones que mirar', () => {
    assert.ok(ficheros.length >= 20, `solo se encontraron ${ficheros.length} migraciones`);
    assert.ok(
      defs.some((d) => d.fn.size > 0),
      'no se detecto ninguna funcion: el regex esta roto y este test no probaria nada',
    );
  });

  it('la que una posterior rehace avisa de que NO se puede re-ejecutar', () => {
    const fallos: string[] = [];
    defs.forEach((d, i) => {
      const obsoletas = obsoletasDe(i);
      if (obsoletas.size === 0) return;
      const texto = cabecera(d.f);
      if (!/NO SE PUEDE RE-EJECUTAR/.test(texto)) {
        fallos.push(`${d.f}: la rehacen despues (${[...obsoletas.keys()].join(', ')}) y su cabecera no avisa`);
      }
    });
    assert.deepEqual(fallos, [], fallos.join('\n'));
  });

  it('y nombra exactamente cuales quedan obsoletas, y quien las rehace', () => {
    // Sin esto la cabecera avisaria en general pero no diria que mirar, que es
    // lo unico util cuando alguien esta depurando por que una funcion cambio.
    const fallos: string[] = [];
    defs.forEach((d, i) => {
      const obsoletas = obsoletasDe(i);
      if (obsoletas.size === 0) return;
      const texto = cabecera(d.f);
      for (const [nombre, quien] of obsoletas) {
        if (!texto.includes(`${nombre}() la rehace la ${quien}`)) {
          fallos.push(`${d.f}: falta "${nombre}() la rehace la ${quien}"`);
        }
      }
    });
    assert.deepEqual(fallos, [], fallos.join('\n'));
  });

  it('la que NO rehace nadie puede seguir diciendo que es idempotente', () => {
    const fallos: string[] = [];
    defs.forEach((d, i) => {
      if (obsoletasDe(i).size > 0) return;
      const texto = cabecera(d.f);
      if (/NO SE PUEDE RE-EJECUTAR/.test(texto)) {
        fallos.push(`${d.f}: avisa de que no se puede repetir y ninguna posterior la pisa`);
      }
      if (!/idempotente/i.test(texto)) {
        fallos.push(`${d.f}: no dice si se puede re-ejecutar`);
      }
    });
    assert.deepEqual(fallos, [], fallos.join('\n'));
  });

  it('todas dicen en que orden van', () => {
    for (const { f } of defs) {
      assert.match(cabecera(f), /SQL Editor/, `${f} no explica como aplicarla`);
    }
  });

  it('y SETUP.md lo dice tambien, que es donde se mira al desplegar', () => {
    const setup = readFileSync(join(raiz, 'docs/SETUP.md'), 'utf8');
    assert.match(setup, /no se re-?ejecuta|nunca se vuelve a pegar|una sola vez/i);
  });
});

/**
 * De paso, la gramatica de TODAS las migraciones.
 *
 * Cada migration-NNNN.test.ts valida la suya, pero las que no tienen fichero
 * propio se quedaban sin mirar. Aqui se pasan todas por el parser de Postgres
 * (compilado a wasm), que es barato y caza un parentesis suelto antes de
 * pegarlo en produccion.
 *
 * Una instancia del parser POR LLAMADA: `parse()` seguido de `parsePlpgsql()`
 * sobre la misma revienta el wasm y se lleva el proceso por delante.
 */
describe('todas las migraciones son SQL valido', () => {
  for (const f of ficheros) {
    it(`${f}: gramatica y cuerpos plpgsql`, async () => {
      const init = (await import('pg-query-emscripten')).default;
      const sql = leer(f);
      const sintaxis = (await init()).parse(sql);
      assert.ok(!sintaxis.error, `error de sintaxis: ${JSON.stringify(sintaxis.error)}`);
      assert.ok(
        (sintaxis.parse_tree?.stmts?.length ?? 0) > 0,
        'no se leyo ninguna sentencia: el fichero esta vacio o truncado',
      );
      const plpgsql = (await init()).parsePlpgsql(sql);
      assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
    });
  }
});
