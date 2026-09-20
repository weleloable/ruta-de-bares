import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0021: borrar tu propia cuenta y todos tus datos.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. quien llama se lleva la cuenta Y todo lo que cuelga de ella, y nada de
 *     otra persona;
 *  2. borrarse NO limpia una sancion: el veto de ruta y la suspension siguen
 *     aplicandose a quien vuelve con el mismo correo (0015, 0017);
 *  3. un admin no puede, y sin sesion tampoco;
 *  4. la funcion no se le concede a `anon`.
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
  '0017_el_rastro_sobrevive.sql',
  '0018_lista_de_moderaciones.sql',
  '0019_activar_la_cana_arreglado.sql',
  '0020_foto_perfil_con_revision.sql',
  '0021_borrar_mi_cuenta.sql',
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0021 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = '00000000-0000-4000-8000-0000000000b1';
/** Luis se borra la cuenta y vuelve con el mismo correo. */
const LUIS2 = '00000000-0000-4000-8000-00000000000f';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const cuenta = async (db: PGlite, sql: string, params: unknown[] = []): Promise<number> =>
  Number((await filas(db, sql, params))[0].n);

async function activar(db: PGlite, a: Actor, ...uids: string[]) {
  for (const uid of uids) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);
  }
}

/** Ana y Luis se dan Me gusta, se abre el chat y Luis escribe. */
async function chatEntreAnaYLuis(db: PGlite, a: Actor): Promise<string> {
  await a.como(ANA);
  await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
  await a.como(LUIS);
  const [c] = await filas(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]);
  const conexion = c.connection_id as string;
  await db.query('select * from public.match_ask_beer($1)', [conexion]);
  await a.como(ANA);
  await db.query(`select * from public.match_answer_beer($1, 'yes')`, [conexion]);
  await a.como(LUIS);
  await db.query('select * from public.match_send_text($1, $2)', [conexion, 'Hola Ana']);
  return conexion;
}

describe('0021: forma', () => {
  it('la gramatica es valida y el cuerpo plpgsql compila', async () => {
    const resultado = (await init()).parse(m0021);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0021);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('solo la puede llamar quien tiene sesion: se le quita a public y anon', () => {
    const sinComentarios = m0021.replace(/--.*$/gm, '');
    assert.match(
      sinComentarios,
      /revoke all on function public\.delete_my_account_blockers\(\), public\.delete_my_account\(\) from public, anon;/,
    );
    assert.match(
      sinComentarios,
      /grant execute on function public\.delete_my_account_blockers\(\), public\.delete_my_account\(\) to authenticated;/,
    );
  });

  it('toma el candado de la fila de profiles ANTES de mirar los impedimentos (carrera con una denuncia)', () => {
    const sql = m0021.replace(/--.*$/gm, '');
    const iCandado = sql.indexOf('for update;');
    const iImpedimentos = sql.indexOf('v_bloqueos := public.delete_my_account_blockers();');
    assert.ok(iCandado > -1 && iImpedimentos > -1 && iCandado < iImpedimentos);
  });

  it('no recibe el id de quien se borra: solo puede ser la persona que llama', () => {
    assert.match(m0021, /create or replace function public\.delete_my_account\(\)/);
    assert.match(m0021.replace(/--.*$/gm, ''), /delete from auth\.users where id = v_uid;/);
  });
});

describe('0021: borrarse la cuenta', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('se lleva la cuenta y todo lo que cuelga de ella', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await chatEntreAnaYLuis(db, a);
      await a.comoPostgres(async () => {
        await db.query(
          `insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at)
           values ($1, $2, 0, 'Bar Uno', 40.48, -3.36, now(), now() + interval '2 hours')`,
          [BAR, RUTA],
        );
        await db.query(
          `insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m) values ($1, $2, 40.48, -3.36, 5)`,
          [LUIS, BAR],
        );
      });

      await a.como(LUIS);
      await db.query('select public.delete_my_account()');

      await a.comoPostgres(async () => {
        assert.equal(await cuenta(db, 'select count(*) n from auth.users where id = $1', [LUIS]), 0, 'la cuenta');
        assert.equal(await cuenta(db, 'select count(*) n from public.profiles where id = $1', [LUIS]), 0, 'el perfil');
        assert.equal(await cuenta(db, 'select count(*) n from public.stamps where user_id = $1', [LUIS]), 0, 'los sellos');
        assert.equal(await cuenta(db, 'select count(*) n from public.route_members where user_id = $1', [LUIS]), 0, 'la pertenencia a rutas');
        assert.equal(await cuenta(db, 'select count(*) n from public.match_profiles where user_id = $1', [LUIS]), 0, 'el perfil de la cana');
        assert.equal(
          await cuenta(db, 'select count(*) n from public.match_votes where voter_id = $1 or target_id = $1', [LUIS]),
          0,
          'los votos, en los dos sentidos',
        );
        assert.equal(
          await cuenta(db, 'select count(*) n from public.match_connections where $1 in (user_a, user_b)', [LUIS]),
          0,
          'las conexiones',
        );
        assert.equal(await cuenta(db, 'select count(*) n from public.match_messages'), 0, 'los mensajes del chat');
      });
    });
  });

  it('no toca a nadie mas: Ana sigue con su cuenta, su perfil y su pertenencia', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(LUIS);
      await db.query('select public.delete_my_account()');

      await a.comoPostgres(async () => {
        assert.equal(await cuenta(db, 'select count(*) n from auth.users where id = $1', [ANA]), 1);
        assert.equal(await cuenta(db, 'select count(*) n from public.profiles where id = $1', [ANA]), 1);
        assert.equal(await cuenta(db, 'select count(*) n from public.match_profiles where user_id = $1', [ANA]), 1);
        assert.equal(await cuenta(db, 'select count(*) n from public.route_members where user_id = $1', [ANA]), 1);
        assert.equal(await cuenta(db, 'select count(*) n from public.routes where id = $1', [RUTA]), 1, 'la ruta sigue');
      });
    });
  });

  it('borra las solicitudes de foto y los avisos de quien se va', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(async () => {
        await db.query(
          `insert into public.user_notices (user_id, action, reason) values ($1, 'foto_retirada', 'motivo')`,
          [LUIS],
        );
        await db.query(
          `insert into public.avatar_requests (user_id, foto_path, thumb_path) values ($1, $2, $3)`,
          [LUIS, `${LUIS}/a.jpg`, `${LUIS}/a-t.jpg`],
        );
        assert.equal(await cuenta(db, 'select count(*) n from public.avatar_requests where user_id = $1', [LUIS]), 1);
      });
      await a.como(LUIS);
      await db.query('select public.delete_my_account()');
      await a.comoPostgres(async () => {
        assert.equal(await cuenta(db, 'select count(*) n from public.user_notices where user_id = $1', [LUIS]), 0);
        assert.equal(await cuenta(db, 'select count(*) n from public.avatar_requests where user_id = $1', [LUIS]), 0);
      });
    });
  });
});

