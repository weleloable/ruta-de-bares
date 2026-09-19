import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0015: los vetos aguantan y a la persona se le dice por que.
 *
 * Lo que hay que asegurar sobre Postgres real, porque es justo lo que fallaba
 * antes: que quien es expulsado no vuelva a entrar canjeando el mismo enlace
 * (que es multiuso y circula por el grupo), ni borrandose la cuenta y
 * registrandose de nuevo con el mismo correo; que desactivar la cana no se
 * deshaga desde la propia app; que sin motivo no haya sancion; y que el aviso
 * le llegue a la persona con el motivo y sin la nota interna.
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
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0015 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA = '00000000-0000-4000-8000-0000000000f2';
/** Luis se borra la cuenta y vuelve con el mismo correo: otro id, mismo veto. */
const LUIS2 = '00000000-0000-4000-8000-00000000000f';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by) values
    ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}'),
    ('${OTRA}', 'Otra ruta', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'), ('${OTRA}', '${LUIS}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

async function expulsar(db: PGlite, motivo = 'Acoso repetido a otra persona') {
  await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, motivo]);
}

/** Un enlace de invitacion a la ruta, creado por el admin. */
async function invitacion(db: PGlite, a: Actor): Promise<string> {
  await a.como(ADMIN);
  const [fila] = await filas(db, 'select * from public.create_route_invite($1, $2, $3)', [RUTA, 10, 8]);
  return fila.invite_token as string;
}

describe('0015_vetos_y_avisos.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0015);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0015);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('las tablas nuevas no tienen privilegios para la app', () => {
    const sinComentarios = m0015.replace(/--.*$/gm, '');
    assert.match(
      sinComentarios,
      /revoke all on table\s+public\.route_bans,\s+public\.account_suspensions,\s+public\.user_notices\s+from anon, authenticated;/,
    );
    assert.match(sinComentarios, /revoke all on table public\.app_secrets from anon, authenticated;/);
  });

  it('la clave del HMAC no se le concede a nadie', () => {
    const concesion = m0015.slice(m0015.indexOf('grant execute on function'));
    assert.doesNotMatch(concesion, /hmac_correo|correo_de|crear_aviso/);
  });
});

describe('0015_vetos_y_avisos.sql: el veto de ruta aguanta', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('sin motivo no hay sancion', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      for (const llamada of [
        `select public.match_admin_remove_from_route($1, $2, '  ')`,
        `select public.match_admin_deactivate($1, '')`,
        `select public.match_admin_suspend($1, '')`,
        `select public.match_admin_remove_photo($1, '')`,
      ]) {
        const params = llamada.includes('$2') ? [LUIS, RUTA] : [LUIS];
        await a.falla(rpc(db, llamada, params), /REASON_REQUIRED/);
      }
    });
  });

  it('expulsar deja veto: el mismo enlace ya no le sirve', async () => {
    await escenario(db, async (a) => {
      const token = await invitacion(db, a);
      await a.como(ADMIN);
      await expulsar(db);

      await a.como(LUIS);
      await a.falla(rpc(db, 'select public.redeem_route_invite($1)', [token]), /ROUTE_BANNED/);

      // Y a quien no esta vetado el mismo enlace le sigue valiendo.
      await a.comoPostgres(() => db.query('delete from public.route_members where route_id = $1 and user_id = $2', [RUTA, ANA]));
      await a.como(ANA);
      const [vuelta] = await filas(db, 'select public.redeem_route_invite($1) as ruta', [token]);
      assert.equal(vuelta.ruta, RUTA);
    });
  });

  it('borrarse la cuenta y volver con el mismo correo no salta el veto', async () => {
    await escenario(db, async (a) => {
      const token = await invitacion(db, a);
      await a.como(ADMIN);
      await expulsar(db);

      // Se borra la cuenta y se registra otra vez con el mismo correo.
      await a.comoPostgres(async () => {
        await db.query('delete from auth.users where id = $1', [LUIS]);
        await db.query(`insert into auth.users (id, email) values ($1, 'luis@example.com')`, [LUIS2]);
      });

      await a.como(LUIS2);
      await a.falla(rpc(db, 'select public.redeem_route_invite($1)', [token]), /ROUTE_BANNED/);
    });
  });

  it('retirar el veto le deja volver a entrar, pero hace falta invitacion', async () => {
    await escenario(db, async (a) => {
      const token = await invitacion(db, a);
      await a.como(ADMIN);
      await expulsar(db);
      const [retirado] = await filas(db, 'select public.match_admin_lift_route_ban($1, $2) as ok', [LUIS, RUTA]);
      assert.equal(retirado.ok, true);
      const [otraVez] = await filas(db, 'select public.match_admin_lift_route_ban($1, $2) as ok', [LUIS, RUTA]);
      assert.equal(otraVez.ok, false, 'retirar un veto que ya no esta no es un fallo, pero no cuenta');

      await a.como(LUIS);
      const [vuelta] = await filas(db, 'select public.redeem_route_invite($1) as ruta', [token]);
      assert.equal(vuelta.ruta, RUTA, 'sin veto, el enlace vuelve a valer');
    });
  });

  it('la purga de la ruta se lleva sus vetos: el HMAC del correo no vive para siempre', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await expulsar(db);
      await a.comoPostgres(() =>
        db.query(`update public.routes set event_date = current_date - 60 where id = $1`, [RUTA]),
      );
      await a.como(ADMIN);
      const [purga] = await filas(db, 'select public.match_admin_purge_route($1) as r', [RUTA]);
      assert.equal((purga.r as { vetos: number }).vetos, 1);
      await a.comoPostgres(async () => {
        assert.equal((await filas(db, 'select 1 from public.route_bans')).length, 0);
      });
    });
  });
});

