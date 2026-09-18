import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0009: consentimiento guardado al activar, y poder llevarte o borrar tus
 * datos. Lo que hay que asegurar sobre Postgres real es que activar sin
 * aceptar falla, que borrar no deja rastro tuyo pero SI deja los bloqueos que
 * otras personas te pusieron y las denuncias sobre ti, y que la purga de una
 * ruta respeta el plazo.
 */

const m0001 = leerFichero('supabase/migrations/0001_init.sql');
const m0002 = leerFichero('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0004 = leerFichero('supabase/migrations/0004_tirate_una_cana.sql');
const m0005 = leerFichero('supabase/migrations/0005_cana_visto.sql');
const m0006 = leerFichero('supabase/migrations/0006_avatar_miniatura.sql');
const m0007 = leerFichero('supabase/migrations/0007_cana_solo_la_pregunta.sql');
const m0008 = leerFichero('supabase/migrations/0008_cana_bloqueos_denuncias.sql');
const m0009 = leerFichero('supabase/migrations/0009_cana_consentimiento_y_datos.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const EVA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const VERSION = '2026-09-18';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${EVA}', 'eva@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta publicada', true, '${ADMIN}', current_date - 60);
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);
const uno = async (db: PGlite, sql: string, params: unknown[] = []) => (await filas(db, sql, params))[0];

async function activar(db: PGlite, a: Actor, ...uids: string[]) {
  for (const uid of uids) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola', null, $1)`, [VERSION]);
  }
}

describe('0009_cana_consentimiento_y_datos.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0009);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    // Una instancia por llamada: dos seguidas sobre la misma revientan el wasm.
    const plpgsql = (await init()).parsePlpgsql(m0009);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });
});

