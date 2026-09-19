import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0008 deja la cana con una sola cosa que hacer: ofrecer la cerveza. Lo que
 * hay que asegurar sobre Postgres real es que GIFs y zumbidos no se pueden
 * enviar ni a mano, que los que hubiera se han borrado, y que tras el Si cada
 * persona manda UN mensaje (antes dos).
 */

const m0001 = leerFichero('supabase/migrations/0001_init.sql');
const m0002 = leerFichero('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0005 = leerFichero('supabase/migrations/0005_tirate_una_cana.sql');
const m0006 = leerFichero('supabase/migrations/0006_cana_visto.sql');
const m0007 = leerFichero('supabase/migrations/0007_avatar_miniatura.sql');
const m0008 = leerFichero('supabase/migrations/0008_cana_solo_la_pregunta.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Ruta publicada', true, '${ADMIN}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

async function conexion(db: PGlite, a: Actor): Promise<string> {
  for (const uid of [ANA, LUIS]) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola')`);
  }
  await a.como(ANA);
  await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
  await a.como(LUIS);
  const [fila] = await filas(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]);
  return fila.connection_id as string;
}

describe('0008_cana_solo_la_pregunta.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0008);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    // Una instancia por llamada: dos seguidas sobre la misma revientan el wasm.
    const plpgsql = (await init()).parsePlpgsql(m0008);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });
});

describe('0008 sobre Postgres real', async () => {
  // La 0008 dos veces: tiene que poder re-ejecutarse como las demas.
  const db = await crearBase([m0001, m0002, m0005, m0006, m0007, m0008, m0008]);
  await db.exec(DATOS);

  it('las funciones de GIF y zumbido ya no existen', async () => {
    await escenario(db, async (a) => {
      const id = await conexion(db, a);
      await a.como(ANA);
      await a.falla(rpc(db, `select * from public.match_send_gif($1, 'salud')`, [id]), /does not exist/);
      await a.falla(rpc(db, 'select * from public.match_send_buzz($1)', [id]), /does not exist/);
    });
  });

  it('un GIF o un zumbido no se pueden colar ni escribiendo en la tabla', async () => {
    await escenario(db, async (a) => {
      const id = await conexion(db, a);
      // Un bloque por intento: `falla` devuelve la identidad al usuario normal
      // despues de cada error esperado, y sin volver a postgres el segundo
      // insert fallaria por permisos y no por el check.
      for (const kind of ['gif', 'buzz']) {
        await a.comoPostgres(async () => {
          await a.falla(
            rpc(db, 'insert into public.match_messages (connection_id, sender_id, kind) values ($1, $2, $3)', [
              id,
              ANA,
              kind,
            ]),
            /match_messages_kind_check/,
          );
        });
      }
    });
  });

  it('el catalogo de GIFs y la columna del zumbido han desaparecido', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(async () => {
        await a.falla(rpc(db, 'select * from public.match_gifs'), /does not exist/);
        await a.falla(rpc(db, 'select last_buzz_at from public.match_connection_members'), /does not exist/);
      });
    });
  });

  it('tras el Si cada persona manda un solo mensaje (D7)', async () => {
    await escenario(db, async (a) => {
      const id = await conexion(db, a);
      await a.como(ANA);
      await db.query('select * from public.match_ask_beer($1)', [id]);
      await a.como(LUIS);
      await db.query(`select * from public.match_answer_beer($1, 'yes')`, [id]);

      await a.como(ANA);
      await db.query('select * from public.match_send_text($1, $2)', [id, 'Estoy en la barra del fondo']);
      await a.falla(rpc(db, 'select * from public.match_send_text($1, $2)', [id, 'Y otro mas']), /TEXT_LIMIT_REACHED/);

      // El limite es por persona: a Luis le queda el suyo.
      await a.como(LUIS);
      await db.query('select * from public.match_send_text($1, $2)', [id, 'Voy para alla']);
      await a.falla(rpc(db, 'select * from public.match_send_text($1, $2)', [id, 'Otro']), /TEXT_LIMIT_REACHED/);

      await a.como(ANA);
      const mensajes = await filas(db, 'select kind, body from public.match_fetch_messages($1)', [id]);
      assert.deepEqual(
        mensajes.map((m) => m.kind),
        ['question', 'answer', 'text', 'text'],
      );
    });
  });

  it('la pantalla de chat ya no recibe la hora del ultimo zumbido', async () => {
    await escenario(db, async (a) => {
      const id = await conexion(db, a);
      await a.como(ANA);
      const [detalle] = await filas(db, 'select * from public.match_get_connection($1)', [id]);
      assert.ok(!('my_last_buzz_at' in detalle), 'my_last_buzz_at sigue en match_get_connection');
      assert.equal(detalle.my_texts_sent, 0);
    });
  });
});