describe('0015_vetos_y_avisos.sql: el veto de la cana', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('desactivar la cana impide volver a activarla desde la app', async () => {
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);

      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'La foto no era suya']);

      await a.como(LUIS);
      await a.falla(rpc(db, `select public.match_activate()`), /CANA_BLOCKED/);
    });
  });

  it('retirar el veto deja activarla otra vez, pero no la enciende sola', async () => {
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'La foto no era suya']);
      const [ok] = await filas(db, 'select public.match_admin_lift_cana($1) as ok', [LUIS]);
      assert.equal(ok.ok, true);

      await a.como(LUIS);
      const [antes] = await filas(db, 'select * from public.match_get_profile()');
      assert.equal(antes.is_active, false, 'volver a la cana es decision suya');
      await db.query('select public.match_activate()');
      const [despues] = await filas(db, 'select * from public.match_get_profile()');
      assert.equal(despues.is_active, true);
    });
  });
});

describe('0015_vetos_y_avisos.sql: suspender la cuenta', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('le saca de TODAS las rutas y no le deja volver a ninguna', async () => {
    await escenario(db, async (a) => {
      const token = await invitacion(db, a);
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Acoso grave y repetido']);

      await a.comoPostgres(async () => {
        const rutas = await filas(db, 'select route_id from public.route_members where user_id = $1', [LUIS]);
        assert.deepEqual(rutas, [], 'fuera de las dos rutas, no solo de aquella en la que le denunciaron');
      });

      await a.como(LUIS);
      await a.falla(rpc(db, 'select public.redeem_route_invite($1)', [token]), /ACCOUNT_SUSPENDED/);
      await a.falla(rpc(db, `select public.match_activate(true, 'Hola', null, '2026-09-18')`), /ACCOUNT_SUSPENDED/);
    });
  });

  it('pero sigue pudiendo leer su aviso y llevarse o borrar sus datos', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Acoso grave y repetido']);

      await a.como(LUIS);
      const avisos = await filas(db, 'select * from public.my_notices()');
      assert.equal(avisos[0].action, 'cuenta_suspendida');
      assert.equal(avisos[0].reason, 'Acoso grave y repetido');
      // Los derechos de datos no se pueden cortar como castigo.
      assert.ok(await filas(db, 'select public.match_export_my_data()'));
      assert.ok(await filas(db, 'select public.match_delete_my_data()'));
    });
  });

  it('levantar la suspension le deja volver a entrar', async () => {
    await escenario(db, async (a) => {
      const token = await invitacion(db, a);
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Un malentendido']);
      const [ok] = await filas(db, 'select public.match_admin_unsuspend($1) as ok', [LUIS]);
      assert.equal(ok.ok, true);

      await a.como(LUIS);
      const [vuelta] = await filas(db, 'select public.redeem_route_invite($1) as ruta', [token]);
      assert.equal(vuelta.ruta, RUTA);
    });
  });

  it('a un admin no se le suspende por un resbalon', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await a.falla(rpc(db, 'select public.match_admin_suspend($1, $2)', [ADMIN, 'Motivo']), /TARGET_IS_ADMIN/);
    });
  });
});

