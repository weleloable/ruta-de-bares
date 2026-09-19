import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0016 cierra el agujero de denunciar y bloquear desde fuera.
 *
 * Lo que hay que asegurar sobre Postgres real: que una cuenta suspendida deja
 * de poder denunciar y bloquear, que no se denuncia en una ruta en la que no
 * estas, y -- igual de importante -- que NO se ha roto nada de lo que ya
 * funcionaba: denunciar copia los mensajes, bloquear cierra la conexion y quita
 * el Me gusta, y se puede denunciar a quien ya no esta en la ruta.
 */

const migraciones = [
  '0001_init.sql',
  '0002_guard_role_sql_editor.sql',
  '0003_nombre_unico.sql',
  '0004_invitaciones_por_ruta.sql',
  '0005_tirate_una_cana.sql',
  '0006_cana_visto.sql',
  '0007_avatar_miniatura.sql',
  '0008_cana_solo_la_pregunta.sql',
  '0009_cana_bloqueos_denuncias.sql',
  '0010_cana_consentimiento_y_datos.sql',
  '0011_cana_chat_sin_abrir.sql',
  '0012_cana_pertenencia_real.sql',
  '0013_cana_alertas_admin.sql',
  '0014_admin_expulsar_de_ruta.sql',
  '0015_vetos_y_avisos.sql',
  '0016_denunciar_exige_estar_dentro.sql',
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0016 = migraciones.at(-1) as string;

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
  values ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
  -- EVA no entra en la ruta a proposito.
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

async function activar(db: PGlite, a: Actor, ...uids: string[]) {
  for (const uid of uids) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);
  }
}

/** Ana y Luis conectan, se ofrecen la cana y Luis escribe. */
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

describe('0016: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0016);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0016);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('bloquear conserva el lock y el orden canonico del par', () => {
    // Si esto se pierde, dos bloqueos a la vez dejan la conexion a medias.
    const cuerpo = m0016.slice(m0016.indexOf('function public.match_block'));
    assert.match(cuerpo, /match_lock_pair/);
    assert.match(cuerpo, /least\(v_uid, p_target_id\)/);
    assert.match(cuerpo, /greatest\(v_uid, p_target_id\)/);
  });
});

describe('0016: quien no esta dentro no denuncia', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('denunciar en una ruta en la que no estas se rechaza', async () => {
    await escenario(db, async (a) => {
      await a.como(EVA);
      await a.falla(
        rpc(db, `select public.match_report($1, $2, 'acoso', 'Desde fuera', null, false)`, [RUTA, LUIS]),
        /NOT_PARTICIPANT/,
      );
    });
  });

  it('una cuenta suspendida no puede denunciar ni bloquear', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [ANA, 'Acoso grave']);
      await a.como(ANA);
      await a.falla(
        rpc(db, `select public.match_report($1, $2, 'acoso', 'Sigo aqui', null, false)`, [RUTA, LUIS]),
        /ACCOUNT_SUSPENDED/,
      );
    });
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [ANA, 'Acoso grave']);
      await a.como(ANA);
      await a.falla(rpc(db, 'select public.match_block($1)', [LUIS]), /ACCOUNT_SUSPENDED/);
    });
  });

  it('pero desbloquear sigue funcionando estando suspendida', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query('select public.match_block($1)', [LUIS]);
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [ANA, 'Acoso grave']);
      await a.como(ANA);
      // Quitarse un bloqueo de encima no hace dano a nadie.
      await db.query('select public.match_unblock($1)', [LUIS]);
      await a.comoPostgres(async () => {
        assert.equal((await filas(db, 'select 1 from public.match_blocks')).length, 0);
      });
    });
  });
});

describe('0016: lo que ya funcionaba sigue funcionando', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('denunciar copia los mensajes de quien denuncias y le bloquea', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const conexion = await conexionConTexto(db, a);
      await a.como(ANA);
      const [fila] = await filas(
        db,
        `select public.match_report($1, $2, 'acoso', 'Un texto desagradable', $3, true) as id`,
        [RUTA, LUIS, conexion],
      );
      await a.como(ADMIN);
      const copiados = await filas(db, 'select * from public.match_admin_report_messages($1)', [fila.id]);
      assert.equal(copiados.length, 2, 'la pregunta y el texto de Luis');
      await a.comoPostgres(async () => {
        const bloqueos = await filas(db, 'select 1 from public.match_blocks where blocker_id = $1', [ANA]);
        assert.equal(bloqueos.length, 1, 'denunciar bloquea');
        const abiertas = await filas(db, 'select 1 from public.match_connections where is_open');
        assert.equal(abiertas.length, 0, 'y cierra la conexion');
      });
    });
  });

  it('se puede denunciar a quien ya no esta en la ruta', async () => {
    // Importante: expulsarle no puede dejar sin via a quien todavia no habia
    // denunciado lo que paso antes.
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, 'Acoso']);
      await a.como(ANA);
      const [fila] = await filas(
        db,
        `select public.match_report($1, $2, 'acoso', 'Lo que hizo antes de que le echaran', null, false) as id`,
        [RUTA, LUIS],
      );
      assert.ok(fila.id, 'la denuncia se crea igual');
    });
  });

  it('bloquear sigue cerrando la conexion y quitando el Me gusta', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await conexionConTexto(db, a);
      await a.como(ANA);
      await db.query('select public.match_block($1)', [LUIS]);
      await a.comoPostgres(async () => {
        const [voto] = await filas(db, 'select value from public.match_votes where voter_id = $1 and target_id = $2', [ANA, LUIS]);
        assert.equal(voto.value, 'seen');
        assert.equal((await filas(db, 'select 1 from public.match_messages')).length, 0);
      });
    });
  });

  it('quien esta dentro y no sancionada denuncia con normalidad', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      const [fila] = await filas(
        db,
        `select public.match_report($1, $2, 'foto', 'Esa foto no es suya', null, false) as id`,
        [RUTA, LUIS],
      );
      assert.ok(fila.id);
    });
  });
});
