import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0014 anade expulsar de una ruta: la medida para cuando retirar la foto o
 * apagar la cana se quedan cortas.
 *
 * Lo que hay que asegurar sobre Postgres real: que expulsar deja a esa persona
 * fuera de verdad (de la ruta Y de la cana de esa ruta), que no se lleva por
 * delante sus sellos ni su cuenta, y que no se puede usar contra un admin.
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
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0014 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = '00000000-0000-4000-8000-0000000000b1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}');
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at)
  values ('${BAR}', '${RUTA}', 0, 'Bar primero', 42.88, -8.54, now() - interval '1 hour', now() + interval '5 hours');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
  -- Luis ya ha sellado: expulsarle no puede borrar lo que paso.
  insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m)
  values ('${LUIS}', '${BAR}', 42.88, -8.54, 5);
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

/** Ana denuncia a Luis. Devuelve el id de la denuncia. */
async function denuncia(db: PGlite, a: Actor): Promise<string> {
  await a.como(ANA);
  const [fila] = await filas(
    db,
    `select public.match_report($1, $2, 'acoso', 'Se puso muy pesado', null, false) as id`,
    [RUTA, LUIS],
  );
  return fila.id as string;
}

describe('0014_admin_expulsar_de_ruta.sql: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0014);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0014);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('is_admin_de no se le concede a nadie de la app: es de uso interno', () => {
    assert.match(m0014, /revoke all on function public\.is_admin_de\(uuid\) from public, anon, authenticated;/);
    const concesion = m0014.slice(m0014.indexOf('grant execute on function'));
    assert.doesNotMatch(concesion, /is_admin_de/);
  });
});

describe('0014_admin_expulsar_de_ruta.sql: expulsar de una ruta', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('quien no es admin no puede expulsar a nadie', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(
        rpc(db, 'select public.match_admin_remove_from_route($1, $2)', [LUIS, RUTA]),
        /NOT_ADMIN/,
      );
    });
  });

  it('expulsar le saca de la ruta, lo apunta, y repetirlo no vuelve a apuntarlo', async () => {
    await escenario(db, async (a) => {
      const id = await denuncia(db, a);
      await a.como(ADMIN);

      const [primera] = await filas(
        db,
        'select public.match_admin_remove_from_route($1, $2, $3, $4) as fuera',
        [LUIS, RUTA, id, 'Reincidente'],
      );
      assert.equal(primera.fuera, true);

      const [segunda] = await filas(
        db,
        'select public.match_admin_remove_from_route($1, $2, $3, $4) as fuera',
        [LUIS, RUTA, id, 'Otra vez'],
      );
      assert.equal(segunda.fuera, false, 'ya no estaba: no es un fallo, pero tampoco pasa nada');

      await a.comoPostgres(async () => {
        const dentro = await filas(db, 'select 1 from public.route_members where route_id = $1 and user_id = $2', [RUTA, LUIS]);
        assert.equal(dentro.length, 0);
        const apuntes = await filas(
          db,
          `select note from public.match_moderation_log where action = 'expulsada_de_ruta'`,
        );
        assert.deepEqual(apuntes.map((f) => f.note), ['Reincidente'], 'solo se apunta la expulsion que ocurrio');
      });
    });
  });

  it('quien es expulsado deja de ver la ruta y desaparece de su cana', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);

      // Antes: Ana le ve en la grilla y Luis ve la ruta.
      await a.como(ANA);
      const antes = await filas(db, 'select user_id from public.match_grid($1)', [RUTA]);
      assert.deepEqual(antes.map((f) => f.user_id), [LUIS]);
      await a.como(LUIS);
      assert.equal((await filas(db, 'select id from public.routes where id = $1', [RUTA])).length, 1);

      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2)', [LUIS, RUTA]);

      // Despues: ni grilla ni ruta.
      await a.como(ANA);
      assert.deepEqual(await filas(db, 'select user_id from public.match_grid($1)', [RUTA]), []);
      await a.como(LUIS);
      assert.equal((await filas(db, 'select id from public.routes where id = $1', [RUTA])).length, 0);
      await a.falla(rpc(db, 'select * from public.match_grid($1)', [RUTA]), /NOT_PARTICIPANT/);
    });
  });

  it('no borra la cuenta ni los sellos: es historial, no un permiso', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2)', [LUIS, RUTA]);
      await a.comoPostgres(async () => {
        assert.equal((await filas(db, 'select id from public.profiles where id = $1', [LUIS])).length, 1);
        assert.equal((await filas(db, 'select id from public.stamps where user_id = $1', [LUIS])).length, 1);
      });
    });
  });

  it('a un admin no se le puede expulsar por un resbalon', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(() => db.query('insert into public.route_members (route_id, user_id) values ($1, $2)', [RUTA, ADMIN]));
      await a.como(ADMIN);
      await a.falla(
        rpc(db, 'select public.match_admin_remove_from_route($1, $2)', [ADMIN, RUTA]),
        /TARGET_IS_ADMIN/,
      );
    });
  });

  it('el ticket dice si sigue en la ruta, y deja de decirlo al expulsarle', async () => {
    await escenario(db, async (a) => {
      const id = await denuncia(db, a);
      await a.como(ADMIN);
      const [antes] = await filas(db, 'select * from public.match_admin_report($1)', [id]);
      assert.equal(antes.reported_in_route, true);
      assert.equal(antes.reported_is_admin, false);

      await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, id]);
      const [despues] = await filas(db, 'select * from public.match_admin_report($1)', [id]);
      assert.equal(despues.reported_in_route, false);
    });
  });

  it('ahora una denuncia se puede cerrar como expulsada de la ruta', async () => {
    await escenario(db, async (a) => {
      const id = await denuncia(db, a);
      await a.como(ADMIN);
      await db.query(`select public.match_admin_resolve($1, 'expulsada_de_ruta', 'Acoso repetido')`, [id]);
      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [id]);
      assert.equal(ticket.status, 'resuelta');
      assert.equal(ticket.resolution, 'expulsada_de_ruta');
    });
  });

  it('una resolucion inventada se sigue rechazando', async () => {
    await escenario(db, async (a) => {
      const id = await denuncia(db, a);
      await a.como(ADMIN);
      await a.falla(
        rpc(db, `select public.match_admin_resolve($1, 'expulsion_total', '')`, [id]),
        /INVALID_RESOLUTION/,
      );
    });
  });
});
