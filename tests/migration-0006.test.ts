import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0006 anade la miniatura de la foto de perfil. Lo que hay que asegurar sobre
 * Postgres real es que las tres funciones que pintan varias fotos a la vez
 * devuelven la miniatura, que la ficha sigue recibiendo la foto grande, y que
 * una foto subida antes de la migracion (sin miniatura) no deja a nadie sin
 * foto: cae en avatar_url.
 */

const m0001 = leerFichero('supabase/migrations/0001_init.sql');
const m0002 = leerFichero('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0004 = leerFichero('supabase/migrations/0004_tirate_una_cana.sql');
const m0005 = leerFichero('supabase/migrations/0005_cana_visto.sql');
const m0006 = leerFichero('supabase/migrations/0006_avatar_miniatura.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const GRANDE = 'https://ejemplo.test/avatars/ana/avatar-1.jpg';
const MINI = 'https://ejemplo.test/avatars/ana/avatar-1-mini.jpg';
const VIEJA = 'https://ejemplo.test/avatars/luis/avatar-antigua.jpg';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Ruta publicada', true, '${ADMIN}');
  -- Ana subio la foto con la app nueva; Luis tiene una de antes (sin miniatura).
  update public.profiles set avatar_url = '${GRANDE}', avatar_thumb_url = '${MINI}' where id = '${ANA}';
  update public.profiles set avatar_url = '${VIEJA}' where id = '${LUIS}';
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;


async function activar(db: PGlite, a: Actor, ...uids: string[]) {
  for (const uid of uids) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola')`);
  }
}

describe('0006_avatar_miniatura.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0006);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    // Una instancia por llamada: dos seguidas sobre la misma revientan el wasm.
    const plpgsql = (await init()).parsePlpgsql(m0006);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('vuelve a dar permiso a authenticated: drop function se lo lleva por delante', () => {
    const sinComentarios = m0006.replace(/--.*$/gm, '');
    for (const funcion of ['match_grid', 'match_inbox', 'match_get_connection']) {
      assert.match(sinComentarios, new RegExp(`drop function if exists public\\.${funcion}`));
    }
    assert.match(sinComentarios, /grant execute on function[\s\S]*match_grid\(uuid\)[\s\S]*to authenticated/);
  });
});

describe('0006 sobre Postgres real', async () => {
  // La 0006 dos veces: tiene que poder re-ejecutarse como las demas.
  const db = await crearBase([m0001, m0002, m0004, m0005, m0006, m0006]);
  await db.exec(DATOS);

  it('la grilla da la miniatura, y la foto grande aparte para la ficha', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(LUIS);
      const [ana] = await filas(db, 'select * from public.match_grid($1)', [RUTA]);
      assert.equal(ana.avatar_thumb_url, MINI);
      assert.equal(ana.avatar_url, GRANDE);
    });
  });

  it('una foto de antes de la 0006 no deja la casilla vacia', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      const [luis] = await filas(db, 'select * from public.match_grid($1)', [RUTA]);
      assert.equal(luis.avatar_thumb_url, VIEJA);
      assert.equal(luis.avatar_url, VIEJA);
    });
  });

  it('la bandeja y la cabecera del chat tambien dan la miniatura', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
      await a.como(LUIS);
      await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, ANA]);

      const [chat] = await filas(db, 'select * from public.match_inbox($1)', [RUTA]);
      assert.equal(chat.avatar_url, MINI, 'la lista de chats pinta la foto a 52 pt');
      const [detalle] = await filas(db, 'select * from public.match_get_connection($1)', [chat.connection_id]);
      assert.equal(detalle.avatar_url, MINI, 'la cabecera del chat la pinta a 36 pt');
    });
  });
  it('la columna admite NULL: nadie tiene que resubir su foto', async () => {
    const [columna] = await filas(
      db,
      `select is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_thumb_url'`,
    );
    assert.equal(columna?.is_nullable, 'YES');
  });
});
