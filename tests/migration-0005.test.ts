<<<<<<< HEAD
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0005 es "Tirate una cana": decide quien ve a quien, cuando hay conexion y
 * que se puede decir en el chat. Todas las reglas viven en SQL, asi que se
 * prueban ejecutandolas sobre Postgres real (PGlite), no leyendo el fichero.
 * Reglas y decisiones: docs/TIRATE-UNA-CANA.md.
 */

const m0001 = leerFichero('supabase/migrations/0001_init.sql');
const m0002 = leerFichero('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0005 = leerFichero('supabase/migrations/0005_tirate_una_cana.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const EVA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BORRADOR = '00000000-0000-4000-8000-0000000000f2';

const TABLAS_PRIVADAS = [
  'match_profiles',
  'match_profile_tags',
  'match_votes',
  'match_connections',
  'match_connection_members',
  'match_messages',
];

async function baseConDatos(): Promise<PGlite> {
  // 0005 dos veces: tiene que poder re-ejecutarse como las anteriores.
  const db = await crearBase([m0001, m0002, m0005, m0005]);
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ANA}', 'ana@example.com'),
      ('${LUIS}', 'luis@example.com'),
      ('${EVA}', 'eva@example.com'),
      ('${ADMIN}', 'admin@example.com');
    update public.profiles set display_name = 'Ana' where id = '${ANA}';
    update public.profiles set display_name = 'Luis' where id = '${LUIS}';
    update public.profiles set display_name = 'Eva' where id = '${EVA}';
    update public.profiles set role = 'admin' where id = '${ADMIN}';
    insert into public.routes (id, name, is_published, created_by) values
      ('${RUTA}', 'Ruta publicada', true, '${ADMIN}'),
      ('${BORRADOR}', 'Borrador', false, '${ADMIN}');
  `);
  return db;
}

// --- Atajos para que los escenarios se lean como el uso de la app ----------

type Fila = Record<string, unknown>;

const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;

async function activar(db: PGlite, a: Actor, uid: string, bio = 'Hola', tags: string[] = []) {
  await a.como(uid);
  await db.query('select public.match_activate(true, $1, $2)', [bio, tags]);
}

async function votar(db: PGlite, a: Actor, uid: string, objetivo: string, valor: 'like' | 'dislike') {
  await a.como(uid);
  const [fila] = await filas(db, 'select * from public.match_vote($1, $2, $3)', [RUTA, objetivo, valor]);
  return fila as { my_vote: string; connection_id: string | null };
}

/** Activa a los dos, se dan me gusta y devuelve la conexion. */
async function conectar(db: PGlite, a: Actor, x: string, y: string): Promise<string> {
  await activar(db, a, x);
  await activar(db, a, y);
  await votar(db, a, x, y, 'like');
  const { connection_id } = await votar(db, a, y, x, 'like');
  assert.ok(connection_id, 'el me gusta mutuo no ha abierto conexion');
  return connection_id;
}

async function grilla(db: PGlite, a: Actor, uid: string, ruta = RUTA) {
  await a.como(uid);
  return filas(db, 'select * from public.match_grid($1)', [ruta]);
}

async function conexion(db: PGlite, a: Actor, uid: string, id: string) {
  await a.como(uid);
  const [fila] = await filas(db, 'select * from public.match_get_connection($1)', [id]);
  return fila;
}

const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

describe('0005_tirate_una_cana.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    // Una instancia del parser por llamada: con un fichero de este tamano,
    // parse() seguido de parsePlpgsql() sobre la MISMA instancia revienta
    // dentro del wasm (comprobado; por separado las dos dan ok).
    const resultado = (await init()).parse(m0005);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0005);
    assert.ok(!plpgsql.error, `error en plpgsql: ${JSON.stringify(plpgsql.error)}`);
    assert.equal(plpgsql.plpgsql_funcs?.length, 21, 'faltan cuerpos plpgsql por validar');
  });

  it('no usa is_admin: los admins no tienen via especial a votos ni chats (D10)', () => {
    assert.ok(!/is_admin/.test(m0005.replace(/--.*$/gm, '')));
  });
});

describe('0005 sobre Postgres real', async () => {
  const db = await baseConDatos();

  it('RLS activo en todas las tablas match_*', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'match\\_%'`,
    );
    assert.equal(rows.length, 8);
    for (const fila of rows) assert.ok(fila.relrowsecurity, `${fila.relname} sin RLS`);
  });

  it('la app no lee ni escribe las tablas privadas; los catalogos solo se leen', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA);
      for (const tabla of TABLAS_PRIVADAS) {
        await a.falla(rpc(db, `select * from public.${tabla}`), /permission denied/);
      }
      await a.falla(
        rpc(db, `insert into public.match_votes (route_id, voter_id, target_id, value) values ($1, $2, $3, 'like')`, [
          RUTA,
          ANA,
          LUIS,
        ]),
        /permission denied/,
      );
      assert.equal((await filas(db, 'select id from public.match_tags')).length, 8);
      assert.equal((await filas(db, 'select id from public.match_gifs')).length, 8);
      await a.falla(rpc(db, `insert into public.match_gifs (id, label) values ('x', 'x')`), /permission denied/);
    });
  });

  it('sin sesion no se puede llamar a ninguna funcion de la feature', async () => {
    await escenario(db, async (a) => {
      await a.anonimo();
      await a.falla(rpc(db, 'select * from public.match_grid($1)', [RUTA]), /permission denied for function/);
      await a.falla(rpc(db, 'select public.match_activate(true, $1)', ['Hola']), /permission denied for function/);
    });
  });

  it('las funciones internas no se pueden llamar desde la API', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, 'select public.match_close_connection($1)', [RUTA]), /permission denied for function/);
      await a.falla(rpc(db, `select public.match_save_bio_and_tags($1, 'x', '{}')`, [ANA]), /permission denied/);
    });
  });

  it('activar la primera vez exige mayoria de edad y frase; las etiquetas son opcionales', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, `select public.match_activate(false, 'Hola')`), 'ADULT_CONFIRMATION_REQUIRED');
      await a.falla(rpc(db, `select public.match_activate(true, null)`), 'BIO_REQUIRED');
      await a.falla(rpc(db, `select public.match_activate(true, '   ')`), 'BIO_REQUIRED');
      await a.falla(rpc(db, 'select public.match_activate(true, $1)', ['x'.repeat(121)]), 'BIO_TOO_LONG');
      const seis = ['etiqueta-1', 'etiqueta-2', 'etiqueta-3', 'etiqueta-4', 'etiqueta-5', 'etiqueta-6'];
      await a.falla(rpc(db, `select public.match_activate(true, 'Hola', $1)`, [seis]), 'TOO_MANY_TAGS');
      await a.falla(rpc(db, `select public.match_activate(true, 'Hola', $1)`, [['no-existe']]), 'TAG_NOT_FOUND');

      await db.query(`select public.match_activate(true, '  Hola  ', $1)`, [['etiqueta-2', 'etiqueta-1', 'etiqueta-1']]);
      const [perfil] = await filas(db, 'select * from public.match_get_profile()');
      assert.deepEqual(perfil, {
        is_active: true,
        bio: 'Hola',
        tag_ids: ['etiqueta-1', 'etiqueta-2'],
        adult_confirmed: true,
        has_activated_before: true,
      });
    });
  });

  it('desactivar es una pausa: al reactivar no se vuelve a pedir nada y el perfil sigue', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, 'Primera frase', ['etiqueta-3']);
      await db.query('select public.match_deactivate()');
      assert.equal((await filas(db, 'select * from public.match_get_profile()'))[0].is_active, false);
      await db.query('select public.match_activate()');
      const [perfil] = await filas(db, 'select * from public.match_get_profile()');
      assert.equal(perfil.is_active, true);
      assert.equal(perfil.bio, 'Primera frase');

      await db.query(`select public.match_update_profile('Otra frase', '{}')`);
      const [editado] = await filas(db, 'select * from public.match_get_profile()');
      assert.equal(editado.bio, 'Otra frase');
      assert.deepEqual(editado.tag_ids, []);

      await a.como(EVA);
      await a.falla(rpc(db, `select public.match_update_profile('Hola')`), 'MATCH_PROFILE_MISSING');
    });
  });

  it('la grilla exige tenerlo activado y participar en la ruta', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, 'select * from public.match_grid($1)', [RUTA]), 'MATCH_NOT_ACTIVE');
      await activar(db, a, ANA);
      await a.falla(rpc(db, 'select * from public.match_grid($1)', [BORRADOR]), 'NOT_PARTICIPANT');
    });
  });

  it('la grilla solo ensena a quien lo tiene activado, sin datos de mas', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, LUIS, 'Soy Luis', ['etiqueta-4']);
      await activar(db, a, EVA);
      await db.query('select public.match_deactivate()');
      await activar(db, a, ANA);

      const filasAna = await grilla(db, a, ANA);
      assert.deepEqual(
        filasAna.map((f) => f.display_name),
        ['Luis'],
      );
      assert.deepEqual(Object.keys(filasAna[0]).sort(), [
        'avatar_url',
        'bio',
        'connection_id',
        'display_name',
        'my_vote',
        'tag_ids',
        'unread_count',
        'user_id',
      ]);
      assert.equal(filasAna[0].bio, 'Soy Luis');
      assert.deepEqual(filasAna[0].tag_ids, ['etiqueta-4']);
    });
  });

  it('nadie ve los votos que le dan; el me gusta mutuo abre la conexion', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA);
      await activar(db, a, LUIS);
      await activar(db, a, EVA);

      const deLuis = await votar(db, a, LUIS, ANA, 'like');
      assert.deepEqual(deLuis, { my_vote: 'like', connection_id: null });

      const luisVistoPorAna = (await grilla(db, a, ANA)).find((f) => f.user_id === LUIS);
      assert.equal(luisVistoPorAna?.my_vote, null, 'Ana puede ver el me gusta de Luis');
      assert.equal(luisVistoPorAna?.connection_id, null);

      const deAna = await votar(db, a, ANA, LUIS, 'like');
      assert.ok(deAna.connection_id);
      const anaVistaPorLuis = (await grilla(db, a, LUIS)).find((f) => f.user_id === ANA);
      assert.equal(anaVistaPorLuis?.connection_id, deAna.connection_id);

      // Sin votar primero (D12): Eva antes que Luis en la grilla de Ana.
      assert.deepEqual(
        (await grilla(db, a, ANA)).map((f) => f.display_name),
        ['Eva', 'Luis'],
      );
    });
  });

  it('votos invalidos: a uno mismo, valor desconocido o a quien no lo tiene activado', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA);
      await a.falla(rpc(db, `select * from public.match_vote($1, $2, 'like')`, [RUTA, ANA]), 'INVALID_TARGET');
      await a.falla(rpc(db, `select * from public.match_vote($1, $2, 'love')`, [RUTA, LUIS]), 'INVALID_VOTE');
      await a.falla(rpc(db, `select * from public.match_vote($1, $2, 'like')`, [RUTA, EVA]), 'TARGET_UNAVAILABLE');
    });
  });

  it('cambiar a No me gusta cierra la conexion y borra el chat; volver a gustar la reabre sin reiniciar la pregunta', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query(`select * from public.match_send_gif($1, 'salud')`, [id]);
      await db.query('select * from public.match_ask_beer($1)', [id]);

      await votar(db, a, LUIS, ANA, 'dislike');
      assert.equal((await grilla(db, a, ANA)).find((f) => f.user_id === LUIS)?.connection_id, null);
      const mensajes = await a.comoPostgres(() =>
        filas(db, 'select id from public.match_messages where connection_id = $1', [id]),
      );
      assert.equal(mensajes.length, 0, 'el chat no se ha borrado al cerrar');
      await a.falla(rpc(db, 'select * from public.match_fetch_messages($1)', [id]), 'CONNECTION_CLOSED');

      const reabierta = await votar(db, a, LUIS, ANA, 'like');
      assert.equal(reabierta.connection_id, id, 'la pareja deberia conservar su conexion');
      assert.equal((await conexion(db, a, ANA, id)).question_state, 'pending');
      assert.equal((await filas(db, 'select * from public.match_fetch_messages($1)', [id])).length, 0);
    });
  });

  it('el chat es solo de los dos: ni otra persona ni un admin lo leen', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a, ANA, LUIS);
      await activar(db, a, EVA);
      await a.falla(rpc(db, 'select * from public.match_fetch_messages($1)', [id]), 'CONNECTION_NOT_FOUND');
      await activar(db, a, ADMIN);
      await a.falla(rpc(db, 'select * from public.match_fetch_messages($1)', [id]), 'CONNECTION_NOT_FOUND');
      await a.falla(rpc(db, 'select * from public.match_messages'), /permission denied/);
    });
  });

  it('GIFs solo del catalogo, zumbido cada 30 s y contadores de no leidos', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a, ANA, LUIS);
      await a.como(ANA);
      await a.falla(rpc(db, `select * from public.match_send_gif($1, 'no-existe')`, [id]), 'GIF_NOT_FOUND');
      await db.query(`select * from public.match_send_gif($1, 'salud')`, [id]);
      await db.query('select * from public.match_send_buzz($1)', [id]);
      await a.falla(rpc(db, 'select * from public.match_send_buzz($1)', [id]), 'BUZZ_TOO_SOON');
      await a.comoPostgres(() =>
        db.query(
          `update public.match_connection_members set last_buzz_at = now() - interval '31 seconds'
            where connection_id = $1 and user_id = $2`,
          [id, ANA],
        ),
      );
      await db.query('select * from public.match_send_buzz($1)', [id]);
      await a.falla(rpc(db, `select * from public.match_send_text($1, 'hola')`, [id]), 'TEXT_LOCKED');

      assert.equal((await grilla(db, a, LUIS)).find((f) => f.user_id === ANA)?.unread_count, 3);
      const [bandeja] = await filas(db, 'select * from public.match_inbox($1)', [RUTA]);
      assert.equal(bandeja.unread_count, 3);
      assert.equal(bandeja.last_kind, 'buzz');

      const recibidos = await filas(db, 'select * from public.match_fetch_messages($1)', [id]);
      assert.deepEqual(
        recibidos.map((m) => m.kind),
        ['gif', 'buzz', 'buzz'],
      );
      assert.equal((await grilla(db, a, LUIS)).find((f) => f.user_id === ANA)?.unread_count, 0);
    });
  });

  it('la pregunta: una viva, responde quien la recibe, y aplazar tiene espera y limite', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a, ANA, LUIS);
      const pasar31Minutos = () =>
        a.comoPostgres(() =>
          db.query(
            `update public.match_connections set question_answered_at = now() - interval '31 minutes' where id = $1`,
            [id],
          ),
        );

      await a.como(ANA);
      await db.query('select * from public.match_ask_beer($1)', [id]);
      await a.falla(rpc(db, `select * from public.match_answer_beer($1, 'yes')`, [id]), 'CANNOT_ANSWER_OWN_QUESTION');
      await a.como(LUIS);
      await a.falla(rpc(db, 'select * from public.match_ask_beer($1)', [id]), 'QUESTION_ALREADY_PENDING');
      await a.falla(rpc(db, `select * from public.match_answer_beer($1, 'meh')`, [id]), 'INVALID_ANSWER');
      await db.query(`select * from public.match_answer_beer($1, 'later')`, [id]);
      await a.falla(rpc(db, `select * from public.match_answer_beer($1, 'yes')`, [id]), 'NO_PENDING_QUESTION');

      await a.como(ANA);
      await a.falla(rpc(db, 'select * from public.match_ask_beer($1)', [id]), 'QUESTION_TOO_SOON');
      await pasar31Minutos();
      // Cualquiera de los dos puede volver a preguntar (D4).
      await a.como(LUIS);
      await db.query('select * from public.match_ask_beer($1)', [id]);
      await a.como(ANA);
      await db.query(`select * from public.match_answer_beer($1, 'later')`, [id]);
      await pasar31Minutos();
      await a.falla(rpc(db, 'select * from public.match_ask_beer($1)', [id]), 'QUESTION_LIMIT_REACHED');

      const estado = await conexion(db, a, ANA, id);
      assert.equal(estado.question_state, 'postponed');
      assert.equal(estado.postpone_count, 2);
    });
  });

  it('la bandeja pone primero lo que espera tu respuesta', async () => {
    await escenario(db, async (a) => {
      const conAna = await conectar(db, a, ANA, LUIS);
      const conEva = await conectar(db, a, EVA, LUIS);
      await a.como(ANA);
      await db.query('select * from public.match_ask_beer($1)', [conAna]);
      await a.como(EVA);
      await db.query(`select * from public.match_send_gif($1, 'salud')`, [conEva]);

      await a.como(LUIS);
      const bandeja = await filas(db, 'select * from public.match_inbox($1)', [RUTA]);
      assert.deepEqual(
        bandeja.map((f) => f.connection_id),
        [conAna, conEva],
      );
    });
  });

  it('tras el Si, dos textos de hasta 120 caracteres por persona, tambien tras cerrar y reabrir (D7)', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query('select * from public.match_ask_beer($1)', [id]);
      await a.como(LUIS);
      const [respuesta] = await filas(db, `select * from public.match_answer_beer($1, 'yes')`, [id]);
      assert.deepEqual(respuesta, { question_state: 'accepted', is_open: true });

      await a.como(ANA);
      await a.falla(rpc(db, `select * from public.match_send_text($1, '   ')`, [id]), 'TEXT_EMPTY');
      await a.falla(rpc(db, 'select * from public.match_send_text($1, $2)', [id, 'x'.repeat(121)]), 'TEXT_TOO_LONG');
      await db.query(`select * from public.match_send_text($1, 'En la barra')`, [id]);
      await db.query(`select * from public.match_send_text($1, 'Llevo gorro')`, [id]);
      await a.falla(rpc(db, `select * from public.match_send_text($1, 'Una mas')`, [id]), 'TEXT_LIMIT_REACHED');
      await a.como(LUIS);
      await db.query(`select * from public.match_send_text($1, 'Voy')`, [id]);
      await db.query('select * from public.match_send_text($1, $2)', [id, 'x'.repeat(120)]);
      await a.falla(rpc(db, `select * from public.match_send_text($1, 'Otra')`, [id]), 'TEXT_LIMIT_REACHED');
      await a.falla(rpc(db, 'select * from public.match_ask_beer($1)', [id]), 'QUESTION_ALREADY_ANSWERED');

      await votar(db, a, ANA, LUIS, 'dislike');
      await votar(db, a, ANA, LUIS, 'like');
      await a.falla(rpc(db, `select * from public.match_send_text($1, 'Truco')`, [id]), 'TEXT_LIMIT_REACHED');
    });
  });

  it('el No cierra la conexion: quien rechaza pasa a No me gusta y quien pregunto conserva su Me gusta (D2)', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query(`select * from public.match_send_gif($1, 'salud')`, [id]);
      await db.query('select * from public.match_ask_beer($1)', [id]);
      await a.como(LUIS);
      const [respuesta] = await filas(db, `select * from public.match_answer_beer($1, 'no')`, [id]);
      assert.deepEqual(respuesta, { question_state: 'rejected', is_open: false });

      assert.equal((await grilla(db, a, LUIS)).find((f) => f.user_id === ANA)?.my_vote, 'dislike');
      const luisVistoPorAna = (await grilla(db, a, ANA)).find((f) => f.user_id === LUIS);
      assert.equal(luisVistoPorAna?.my_vote, 'like');
      assert.equal(luisVistoPorAna?.connection_id, null);
      const mensajes = await a.comoPostgres(() =>
        filas(db, 'select id from public.match_messages where connection_id = $1', [id]),
      );
      assert.equal(mensajes.length, 0);

      // Si Luis cambia de idea y vuelven a conectar, la pregunta ya no se repite (D3).
      await votar(db, a, LUIS, ANA, 'like');
      await a.como(ANA);
      await a.falla(rpc(db, 'select * from public.match_ask_beer($1)', [id]), 'QUESTION_ALREADY_ANSWERED');
    });
  });

  it('desactivar oculta a la persona de grillas y chats ajenos al momento, y reactivar lo devuelve', async () => {
    await escenario(db, async (a) => {
      const id = await conectar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query('select public.match_deactivate()');

      assert.equal((await grilla(db, a, LUIS)).length, 0);
      assert.equal((await filas(db, 'select * from public.match_inbox($1)', [RUTA])).length, 0);
      await a.falla(rpc(db, `select * from public.match_send_gif($1, 'salud')`, [id]), 'CONNECTION_UNAVAILABLE');
      await a.falla(rpc(db, `select * from public.match_vote($1, $2, 'like')`, [RUTA, ANA]), 'TARGET_UNAVAILABLE');

      await a.como(ANA);
      await a.falla(rpc(db, 'select * from public.match_grid($1)', [RUTA]), 'MATCH_NOT_ACTIVE');
      await db.query('select public.match_activate()');
      assert.equal((await grilla(db, a, LUIS))[0].connection_id, id);
    });
  });
});