describe('0021: borrarse no esquiva una sancion', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('una cuenta suspendida se puede borrar, y quien vuelve con el mismo correo sigue suspendida', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_suspend($1, 'Acoso reiterado', null, 'nota interna')`, [LUIS]);

      await a.como(LUIS);
      await db.query('select public.delete_my_account()');

      await a.comoPostgres(async () => {
        await db.query(`insert into auth.users (id, email) values ($1, 'luis@example.com')`, [LUIS2]);
        const [fila] = await filas(db, 'select public.esta_suspendida($1) as s', [LUIS2]);
        assert.equal(fila.s, true, 'la suspension aguanta el borrado y el nuevo alta');
      });
    });
  });

  it('un veto de ruta tambien aguanta', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_remove_from_route($1, $2, 'Se colo otra vez')`, [LUIS, RUTA]);

      await a.como(LUIS);
      await db.query('select public.delete_my_account()');

      await a.comoPostgres(async () => {
        await db.query(`insert into auth.users (id, email) values ($1, 'luis@example.com')`, [LUIS2]);
        const [fila] = await filas(db, 'select public.esta_vetada_de_ruta($1, $2) as v', [RUTA, LUIS2]);
        assert.equal(fila.v, true, 'quien vuelve con el mismo correo sigue vetada en esa ruta');
      });
    });
  });
});

const blockers = async (db: PGlite): Promise<string[]> =>
  (await filas(db, 'select public.delete_my_account_blockers() as b'))[0].b as string[];
const existe = async (db: PGlite, a: Actor, uid: string): Promise<boolean> =>
  a.comoPostgres(async () => (await cuenta(db, 'select count(*) n from auth.users where id = $1', [uid])) === 1);

