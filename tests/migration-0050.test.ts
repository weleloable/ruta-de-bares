import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0050: se quita la excepcion de casa por nombre (Pablo / Rodrigo).
 *
 *  1. Pablo y Rodrigo se reparten como cualquiera: por equilibrio;
 *  2. quien ya tenia casa la conserva;
 *  3. casa_por_nombre ya no existe.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0050_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(migraciones);
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
    insert into public.routes (id, name, is_published, created_by, event_date)
    values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  `);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

describe('0050: sin excepcion por nombre', () => {
  it('cuatro Pablos y cuatro Rodrigos quedan repartidos dos a dos, no apilados', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        const nombresPrueba = ['Pablo', 'Pablo2', 'Pablo3', 'Pablo4', 'Rodrigo', 'Rodrigo2', 'Rodrigo3', 'Rodrigo4'];
        for (const [i, nombre] of nombresPrueba.entries()) {
          const n = i + 1;
          await db.exec(`insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
                         update public.profiles set display_name = '${nombre}' where id = '${uid(n)}';
                         insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`);
        }
        const { rows } = await db.query<{ n: number }>(
          'select count(*)::int as n from public.user_houses group by house order by house',
        );
        assert.deepEqual(rows.map((r) => r.n), [2, 2, 2, 2]);
      });
    });
  });

  it('quien ya tenia casa la conserva, y casa_por_nombre ya no existe', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(`insert into auth.users (id, email) values ('${uid(1)}', 'u1@example.com');
                       update public.profiles set display_name = 'Pablo' where id = '${uid(1)}';
                       insert into public.user_houses (user_id, house) values ('${uid(1)}', 'cruzcampo');
                       insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(1)}');`);
        const { rows } = await db.query<{ house: string }>('select house from public.user_houses where user_id = $1', [uid(1)]);
        assert.equal(rows[0]?.house, 'cruzcampo');
        const { rows: f } = await db.query(`select 1 from pg_proc where proname = 'casa_por_nombre'`);
        assert.equal(f.length, 0);
      });
    });
  });
});
