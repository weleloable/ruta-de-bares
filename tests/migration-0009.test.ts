import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0009 anade bloquear y denunciar. Lo que hay que asegurar sobre Postgres real:
 * que un bloqueo os esconde a los dos y no se puede sortear, que la denuncia se
 * lleva copiados los mensajes (bloquear borra el chat, asi que sin copia la
 * prueba desaparece) y que el panel de administracion, que construye otra
 * persona, tiene lo que necesita sin poder leer ningun chat (D10).
 */

const m0001 = leerFichero('supabase/migrations/0001_init.sql');
const m0002 = leerFichero('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0005 = leerFichero('supabase/migrations/0005_tirate_una_cana.sql');
const m0006 = leerFichero('supabase/migrations/0006_cana_visto.sql');
const m0007 = leerFichero('supabase/migrations/0007_avatar_miniatura.sql');
const m0008 = leerFichero('supabase/migrations/0008_cana_solo_la_pregunta.sql');
const m0009 = leerFichero('supabase/migrations/0009_cana_bloqueos_denuncias.sql');

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
  update public.profiles set avatar_url = 'https://ejemplo.test/foto.jpg',
                             avatar_thumb_url = 'https://ejemplo.test/foto-mini.jpg'
   where id = '${LUIS}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Ruta publicada', true, '${ADMIN}');