describe('0021: quien no puede', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('un administrador no puede borrarse, y no pierde nada', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      assert.deepEqual(await blockers(db), ['ADMIN_CANNOT_DELETE', 'OWNS_ROUTES']);
      await a.falla(() => db.query('select public.delete_my_account()'), 'ADMIN_CANNOT_DELETE');
      assert.ok(await existe(db, a, ADMIN));
      await a.comoPostgres(async () => {
        assert.equal(await cuenta(db, 'select count(*) n from public.routes where id = $1', [RUTA]), 1);
      });
    });
  });

  it('quien creo una ruta sin ser admin (lo fue) recibe un codigo, no un error crudo de clave ajena', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(async () => {
        await db.query(
          `insert into public.routes (id, name, is_published, created_by) values ($1, 'Ruta de Ana', false, $2)`,
          ['00000000-0000-4000-8000-0000000000f2', ANA],
        );
      });
      await a.como(ANA);
      assert.deepEqual(await blockers(db), ['OWNS_ROUTES']);
      await a.falla(() => db.query('select public.delete_my_account()'), /^(?!.*foreign key).*OWNS_ROUTES/s);
      assert.ok(await existe(db, a, ANA));
    });
  });

  it('una denuncia sin resolver bloquea el borrado; al resolverla, se puede', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const conexion = await chatEntreAnaYLuis(db, a);
      await a.como(ANA);
      const [{ id }] = await filas(
        db,
        `select public.match_report($1, $2, 'acoso', 'Se puso pesado', $3, false) as id`,
        [RUTA, LUIS, conexion],
      );

      await a.como(LUIS);
      assert.deepEqual(await blockers(db), ['HAS_OPEN_REPORTS']);
      await a.falla(() => db.query('select public.delete_my_account()'), 'HAS_OPEN_REPORTS');
      assert.ok(await existe(db, a, LUIS), 'la cuenta sigue: no se esquiva una denuncia borrandose');

      await a.como(ADMIN);
      await db.query(`select public.match_admin_resolve($1, 'sin_accion', '')`, [id]);

      await a.como(LUIS);
      assert.deepEqual(await blockers(db), []);
      await db.query('select public.delete_my_account()');
      assert.equal(await existe(db, a, LUIS), false);
    });
  });

  it('quien es la denunciante si puede borrarse aunque su denuncia siga abierta', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const conexion = await chatEntreAnaYLuis(db, a);
      await a.como(ANA);
      await db.query(`select public.match_report($1, $2, 'acoso', 'Se puso pesado', $3, false)`, [RUTA, LUIS, conexion]);
      assert.deepEqual(await blockers(db), []);
      await db.query('select public.delete_my_account()');
      assert.equal(await existe(db, a, ANA), false);
    });
  });

  it('la caña desactivada por un admin bloquea el borrado; al levantarla, se puede', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, LUIS);
      await a.como(ADMIN);
      await db.query(`select public.match_admin_deactivate($1, 'Mal comportamiento')`, [LUIS]);

      await a.como(LUIS);
      assert.deepEqual(await blockers(db), ['CANA_BLOCKED']);
      await a.falla(() => db.query('select public.delete_my_account()'), 'CANA_BLOCKED');
      assert.ok(await existe(db, a, LUIS), 'no se esquiva el veto de la caña borrandose y volviendo');

      await a.como(ADMIN);
      await db.query(`select public.match_admin_lift_cana($1, '')`, [LUIS]);
      await a.como(LUIS);
      assert.deepEqual(await blockers(db), []);
      await db.query('select public.delete_my_account()');
      assert.equal(await existe(db, a, LUIS), false);
    });
  });

  it('borrar "mis datos de la cana" ya no levanta un veto de la cana (hueco de la 0010)', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, LUIS);
      await a.como(ADMIN);
      await db.query(`select public.match_admin_deactivate($1, 'Mal comportamiento')`, [LUIS]);

      await a.como(LUIS);
      await db.query('select public.match_delete_my_data()');

      await a.comoPostgres(async () => {
        const [perfil] = await filas(
          db,
          'select blocked_at, is_active, bio, consent_at, adult_confirmed_at from public.match_profiles where user_id = $1',
          [LUIS],
        );
        assert.ok(perfil, 'la fila con el veto se queda');
        assert.notEqual(perfil.blocked_at, null, 'y el veto sigue puesto');
        assert.equal(perfil.is_active, false);
        assert.equal(perfil.bio, '', 'lo demas se vacia');
        assert.equal(perfil.consent_at, null);
        assert.equal(perfil.adult_confirmed_at, null);
      });

      // Y no puede volver a activarla.
      await a.como(LUIS);
      await a.falla(() => db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`), 'CANA_BLOCKED');
      assert.deepEqual(await blockers(db), ['CANA_BLOCKED']);
    });
  });

  it('sin veto, match_delete_my_data sigue borrando el perfil entero', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, LUIS);
      await a.como(LUIS);
      await db.query('select public.match_delete_my_data()');
      await a.comoPostgres(async () => {
        assert.equal(await cuenta(db, 'select count(*) n from public.match_profiles where user_id = $1', [LUIS]), 0);
      });
    });
  });

  it('una persona normal no tiene impedimentos', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      assert.deepEqual(await blockers(db), []);
    });
  });

  it('sin sesion no se puede llamar a ninguna de las dos (permiso, no logica)', async () => {
    await escenario(db, async (a) => {
      await a.anonimo();
      await a.falla(() => db.query('select public.delete_my_account()'), /permission denied/);
      await a.falla(() => db.query('select public.delete_my_account_blockers()'), /permission denied/);
    });
  });

  it('con rol authenticated pero sin uid, la propia funcion lo rechaza', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      // Un JWT valido del rol authenticated pero sin `sub`: auth.uid() es NULL.
      const sinSub = async () =>
        db.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
      await a.falla(async () => {
        await sinSub();
        await db.query('select public.delete_my_account()');
      }, 'NOT_AUTHENTICATED');
      await a.falla(async () => {
        await sinSub();
        await db.query('select public.delete_my_account_blockers()');
      }, 'NOT_AUTHENTICATED');
    });
  });
});
