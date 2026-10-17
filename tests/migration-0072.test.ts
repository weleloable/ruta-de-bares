import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0072: `routes.la_penul_visible`, el interruptor de La Penul por ruta.
 *
 * No hay policy nueva: la demostracion es que las de siempre ya hacen lo que
 * hace falta. Un miembro normal LEE la columna (la necesita la app para pintar
 * el menu) pero NO la cambia; un admin, si. Y viene apagada.
 */

const migraciones = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql') && f <= '0072_zzz')
  .sort()
  .map((n) => leerFichero(`supabase/migrations/${n}`));
const M72 = leerFichero('supabase/migrations/0072_la_penul_visible.sql');

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const MIEMBRO = '00000000-0000-4000-8000-000000000001';
const FUERA = '00000000-0000-4000-8000-000000000002';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${MIEMBRO}', 'm@example.com'), ('${FUERA}', 'f@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values ('${RUTA}', 'Ruta', true, '${ADMIN}', current_date);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${MIEMBRO}');
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const leer = (db: PGlite) => db.query<{ v: boolean }>(`select la_penul_visible as v from public.routes where id = $1`, [RUTA]);
const verdad = (db: PGlite, a: Actor) =>
  a.comoPostgres(async () => (await leer(db)).rows[0]?.v);

describe('0072: la_penul_visible', () => {
  it('viene APAGADO: en una ruta que ya existia y en una nueva', async () => {
    await conBase(async (db, a) => {
      assert.equal(await verdad(db, a), false, 'la ruta de antes de la migracion');
      await a.como(ADMIN);
      const nueva = await db.query<{ v: boolean }>(
        `insert into public.routes (name, created_by) values ('Nueva', '${ADMIN}') returning la_penul_visible as v`,
      );
      assert.equal(nueva.rows[0]?.v, false);
    });
  });

  it('un miembro normal de la ruta la LEE', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.routes set la_penul_visible = true where id = '${RUTA}'`));
      await a.como(MIEMBRO);
      assert.deepEqual((await leer(db)).rows, [{ v: true }]);
    });
  });

  it('un miembro normal NO la puede cambiar (ni encenderla ni apagarla)', async () => {
    await conBase(async (db, a) => {
      await a.como(MIEMBRO);
      // La RLS no da error: simplemente no encuentra fila que pueda actualizar.
      const r = await db.query(`update public.routes set la_penul_visible = true where id = $1 returning id`, [RUTA]);
      assert.equal(r.rows.length, 0);
      assert.equal(await verdad(db, a), false);

      await a.comoPostgres(() => db.exec(`update public.routes set la_penul_visible = true where id = '${RUTA}'`));
      await a.como(MIEMBRO);
      const r2 = await db.query(`update public.routes set la_penul_visible = false where id = $1 returning id`, [RUTA]);
      assert.equal(r2.rows.length, 0);
      assert.equal(await verdad(db, a), true);
    });
  });

  it('alguien de fuera de la ruta ni la lee ni la cambia', async () => {
    await conBase(async (db, a) => {
      await a.como(FUERA);
      assert.deepEqual((await leer(db)).rows, []);
      const r = await db.query(`update public.routes set la_penul_visible = true where id = $1 returning id`, [RUTA]);
      assert.equal(r.rows.length, 0);
    });
  });

  it('un admin si la cambia, en los dos sentidos', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      let r = await db.query<{ v: boolean }>(`update public.routes set la_penul_visible = true where id = $1 returning la_penul_visible as v`, [RUTA]);
      assert.deepEqual(r.rows, [{ v: true }]);
      r = await db.query<{ v: boolean }>(`update public.routes set la_penul_visible = false where id = $1 returning la_penul_visible as v`, [RUTA]);
      assert.deepEqual(r.rows, [{ v: false }]);
    });
  });

  it('no admite null', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await a.falla(() => db.query(`update public.routes set la_penul_visible = null where id = $1`, [RUTA]), /null/);
    });
  });

  it('se puede volver a pegar sin tocar el valor', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(`update public.routes set la_penul_visible = true where id = '${RUTA}'`);
        await db.exec(M72);
      });
      assert.equal(await verdad(db, a), true);
    });
  });
});