describe('0009 sobre Postgres real', async () => {
  // La 0009 dos veces: tiene que poder re-ejecutarse como las demas.
  const db = await crearBase([m0001, m0002, m0004, m0005, m0006, m0007, m0008, m0009, m0009]);
  await db.exec(DATOS);

  it('activar la primera vez exige aceptar las condiciones', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, `select public.match_activate(true, 'Hola')`), /CONSENT_REQUIRED/);
      await a.falla(rpc(db, `select public.match_activate(true, 'Hola', null, '   ')`), /CONSENT_REQUIRED/);
      await db.query(`select public.match_activate(true, 'Hola', null, $1)`, [VERSION]);

      const perfil = await uno(db, 'select * from public.match_get_profile()');
      assert.equal(perfil.consent_version, VERSION);
      assert.equal(perfil.is_active, true);
    });
  });

  it('volver de una pausa no vuelve a pedirlo, y el primer si no se pisa', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`select public.match_activate(true, 'Hola', null, $1)`, [VERSION]);
      await db.query('select public.match_deactivate()');
      // Sin version: ya hay consentimiento guardado, asi que no falla.
      await db.query(`select public.match_activate()`);
      const perfil = await uno(db, 'select * from public.match_get_profile()');
      assert.equal(perfil.is_active, true);
      assert.equal(perfil.consent_version, VERSION, 'la version guardada es la del primer si');

      await db.query(`select public.match_activate(true, null, null, 'otra-version')`);
      const despues = await uno(db, 'select * from public.match_get_profile()');
      assert.equal(despues.consent_version, VERSION);
    });
  });

  it('la descarga trae lo tuyo y no los mensajes de la otra persona', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
      await a.como(LUIS);
      const conexion = (await uno(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]))
        .connection_id as string;
      await db.query('select * from public.match_ask_beer($1)', [conexion]);
      await a.como(ANA);
      await db.query(`select * from public.match_answer_beer($1, 'yes')`, [conexion]);
      await db.query('select * from public.match_send_text($1, $2)', [conexion, 'Nos vemos en la barra']);
      await a.como(LUIS);
      await db.query('select * from public.match_send_text($1, $2)', [conexion, 'Voy para alla']);

      await a.como(ANA);
      const { match_export_my_data: datos } = (await uno(db, 'select public.match_export_my_data()')) as {
        match_export_my_data: Record<string, unknown>;
      };
      const perfil = datos.perfil as Record<string, unknown>;
      assert.equal(perfil.bio, 'Hola');
      assert.equal(perfil.consent_version, VERSION);
      assert.equal((datos.me_gusta_y_vistos as unknown[]).length, 1);
      assert.equal((datos.conexiones as unknown[]).length, 1);
      const mios = datos.mensajes_que_enviaste as { tipo: string; texto: string | null }[];
      assert.deepEqual(mios.map((m) => m.texto), [null, 'Nos vemos en la barra'], 'su respuesta y su texto, no los de Luis');
    });
  });

  it('borrar no deja perfil, votos, conexiones ni mensajes', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
      await a.como(LUIS);
      const conexion = (await uno(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]))
        .connection_id as string;
      await db.query('select * from public.match_ask_beer($1)', [conexion]);

      await a.como(ANA);
      const { match_delete_my_data: cuentas } = (await uno(db, 'select public.match_delete_my_data()')) as {
        match_delete_my_data: Record<string, number>;
      };
      assert.equal(cuentas.conexiones, 1);
      assert.equal(cuentas.votos, 2, 'los dos sentidos: lo que votaste y lo que votaron de ti');

      const perfil = await uno(db, 'select * from public.match_get_profile()');
      assert.equal(perfil.is_active, false);
      assert.equal(perfil.has_activated_before, false, 'vuelve a ser la primera vez');

      await a.comoPostgres(async () => {
        for (const consulta of [
          `select count(*) n from public.match_profiles where user_id = '${ANA}'`,
          `select count(*) n from public.match_profile_tags where user_id = '${ANA}'`,
          `select count(*) n from public.match_votes where voter_id = '${ANA}' or target_id = '${ANA}'`,
          `select count(*) n from public.match_connections where '${ANA}' in (user_a, user_b)`,
          `select count(*) n from public.match_messages where connection_id = '${conexion}'`,
        ]) {
          assert.equal(Number((await uno(db, consulta)).n), 0, consulta);
        }
      });
    });
  });

  it('borrar respeta los bloqueos que te pusieron y las denuncias sobre ti', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(LUIS);
      // Luis bloquea y denuncia a Ana; Ana borra sus datos despues.
      await db.query(`select public.match_report($1, $2, 'acoso', 'Se puso pesada', null, true)`, [RUTA, ANA]);

      await a.como(ANA);
      await db.query('select public.match_delete_my_data()');

      await a.comoPostgres(async () => {
        const [bloqueo] = await filas(db, 'select * from public.match_blocks where blocked_id = $1', [ANA]);
        assert.ok(bloqueo, 'el bloqueo de Luis tiene que seguir');
        const [denuncia] = await filas(db, 'select * from public.match_reports where reported_id = $1', [ANA]);
        assert.ok(denuncia, 'la denuncia sobre Ana tiene que seguir');
      });
    });
  });

  it('la purga de una ruta solo la hacen admins y respeta el plazo', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
      await a.falla(rpc(db, 'select public.match_admin_purge_route($1)', [RUTA]), /NOT_ADMIN/);

      await a.como(ADMIN);
      // El evento fue hace 60 dias: con un plazo de 90 todavia no toca.
      await a.falla(rpc(db, 'select public.match_admin_purge_route($1, 90)', [RUTA]), /ROUTE_TOO_RECENT/);

      const { match_admin_purge_route: cuentas } = (await uno(db, 'select public.match_admin_purge_route($1, 30)', [
        RUTA,
      ])) as { match_admin_purge_route: Record<string, number> };
      assert.equal(cuentas.votos, 1);

      await a.comoPostgres(async () => {
        assert.equal(Number((await uno(db, `select count(*) n from public.match_votes where route_id = '${RUTA}'`)).n), 0);
        // Los perfiles sobreviven: valen para la ruta siguiente.
        assert.equal(Number((await uno(db, 'select count(*) n from public.match_profiles')).n), 2);
      });
    });
  });
});
