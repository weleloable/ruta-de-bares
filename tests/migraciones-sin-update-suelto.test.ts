import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Ningun UPDATE ni DELETE sin WHERE en lo que llama la API.
 *
 * Supabase carga `pg-safeupdate` para las peticiones de la API y rechaza con
 * "UPDATE requires a WHERE clause" (o "DELETE ...") cualquier sentencia sin
 * WHERE, tambien dentro de una funcion SECURITY DEFINER. En el SQL Editor y en
 * PGlite (los tests) esa proteccion no esta, asi que ningun otro test lo caza:
 * `casas_admin_regla` (0048) lo tuvo meses y fallaba en cuanto un admin cambiaba
 * los puntos de una accion. Se vio al probar en el Supabase local.
 *
 * Si de verdad quieres tocar todas las filas, escribe `where true`.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(raiz, 'supabase/migrations');
const ficheros = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const leer = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)).replace(/--.*$/gm, (m) => ' '.repeat(m.length));

type Hallazgo = { fichero: string; funcion: string | null; sentencia: string };

/** Las sentencias UPDATE ... SET / DELETE FROM ... que no llevan WHERE, con la funcion que las contiene. */
function sinWhere(fichero: string): Hallazgo[] {
  const sql = sinComentarios(leer(fichero));
  const funciones = [...sql.matchAll(/create (?:or replace )?function\s+public\.(\w+)/gi)].map((m) => ({
    en: m.index as number,
    nombre: (m[1] as string).toLowerCase(),
  }));
  const salida: Hallazgo[] = [];
  let desde = 0;
  for (const trozo of sql.split(';')) {
    for (const m of trozo.matchAll(
      /\b(update\s+(?:only\s+)?[\w."]+(?:\s+(?:as\s+)?\w+)?\s+set\b|delete\s+from\s+(?:only\s+)?[\w."]+)/gi,
    )) {
      const resto = trozo.slice(m.index);
      if (/\bwhere\b|\bcurrent\s+of\b/i.test(resto)) continue;
      const posicion = desde + (m.index as number);
      const dentro = funciones.filter((f) => f.en < posicion).pop();
      salida.push({ fichero, funcion: dentro?.nombre ?? null, sentencia: resto.replace(/\s+/g, ' ').trim().slice(0, 100) });
    }
    desde += trozo.length + 1;
  }
  return salida;
}

/**
 * Lo que se deja pasar, con el motivo. Cada entrada se comprueba (si ya no hace
 * falta, el test falla pidiendo borrarla).
 */
const PERMITIDOS: { fichero: string; funcion: string | null; motivo: string; rehechaPor?: string }[] = [
  {
    fichero: '0008_cana_solo_la_pregunta.sql',
    funcion: null,
    motivo: 'sentencia suelta que se pega UNA vez en el SQL Editor como superusuario: no pasa por la API',
  },
  {
    fichero: '0048_panel_casas.sql',
    funcion: 'casas_admin_regla',
    motivo: 'la version publicada fallaba por esto',
    rehechaPor: '0065_regla_de_puntos_con_where.sql',
  },
];

describe('migraciones: nada de UPDATE/DELETE sin WHERE que llame la API', () => {
  const todos = ficheros.flatMap(sinWhere);

  it('el detector funciona (si no, este test no probaria nada)', () => {
    // Los dos casos conocidos (0008 y 0048) tienen que salir: si el detector se rompe y
    // no ve nada, "no hay sueltos" seria verdad por el motivo equivocado.
    assert.ok(todos.some((h) => h.fichero.startsWith('0048') && h.funcion === 'casas_admin_regla'), 'no ve el caso de la 0048');
    assert.ok(todos.some((h) => h.fichero.startsWith('0008') && h.funcion === null), 'no ve el caso de la 0008');
  });

  it('todo lo que no lleva WHERE esta permitido a proposito', () => {
    const sueltos = todos.filter(
      (h) => !PERMITIDOS.some((p) => p.fichero === h.fichero && p.funcion === h.funcion),
    );
    assert.deepEqual(
      sueltos.map((h) => `${h.fichero} (${h.funcion ?? 'suelta'}): ${h.sentencia}`),
      [],
      'UPDATE/DELETE sin WHERE: pg-safeupdate lo rechaza en la API. Anade `where true` si de verdad son todas las filas.',
    );
  });

  it('la lista de permitidos no se queda vieja', () => {
    for (const p of PERMITIDOS) {
      assert.ok(
        todos.some((h) => h.fichero === p.fichero && h.funcion === p.funcion),
        `${p.fichero} (${p.funcion ?? 'suelta'}) ya no tiene ese caso: quitalo de PERMITIDOS`,
      );
    }
  });

  it('lo permitido en una funcion de la API esta rehecho por una migracion posterior', () => {
    for (const p of PERMITIDOS.filter((x) => x.funcion !== null)) {
      assert.ok(p.rehechaPor, `${p.fichero}: una funcion de la API sin WHERE tiene que estar rehecha despues`);
      assert.ok(p.rehechaPor > p.fichero, `${p.rehechaPor} tiene que ir despues de ${p.fichero}`);
      const rehecha = sinComentarios(leer(p.rehechaPor));
      assert.match(
        rehecha,
        new RegExp(`create or replace function\\s+public\\.${p.funcion}\\b`, 'i'),
        `${p.rehechaPor} no rehace ${p.funcion}`,
      );
      assert.deepEqual(
        sinWhere(p.rehechaPor).filter((h) => h.funcion === p.funcion),
        [],
        `${p.rehechaPor} sigue teniendo un UPDATE sin WHERE en ${p.funcion}`,
      );
    }
  });
});
