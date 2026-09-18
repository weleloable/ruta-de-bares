import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0012: la cana deja de usar la pertenencia provisional (todo el mundo en una
 * ruta publicada) y pasa a mirar `route_members`, que es lo que crea la 0004
 * del remoto al canjear una invitacion.
 *
 * Lo que hay que asegurar sobre Postgres real: que quien no ha canjeado no
 * aparece en la grilla aunque tenga la cana activada, y que quien canjea si.
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
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'), ('${LUIS}', 'luis@example.com'), ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Ruta publicada', true, '${ADMIN}');
  -- Ana ha canjeado su invitacion; Luis todavia no.
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}');
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

describe('0012: la cana respeta route_members', async () => {
  const db = await crearBase([...migraciones, migraciones.at(-1) as string]);
  await db.exec(DATOS);

  it('quien no ha canjeado la invitacion no entra en la cana de esa ruta', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(LUIS);
      await a.falla(rpc(db, 'select * from public.match_grid($1)', [RUTA]), /NOT_PARTICIPANT/);
    });
  });

  it('quien si ha canjeado no ve a quien no pertenece a la ruta', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.como(ANA);
      assert.deepEqual(await filas(db, 'select * from public.match_grid($1)', [RUTA]), []);
      await a.falla(rpc(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]), /TARGET_UNAVAILABLE/);
    });
  });

  it('en cuanto canjea, aparece', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      await a.comoPostgres(() => db.query('insert into public.route_members (route_id, user_id) values ($1, $2)', [RUTA, LUIS]));
      await a.como(ANA);
      const grilla = await filas(db, 'select user_id from public.match_grid($1)', [RUTA]);
      assert.deepEqual(grilla.map((f) => f.user_id), [LUIS]);
    });
  });
});