`;

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

/** Ana y Luis conectan y Luis manda su texto tras el Si de Ana. */
async function conexionConTexto(db: PGlite, a: Actor): Promise<string> {
  await a.como(ANA);
  await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
  await a.como(LUIS);
  const [fila] = await filas(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]);
  const id = fila.connection_id as string;

  await db.query('select * from public.match_ask_beer($1)', [id]);
  await a.como(ANA);
  await db.query(`select * from public.match_answer_beer($1, 'yes')`, [id]);
  await a.como(LUIS);
  await db.query('select * from public.match_send_text($1, $2)', [id, 'Un mensaje que molesta']);
  return id;
}

describe('0009_cana_bloqueos_denuncias.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0009);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    // Una instancia por llamada: dos seguidas sobre la misma revientan el wasm.
    const plpgsql = (await init()).parsePlpgsql(m0009);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('las tablas nuevas no tienen privilegios para la app', () => {
    const sinComentarios = m0009.replace(/--.*$/gm, '');
    assert.match(
      sinComentarios,
      /revoke all on table\s+public\.match_blocks,\s+public\.match_reports,\s+public\.match_report_messages,\s+public\.match_moderation_log\s+from anon, authenticated;/,
    );
  });
});

describe('0009 sobre Postgres real', async () => {
  // La 0009 dos veces: tiene que poder re-ejecutarse como las demas.
  const db = await crearBase([m0001, m0002, m0005, m0006, m0007, m0008, m0009, m0009]);
  await db.exec(DATOS);

  it('bloquear os esconde a los dos, en la grilla y en la bandeja', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS, EVA);
      await conexionConTexto(db, a);

      await a.como(ANA);
      await db.query('select public.match_block($1)', [LUIS]);

      const grillaAna = await filas(db, 'select user_id from public.match_grid($1)', [RUTA]);
      assert.deepEqual(grillaAna.map((f) => f.user_id), [EVA], 'Ana sigue viendo a Luis');
      assert.equal((await filas(db, 'select * from public.match_inbox($1)', [RUTA])).length, 0);

      await a.como(LUIS);
      const grillaLuis = await filas(db, 'select user_id from public.match_grid($1)', [RUTA]);
      assert.deepEqual(grillaLuis.map((f) => f.user_id), [EVA], 'quien bloquea tambien desaparece');
      assert.equal((await filas(db, 'select * from public.match_inbox($1)', [RUTA])).length, 0);
    });
  });

  it('bloquear cierra la conexion, borra el chat y baja tu Me gusta a Visto', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const id = await conexionConTexto(db, a);

      await a.como(ANA);
      await db.query('select public.match_block($1)', [LUIS]);

      await a.comoPostgres(async () => {
        const [conexion] = await filas(db, 'select is_open from public.match_connections where id = $1', [id]);
        assert.equal(conexion.is_open, false);
        const [{ mensajes }] = await filas(db, 'select count(*) mensajes from public.match_messages where connection_id = $1', [id]);
        assert.equal(Number(mensajes), 0, 'el chat tiene que borrarse, como al quitar el Me gusta');
        const [voto] = await filas(db, 'select value from public.match_votes where voter_id = $1 and target_id = $2', [ANA, LUIS]);
        assert.equal(voto.value, 'seen');
      });
    });
  });

  it('con un bloqueo no se puede votar, ni marcar Visto, ni abrir el chat', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const id = await conexionConTexto(db, a);
      await a.como(ANA);
      await db.query('select public.match_block($1)', [LUIS]);

      await a.falla(rpc(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]), /BLOCKED/);
      await a.falla(rpc(db, 'select public.match_mark_seen($1, $2)', [RUTA, LUIS]), /BLOCKED/);
      await a.falla(rpc(db, 'select * from public.match_get_connection($1)', [id]), /CONNECTION_CLOSED|BLOCKED/);

      // Y la persona bloqueada tampoco puede darle la vuelta desde su lado.
      await a.como(LUIS);
      await a.falla(rpc(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]), /BLOCKED/);
      await a.falla(rpc(db, 'select * from public.match_send_text($1, $2)', [id, 'Hola?']), /CONNECTION_CLOSED|BLOCKED/);
    });
  });

  it('desbloquear no devuelve la conexion: hay que volver a dar Me gusta', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await conexionConTexto(db, a);
      await a.como(ANA);
      await db.query('select public.match_block($1)', [LUIS]);
      assert.equal((await filas(db, 'select * from public.match_blocked_list()')).length, 1);

      await db.query('select public.match_unblock($1)', [LUIS]);
      assert.equal((await filas(db, 'select * from public.match_blocked_list()')).length, 0);
      const [luis] = await filas(db, 'select my_vote, connection_id from public.match_grid($1)', [RUTA]);
      assert.equal(luis.my_vote, 'seen');
      assert.equal(luis.connection_id, null);
    });
  });

  it('denunciar se lleva copiados los mensajes, que sobreviven al borrado del chat', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const id = await conexionConTexto(db, a);

      await a.como(ANA);
      const [{ match_report: denuncia }] = await filas(
        db,
        `select public.match_report($1, $2, 'acoso', 'Me ha escrito algo desagradable', $3, true) as match_report`,
        [RUTA, LUIS, id],
      );

      await a.comoPostgres(async () => {
        const copias = await filas(
          db,
          'select kind, body, sender_id from public.match_report_messages where report_id = $1 order by created_at',
          [denuncia],
        );
        // Todo lo que mando la persona denunciada en ese chat: su pregunta y su
        // texto. Nada de la denunciante, que no hace falta para revisarlo.
        assert.deepEqual(copias.map((c) => c.kind), ['question', 'text']);
        assert.equal(copias.at(-1)?.body, 'Un mensaje que molesta');
        assert.ok(copias.every((c) => c.sender_id === LUIS));
        const [{ vivos }] = await filas(db, 'select count(*) vivos from public.match_messages where connection_id = $1', [id]);
        assert.equal(Number(vivos), 0, 'el chat se borro al bloquear, la copia no');
      });
    });
  });

  it('no se puede denunciar dos veces a la misma persona sin resolver la primera', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query(`select public.match_report($1, $2, 'foto', '', null, false)`, [RUTA, LUIS]);
      await a.falla(
        rpc(db, `select public.match_report($1, $2, 'acoso', '', null, false)`, [RUTA, LUIS]),
        /REPORT_ALREADY_PENDING/,
      );
    });
  });

  it('una denuncia sin conexion no copia nada, y el motivo tiene que ser valido', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, EVA);
      await a.como(ANA);
      await a.falla(rpc(db, `select public.match_report($1, $2, 'porque_si', '', null, false)`, [RUTA, EVA]), /INVALID_REASON/);
      await a.falla(rpc(db, `select public.match_report($1, $2, 'foto', '', null, false)`, [RUTA, ANA]), /INVALID_TARGET/);
    });
  });
});

describe('0009: contrato con el panel de administracion', async () => {
  const db = await crearBase([m0001, m0002, m0005, m0006, m0007, m0008, m0009]);
  await db.exec(DATOS);

  it('quien no es admin no entra a nada del panel', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query(`select public.match_report($1, $2, 'foto', 'La foto no es suya', null, false)`, [RUTA, LUIS]);

      for (const llamada of [
        'select * from public.match_admin_reports()',
        'select * from public.match_admin_reports_sin_avisar()',
        `select public.match_admin_remove_photo($1)`,
      ]) {
        await a.falla(rpc(db, llamada, llamada.includes('$1') ? [LUIS] : []), /NOT_ADMIN/);
      }
    });
  });

  it('un admin ve la denuncia, la marca avisada y la resuelve, y queda apuntado', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const id = await conexionConTexto(db, a);
      await a.como(ANA);
      const [{ match_report: denuncia }] = await filas(
        db,
        `select public.match_report($1, $2, 'acoso', 'Un texto desagradable', $3, true) as match_report`,
        [RUTA, LUIS, id],
      );

      await a.como(ADMIN);
      const pendientes = await filas(db, 'select * from public.match_admin_reports()');
      assert.equal(pendientes.length, 1);
      assert.equal(pendientes[0].reported_name, 'luis');
      assert.equal(Number(pendientes[0].mensajes), 2, 'el panel ve cuantos mensajes acompanan la denuncia');

      // Lo que leeria el sistema de avisos.
      assert.equal((await filas(db, 'select * from public.match_admin_reports_sin_avisar()')).length, 1);
      await db.query('select public.match_admin_mark_notified($1)', [denuncia]);
      assert.equal((await filas(db, 'select * from public.match_admin_reports_sin_avisar()')).length, 0);

      const copiados = await filas(db, 'select * from public.match_admin_report_messages($1)', [denuncia]);
      assert.equal(copiados.length, 2);
      assert.equal(copiados.at(-1)?.body, 'Un mensaje que molesta');

      await db.query('select public.match_admin_deactivate($1, $2, $3)', [LUIS, denuncia, 'Reincidente']);
      await db.query(`select public.match_admin_resolve($1, 'cana_desactivada', 'Desactivada y avisado')`, [denuncia]);

      const [resuelta] = await filas(db, 'select * from public.match_admin_reports(false)');
      assert.equal(resuelta.status, 'resuelta');
      assert.equal(resuelta.resolution, 'cana_desactivada');
      assert.equal(resuelta.handled_by, ADMIN);

      await a.comoPostgres(async () => {
        const [perfil] = await filas(db, 'select is_active from public.match_profiles where user_id = $1', [LUIS]);
        assert.equal(perfil.is_active, false);
        const acciones = await filas(db, 'select action from public.match_moderation_log order by created_at');
        assert.deepEqual(acciones.map((f) => f.action), ['cana_desactivada', 'denuncia_resuelta']);
      });
    });
  });

  it('retirar la foto la quita de las dos columnas y lo apunta', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, LUIS);
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_photo($1, null, $2)', [LUIS, 'Foto de otra persona']);
      await a.comoPostgres(async () => {
        const [perfil] = await filas(db, 'select avatar_url, avatar_thumb_url from public.profiles where id = $1', [LUIS]);
        assert.equal(perfil.avatar_url, null);
        assert.equal(perfil.avatar_thumb_url, null);
        const [log] = await filas(db, `select action, note from public.match_moderation_log where action = 'foto_retirada'`);
        assert.equal(log.note, 'Foto de otra persona');
      });
    });
  });

  it('el panel no puede leer los chats: solo lo copiado en la denuncia (D10)', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await conexionConTexto(db, a);
      await a.como(ADMIN);
      await a.falla(rpc(db, 'select * from public.match_messages'), /permission denied/);
      await a.falla(rpc(db, 'select * from public.match_connections'), /permission denied/);
    });
  });
});
