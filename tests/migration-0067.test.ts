import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0067: corregir un bar del catalogo (nombre, ubicacion, imagen).
 *
 *  1. el autor corrige su bar; otro admin NO (0 filas, sin error, como borrar);
 *  2. los bares sin autor (los 14 originales, los de una cuenta borrada) los
 *     corrige cualquier admin;
 *  3. solo se tocan nombre, ubicacion e imagen: no se cambia el autor (si no, se
 *     podria quedar uno con el bar de otro);
 *  4. un jugador no puede, ni sin sesion;
 *  5. los topes y el nombre unico de la 0035 siguen valiendo al editar;
 *  6. editar no toca la parada de una ruta que ya uso el bar (lleva su copia).
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0067_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN_A = '00000000-0000-4000-8000-00000000000a';
const ADMIN_B = '00000000-0000-4000-8000-00000000000b';
const JUGADOR = '00000000-0000-4000-8000-00000000000c';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = '00000000-0000-4000-8000-0000000000b1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ADMIN_A}', 'a@example.com'), ('${ADMIN_B}', 'b@example.com'), ('${JUGADOR}', 'j@example.com');
  update public.profiles set role = 'admin' where id in ('${ADMIN_A}', '${ADMIN_B}');
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta', true, '${ADMIN_A}', current_date + 10);
`;
const LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const LOGO_NUEVO = 'data:image/png;base64,iVBORw0KGgo=';

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const crear = (db: PGlite, uid: string | null, nombre: string) =>
  db.query(`insert into public.catalog_bars (name, lat, lng, logo, created_by) values ($1, 40.48, -3.36, $2, $3)`, [nombre, LOGO, uid]);
const leer = async (db: PGlite, nombre: string) =>
  (
    await db.query<{ name: string; lat: number; lng: number; logo: string | null; created_by: string | null }>(
      `select name, lat, lng, logo, created_by from public.catalog_bars where lower(name) = lower($1)`,
      [nombre],
    )
  ).rows[0];

describe('0067: corregir un bar del catalogo', () => {
  it('el autor corrige ubicacion, imagen y nombre', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      const r = await db.query(
        `update public.catalog_bars set name = 'La Cepa Vieja', lat = 40.5, lng = -3.4, logo = $1 where name = 'La Cepa'`,
        [LOGO_NUEVO],
      );
      assert.equal(r.affectedRows, 1);
      assert.deepEqual(await leer(db, 'La Cepa Vieja'), { name: 'La Cepa Vieja', lat: 40.5, lng: -3.4, logo: LOGO_NUEVO, created_by: ADMIN_A });
    });
  });

  it('quitar la imagen (null) tambien vale', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await db.query(`update public.catalog_bars set logo = null where name = 'La Cepa'`);
      assert.equal((await leer(db, 'La Cepa'))?.logo, null);
    });
  });

  it('otro admin NO corrige el bar del autor: 0 filas y sin error, y no cambia nada', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.como(ADMIN_B);
      const r = await db.query(`update public.catalog_bars set lat = 1, lng = 1, logo = null where name = 'La Cepa'`);
      assert.equal(r.affectedRows, 0);
      await a.como(ADMIN_A);
      assert.deepEqual(await leer(db, 'La Cepa'), { name: 'La Cepa', lat: 40.48, lng: -3.36, logo: LOGO, created_by: ADMIN_A });
    });
  });

  it('un bar sin autor (originales, cuenta borrada) lo corrige cualquier admin', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => crear(db, null, 'Bar Huerfano'));
      await a.como(ADMIN_B);
      const r = await db.query(`update public.catalog_bars set lat = 41 where name = 'Bar Huerfano'`);
      assert.equal(r.affectedRows, 1);
      assert.equal((await leer(db, 'Bar Huerfano'))?.lat, 41);
    });
  });

  it('el autor, la fecha y el id no se tocan: nadie se queda con el bar de otro', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.falla(() => db.query(`update public.catalog_bars set created_by = '${ADMIN_B}' where name = 'La Cepa'`), /permission denied/);
      await a.falla(() => db.query(`update public.catalog_bars set created_at = now() where name = 'La Cepa'`), /permission denied/);
      await a.falla(() => db.query(`update public.catalog_bars set id = gen_random_uuid() where name = 'La Cepa'`), /permission denied/);
    });
  });

  it('un jugador no corrige nada, aunque este en la ruta; sin sesion tampoco', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.como(JUGADOR);
      assert.equal((await db.query(`update public.catalog_bars set lat = 1 where name = 'La Cepa'`)).affectedRows, 0);
      await a.anonimo();
      await a.falla(() => db.query(`update public.catalog_bars set lat = 1 where name = 'La Cepa'`), /permission denied/);
      await a.como(ADMIN_A);
      assert.equal((await leer(db, 'La Cepa'))?.lat, 40.48);
    });
  });

  it('un admin que deja de serlo ya no corrige', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.comoPostgres(() => db.exec(`update public.profiles set role = 'user' where id = '${ADMIN_A}'`));
      await a.como(ADMIN_A);
      assert.equal((await db.query(`update public.catalog_bars set lat = 1 where name = 'La Cepa'`)).affectedRows, 0);
    });
  });

  it('siguen los topes y el nombre unico de la 0035', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await crear(db, ADMIN_A, 'El Pozo');
      await a.falla(() => db.query(`update public.catalog_bars set name = ' LA CEPA ' where name = 'El Pozo'`), /duplicate key|unique/);
      await a.falla(() => db.query(`update public.catalog_bars set lat = 91 where name = 'La Cepa'`), /check/);
      await a.falla(
        () => db.query(`update public.catalog_bars set logo = $1 where name = 'La Cepa'`, ['data:image/png;base64,' + 'A'.repeat(300_000)]),
        /check/,
      );
      await a.falla(() => db.query(`update public.catalog_bars set logo = 'http://x/y.png' where name = 'La Cepa'`), /check/);
      await a.falla(() => db.query(`update public.catalog_bars set name = '' where name = 'La Cepa'`), /check/);
      // renombrarse a si mismo con otras mayusculas si vale (es el mismo bar)
      assert.equal((await db.query(`update public.catalog_bars set name = 'LA CEPA' where name = 'La Cepa'`)).affectedRows, 1);
    });
  });

  it('corregir el bar NO cambia la parada de una ruta que ya lo uso (lleva su copia)', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await db.query(
        `insert into public.route_bars (id, route_id, sort_order, name, lat, lng, logo, opens_at, closes_at)
         values ($1, $2, 0, 'La Cepa', 40.48, -3.36, $3, now(), now() + interval '1 hour')`,
        [BAR, RUTA, LOGO],
      );
      await db.query(`update public.catalog_bars set lat = 41, lng = -4, logo = $1 where name = 'La Cepa'`, [LOGO_NUEVO]);
      const parada = (await db.query<{ lat: number; lng: number; logo: string }>(`select lat, lng, logo from public.route_bars where id = $1`, [BAR])).rows[0];
      assert.deepEqual(parada, { lat: 40.48, lng: -3.36, logo: LOGO });
    });
  });

  it('la 0067 no rehace ninguna funcion ni toca otra tabla', () => {
    const sql = leerFichero('supabase/migrations/0067_editar_bar_del_catalogo.sql').replace(/--.*$/gm, '');
    assert.ok(!/create (or replace )?function/i.test(sql));
    assert.ok(!/(alter|drop) table/i.test(sql));
    const tablas = [...sql.matchAll(/on public\.(\w+)/g)].map((m) => m[1]).filter((t, i, v) => v.indexOf(t) === i);
    assert.deepEqual(tablas, ['catalog_bars']);
  });
});
