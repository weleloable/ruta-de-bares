import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { crearBase, escenario, leerFichero } from './pglite-supabase.ts';

/**
 * 0033: que admin ya vio el aviso de una ruta terminada.
 *
 * Es lo que apaga el punto rojo, por admin: que otro admin lo haya visto no
 * apaga el tuyo. Lo que se asegura sobre Postgres real:
 *  1. cada admin ve y apunta SOLO lo suyo;
 *  2. quien no es admin no lee ni apunta nada;
 *  3. "ya lo vi" no se deshace (ni update ni delete desde la API);
 *  4. al borrar la ruta, sus filas se van solas.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const migraciones = readdirSync(join(raiz, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && f < '0034')
  .sort()
  .map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-00000000000d';
const OTRO_ADMIN = '00000000-0000-4000-8000-00000000000e';
const ANA = '00000000-0000-4000-8000-00000000000a';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ADMIN}', 'admin@example.com'), ('${OTRO_ADMIN}', 'otro@example.com'), ('${ANA}', 'ana@example.com');
  update public.profiles set role = 'admin' where id in ('${ADMIN}', '${OTRO_ADMIN}');
  insert into public.routes (id, name, is_published, created_by, event_date)
    values ('${RUTA}', 'Ruta terminada', true, '${ADMIN}', current_date - 3);
`;

const vistas = async (db: Awaited<ReturnType<typeof crearBase>>) =>
  (await db.query<{ admin_id: string }>('select admin_id from public.admin_rutas_terminadas_vistas')).rows.map(
    (r) => r.admin_id,
  );

describe('0033: rutas terminadas vistas', () => {
  it('cada admin apunta y ve SOLO lo suyo', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('insert into public.admin_rutas_terminadas_vistas (admin_id, route_id) values ($1, $2)', [ADMIN, RUTA]);
      assert.deepEqual(await vistas(db), [ADMIN]);
      await a.falla(
        () => db.query('insert into public.admin_rutas_terminadas_vistas (admin_id, route_id) values ($1, $2)', [OTRO_ADMIN, RUTA]),
        /row-level security/,
      );
      await a.como(OTRO_ADMIN);
      assert.deepEqual(await vistas(db), [], 'que lo viera otro admin no apaga tu punto');
    });
    await db.close();
  });

  it('quien no es admin no lee ni apunta nada', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await db.exec(`insert into public.admin_rutas_terminadas_vistas (admin_id, route_id) values ('${ADMIN}', '${RUTA}')`);
    await escenario(db, async (a) => {
      await a.como(ANA);
      assert.deepEqual(await vistas(db), []);
      await a.falla(
        () => db.query('insert into public.admin_rutas_terminadas_vistas (admin_id, route_id) values ($1, $2)', [ANA, RUTA]),
        /row-level security/,
      );
    });
    await db.close();
  });

  it('"ya lo vi" no se deshace desde la API', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('insert into public.admin_rutas_terminadas_vistas (admin_id, route_id) values ($1, $2)', [ADMIN, RUTA]);
      await a.falla(() => db.query('delete from public.admin_rutas_terminadas_vistas'), /permission denied/);
      await a.falla(() => db.query('update public.admin_rutas_terminadas_vistas set vista_el = now()'), /permission denied/);
    });
    await db.close();
  });

  it('al borrar la ruta, sus filas se van solas', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await db.exec(`insert into public.admin_rutas_terminadas_vistas (admin_id, route_id) values ('${ADMIN}', '${RUTA}')`);
    await db.exec(`delete from public.routes where id = '${RUTA}'`);
    assert.deepEqual(await vistas(db), []);
    await db.close();
  });
});