describe('is_route_participant: contrato con la pertenencia a rutas', async () => {
  it('la provisional deja participar en rutas publicadas y no en borradores', async () => {
    const db = await baseConDatos();
    await escenario(db, async (a) => {
      await a.como(ANA);
      const [fila] = await filas(
        db,
        'select public.is_route_participant($1, $2) as publicada, public.is_route_participant($3, $2) as borrador',
        [RUTA, ANA, BORRADOR],
      );
      assert.deepEqual(fila, { publicada: true, borrador: false });
    });
  });

  it('si la migracion de pertenencia ya la definio, la 0005 no la pisa', async () => {
    const db = await crearBase([m0001, m0002]);
    await db.exec(`
      create function public.is_route_participant(p_route_id uuid, p_user_id uuid)
      returns boolean language sql stable as $$ select false $$;
    `);
    await db.exec(m0005);
    await db.exec(m0005);
    const { rows } = await db.query<{ cuerpo: string }>(
      `select prosrc as cuerpo from pg_proc where proname = 'is_route_participant'`,
    );
    assert.equal(rows.length, 1);
    assert.match(rows[0].cuerpo, /select false/);
  });
});
=======
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0004 quita el "No me gusta" de Tirate una cana: la unica accion es Me gusta,
 * y abrir una ficha sin darlo (o quitarlo) deja a la persona en "Visto".
 * Las reglas que no cambian (chat, pregunta, textos) las prueba
 * migration-0003.test.ts; aqui solo lo que la 0005 cambia, sobre Postgres real.
 */