describe('0015_vetos_y_avisos.sql: el aviso a la persona', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('lleva el motivo y la ruta, y NO la nota interna', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2, $3, null, $4)', [
        LUIS,
        RUTA,
        'Acoso repetido a otra persona',
        'Ojo con esta, es la tercera vez',
      ]);

      await a.como(LUIS);
      const [aviso] = await filas(db, 'select * from public.my_notices()');
      assert.equal(aviso.action, 'expulsada_de_ruta');
      assert.equal(aviso.reason, 'Acoso repetido a otra persona');
      assert.equal(aviso.route_name, 'Compostelana de prueba');
      assert.equal(aviso.read_at, null);
      assert.doesNotMatch(JSON.stringify(aviso), /tercera vez/, 'la nota interna es de los admins, no suya');
    });
  });

  it('la burbujita cuenta los sin leer y marcarlos leidos no se deshace', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'La foto no era suya']);
      await db.query('select public.match_admin_remove_photo($1, $2)', [LUIS, 'La foto no era suya']);

      await a.como(LUIS);
      assert.equal(Number((await filas(db, 'select public.my_notice_count() as n'))[0].n), 2);
      assert.equal(Number((await filas(db, 'select public.mark_notices_read() as n'))[0].n), 2);
      assert.equal(Number((await filas(db, 'select public.my_notice_count() as n'))[0].n), 0);
      const avisos = await filas(db, 'select * from public.my_notices()');
      assert.ok(avisos.every((n) => n.read_at !== null));
    });
  });

  it('cada quien ve solo los suyos', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'La foto no era suya']);
      await a.como(ANA);
      assert.deepEqual(await filas(db, 'select * from public.my_notices()'), []);
    });
  });

  it('my_restrictions dice si estas suspendida y por que no puedes activar la cana', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'La foto no era suya']);

      await a.como(LUIS);
      const [antes] = await filas(db, 'select * from public.my_restrictions()');
      assert.equal(antes.suspended, false);
      assert.equal(antes.cana_blocked, true);
      assert.equal(antes.cana_reason, 'La foto no era suya');

      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Acoso grave']);
      await a.como(LUIS);
      const [despues] = await filas(db, 'select * from public.my_restrictions()');
      assert.equal(despues.suspended, true);
      assert.equal(despues.suspended_reason, 'Acoso grave');
    });
  });

  it('retirar un veto tambien se le comunica', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'La foto no era suya']);
      await db.query('select public.match_admin_lift_cana($1, $2)', [LUIS, 'Revisado, era suya']);

      await a.como(LUIS);
      const avisos = await filas(db, 'select * from public.my_notices()');
      assert.equal(avisos[0].action, 'cana_reactivada', 'el mas reciente va primero');
    });
  });
});

describe('0015_vetos_y_avisos.sql: solo los admins', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('quien no es admin no puede vetar ni retirar vetos ni listarlos', async () => {
    for (const [llamada, params] of [
      [`select public.match_admin_suspend($1, 'x')`, [LUIS]],
      [`select public.match_admin_lift_cana($1)`, [LUIS]],
      [`select public.match_admin_unsuspend($1)`, [LUIS]],
      [`select public.match_admin_lift_route_ban($1, $2)`, [LUIS, RUTA]],
      [`select * from public.match_admin_bans()`, []],
    ] as const) {
      await escenario(db, async (a) => {
        await a.como(ANA);
        await a.falla(rpc(db, llamada, [...params]), /NOT_ADMIN/);
      });
    }
  });

  it('la lista de vetos ensena los tres tipos', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, 'Acoso']);
      await db.query('select public.match_admin_deactivate($1, $2)', [ANA, 'Foto ajena']);
      const tipos = (await filas(db, 'select tipo from public.match_admin_bans()')).map((f) => f.tipo);
      assert.deepEqual([...tipos].sort(), ['cana', 'ruta']);
    });
  });
});
