import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0006 quita el "No me gusta" de Tirate una cana: la unica accion es Me gusta,
 * y abrir una ficha sin darlo (o quitarlo) deja a la persona en "Visto".
 * Las reglas que no cambian (chat, pregunta, textos) las prueba
 * migration-0005.test.ts; aqui solo lo que la 0006 cambia, sobre Postgres real.
 */

const m0001 = leerFichero('supabase/migrations/0001_init.sql');
const m0002 = leerFichero('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0005 = leerFichero('supabase/migrations/0005_tirate_una_cana.sql');
const m0006 = leerFichero('supabase/migrations/0006_cana_visto.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const EVA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${EVA}', 'eva@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Ruta publicada', true, '${ADMIN}');
`;

async function base(migraciones: string[]): Promise<PGlite> {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  return db;
}

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

async function activar(db: PGlite, a: Actor, ...uids: string[]) {
  for (const uid of uids) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola')`);
  }
}

async function meGusta(db: PGlite, a: Actor, uid: string, objetivo: string, dar = true) {
  await a.como(uid);
  const [fila] = await filas(db, 'select * from public.match_set_like($1, $2, $3)', [RUTA, objetivo, dar]);
  return fila as { my_vote: string; connection_id: string | null };
}

async function miVoto(db: PGlite, a: Actor, uid: string, objetivo: string) {
  await a.como(uid);
  return (await filas(db, 'select * from public.match_grid($1)', [RUTA])).find((f) => f.user_id === objetivo);
}

describe('0006_cana_visto.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0006);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0006);
    assert.ok(!plpgsql.error, `error en plpgsql: ${JSON.stringify(plpgsql.error)}`);
  });

  it("'dislike' solo aparece para convertir los votos viejos", () => {
    const usos = [...m0006.replace(/--.*$/gm, '').matchAll(/'dislike'/g)];
    assert.equal(usos.length, 1);
    assert.match(m0006, /update public\.match_votes set value = 'seen', updated_at = now\(\) where value = 'dislike'/);
  });
});

describe('0006 sobre Postgres real', async () => {
  // 0005 dos veces: tiene que poder re-ejecutarse.
  const db = await base([m0001, m0002, m0005, m0006, m0006]);

  it('match_vote ya no existe y el No me gusta no se puede guardar', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.falla(rpc(db, `select * from public.match_vote($1, $2, 'like')`, [RUTA, LUIS]), /does not exist/);
      await a.comoPostgres(async () => {
        await a.falla(
          rpc(db, `insert into public.match_votes (route_id, voter_id, target_id, value) values ($1, $2, $3, 'dislike')`, [
            RUTA,
            ANA,
            LUIS,
          ]),
          /match_votes_value_check/,
        );
      });
    });
  });

  it('abrir la ficha deja a la persona en Visto, sin que ella lo sepa', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      assert.equal((await miVoto(db, a, ANA, LUIS))?.my_vote, null);

      await a.como(ANA);
      await db.query('select public.match_mark_seen($1, $2)', [RUTA, LUIS]);
      await db.query('select public.match_mark_seen($1, $2)', [RUTA, LUIS]);
      assert.equal((await miVoto(db, a, ANA, LUIS))?.my_vote, 'seen');
      assert.equal((await miVoto(db, a, LUIS, ANA))?.my_vote, null, 'Luis puede saber que Ana le ha visto');
    });
  });

  it('abrir la ficha nunca rebaja un Me gusta a Visto', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await meGusta(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query('select public.match_mark_seen($1, $2)', [RUTA, LUIS]);
      assert.equal((await miVoto(db, a, ANA, LUIS))?.my_vote, 'like');
    });
  });

  it('Visto y Me gusta validan como antes: ni a uno mismo ni a quien no lo tiene activado', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA);
      await a.falla(rpc(db, 'select public.match_mark_seen($1, $2)', [RUTA, ANA]), 'INVALID_TARGET');
      await a.falla(rpc(db, 'select public.match_mark_seen($1, $2)', [RUTA, EVA]), 'TARGET_UNAVAILABLE');
      await a.falla(rpc(db, 'select * from public.match_set_like($1, $2, null)', [RUTA, LUIS]), 'INVALID_VOTE');
      await a.como(EVA);
      await a.falla(rpc(db, 'select public.match_mark_seen($1, $2)', [RUTA, ANA]), 'MATCH_NOT_ACTIVE');
    });
  });

  it('Me gusta mutuo abre la conexion; quitarlo la cierra, borra el chat y deja Visto', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      assert.equal((await meGusta(db, a, ANA, LUIS)).connection_id, null);
      const { connection_id: id } = await meGusta(db, a, LUIS, ANA);
      assert.ok(id, 'el Me gusta mutuo no ha abierto conexion');
      await a.como(ANA);
      await db.query(`select * from public.match_send_gif($1, 'salud')`, [id]);

      const quitado = await meGusta(db, a, ANA, LUIS, false);
      assert.deepEqual(quitado, { my_vote: 'seen', connection_id: null });
      assert.equal((await miVoto(db, a, LUIS, ANA))?.connection_id, null);
      const mensajes = await a.comoPostgres(() =>
        filas(db, 'select id from public.match_messages where connection_id = $1', [id]),
      );
      assert.equal(mensajes.length, 0);

      const devuelto = await meGusta(db, a, ANA, LUIS);
      assert.equal(devuelto.connection_id, id, 'la pareja deberia conservar su conexion');
    });
  });

  it('tras un No a la cerveza, quien rechaza queda en Visto y quien pregunto conserva su Me gusta (D2)', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await meGusta(db, a, ANA, LUIS);
      const { connection_id: id } = await meGusta(db, a, LUIS, ANA);
      await a.como(ANA);
      await db.query('select * from public.match_ask_beer($1)', [id]);
      await a.como(LUIS);
      const [respuesta] = await filas(db, `select * from public.match_answer_beer($1, 'no')`, [id]);
      assert.deepEqual(respuesta, { question_state: 'rejected', is_open: false });

      assert.equal((await miVoto(db, a, LUIS, ANA))?.my_vote, 'seen');
      const luisVistoPorAna = await miVoto(db, a, ANA, LUIS);
      assert.equal(luisVistoPorAna?.my_vote, 'like');
      assert.equal(luisVistoPorAna?.connection_id, null);
    });
  });
});

describe('0005 sobre un proyecto que ya tenia votos de la 0003', () => {
  it("los No me gusta pasan a Visto y los Me gusta y conexiones siguen igual", async () => {
    const db = await base([m0001, m0002, m0005]);
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS, EVA);
      await a.como(ANA);
      await db.query(`select * from public.match_vote($1, $2, 'dislike')`, [RUTA, EVA]);
      await db.query(`select * from public.match_vote($1, $2, 'like')`, [RUTA, LUIS]);
      await a.como(LUIS);
      await db.query(`select * from public.match_vote($1, $2, 'like')`, [RUTA, ANA]);

      await a.comoPostgres(() => db.exec(m0006));

      assert.equal((await miVoto(db, a, ANA, EVA))?.my_vote, 'seen');
      const luis = await miVoto(db, a, ANA, LUIS);
      assert.equal(luis?.my_vote, 'like');
      assert.ok(luis?.connection_id, 'la conexion de antes se ha perdido');
    });
  });
});