const m0001 = leerFichero('supabase/migrations/0001_init.sql');
const m0002 = leerFichero('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0004 = leerFichero('supabase/migrations/0004_tirate_una_cana.sql');
const m0004 = leerFichero('supabase/migrations/0005_cana_visto.sql');

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

describe('0005_cana_visto.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0004);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0004);
    assert.ok(!plpgsql.error, `error en plpgsql: ${JSON.stringify(plpgsql.error)}`);
  });

  it("'dislike' solo aparece para convertir los votos viejos", () => {
    const usos = [...m0004.replace(/--.*$/gm, '').matchAll(/'dislike'/g)];
    assert.equal(usos.length, 1);
    assert.match(m0004, /update public\.match_votes set value = 'seen', updated_at = now\(\) where value = 'dislike'/);
  });
});

describe('0005 sobre Postgres real', async () => {
  // 0004 dos veces: tiene que poder re-ejecutarse.
  const db = await base([m0001, m0002, m0004, m0004, m0004]);

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

describe('0004 sobre un proyecto que ya tenia votos de la 0003', () => {
  it("los No me gusta pasan a Visto y los Me gusta y conexiones siguen igual", async () => {
    const db = await base([m0001, m0002, m0004]);
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS, EVA);
      await a.como(ANA);
      await db.query(`select * from public.match_vote($1, $2, 'dislike')`, [RUTA, EVA]);
      await db.query(`select * from public.match_vote($1, $2, 'like')`, [RUTA, LUIS]);
      await a.como(LUIS);
      await db.query(`select * from public.match_vote($1, $2, 'like')`, [RUTA, ANA]);

      await a.comoPostgres(() => db.exec(m0004));

      assert.equal((await miVoto(db, a, ANA, EVA))?.my_vote, 'seen');
      const luis = await miVoto(db, a, ANA, LUIS);
      assert.equal(luis?.my_vote, 'like');
      assert.ok(luis?.connection_id, 'la conexion de antes se ha perdido');
    });
  });
});
>>>>>>> f992d72 (Tirate una cana: solo Me gusta, y "Visto" en lugar de No me gusta)
