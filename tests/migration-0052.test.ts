import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0052: lo que aporta cada persona a su casa.
 *
 *  1. QR a medias y racha a partes iguales, con decimales;
 *  2. la suma de la lista es SIEMPRE la del ranking de la casa;
 *  3. incluye a quien no ha aportado nada, y una fila sin persona para lo que no la tiene;
 *  4. solo quien esta en la ruta (o administra) lo ve.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0052_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = '00000000-0000-4000-8000-0000000000b1';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOMBRE: Record<number, string> = { 1: 'Ana', 2: 'Bea', 3: 'Carla', 4: 'Dani', 5: 'Eva' };

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at)
  values ('${BAR}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3, 4, 5]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = '${NOMBRE[n]}' where id = '${uid(n)}';
              insert into public.user_houses (user_id, house) values ('${uid(n)}', '${n === 4 ? 'alhambra' : 'mahou'}');
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
    )
    .join('\n')}
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

const sellar = (db: PGlite, a: Actor, n: number, minutos: number) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m, stamped_at)
             values ('${uid(n)}', '${BAR}', 40.48, -3.36, 5, now() - interval '${minutos} minutes')`),
  );

type Fila = { user_id: string | null; nombre: string | null; puntos: string };
const aportes = async (db: PGlite, a: Actor, quien: string, casa = 'mahou') => {
  await a.como(quien);
  return (await db.query<Fila>('select * from public.casas_aportes($1, $2)', [RUTA, casa])).rows;
};
const total = async (db: PGlite, a: Actor, casa: string) => {
  await a.como(ADMIN);
  const { rows } = await db.query<{ house: string; puntos: number }>('select * from public.casas_ranking($1)', [RUTA]);
  return rows.find((r) => r.house === casa)!.puntos;
};

describe('0052: aportes por persona', () => {
  it('sellos, QR a medias y racha a partes iguales; la suma cuadra con el ranking', async () => {
    await conBase(async (db, a) => {
      // Ana, Bea y Carla sellan seguidas el mismo bar: racha de mahou (6).
      await sellar(db, a, 1, 30);
      await sellar(db, a, 2, 20);
      await sellar(db, a, 3, 10);
      // Encuentro QR de Ana y Bea (5).
      await a.comoPostgres(() =>
        db.exec(`insert into public.point_movements (route_id, house, action, points, ref, detail)
                 values ('${RUTA}', 'mahou', 'qr', 5, 'qr:x', '{"usuarios": ["${uid(1)}", "${uid(2)}"]}')`),
      );
      const filas = await aportes(db, a, uid(1));
      const por = Object.fromEntries(filas.map((f) => [f.nombre, Number(f.puntos)]));
      // Un bar es toda la ruta: 10 del sello + 20 de ruta completa, + 2 de la racha (6/3) + 2,5 del QR (5/2).
      assert.deepEqual(por, { Ana: 34.5, Bea: 34.5, Carla: 32, Eva: 0 });
      assert.deepEqual(filas.map((f) => f.nombre), ['Ana', 'Bea', 'Carla', 'Eva'], 'de mas a menos, y empata por nombre');
      assert.equal(filas.reduce((s, f) => s + Number(f.puntos), 0), await total(db, a, 'mahou'));
    });
  });

  it('lo que no tiene persona sale en una fila aparte, y los anulados no cuentan', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 10);
      await a.como(ADMIN);
      await db.query(`select public.casas_admin_ajuste($1, 'mahou', 7, 'Ganaron la prueba del bar')`, [RUTA]);
      await db.query(`select public.casas_admin_ajuste($1, 'mahou', 3, 'Otro ajuste', $2)`, [RUTA, uid(2)]);
      const filas = await aportes(db, a, uid(2));
      const sin = filas.find((f) => f.user_id === null);
      assert.equal(Number(sin?.puntos), 7);
      assert.equal(sin?.nombre, null);
      assert.equal(Number(filas.find((f) => f.nombre === 'Bea')?.puntos), 3);
      assert.equal(filas.reduce((s, f) => s + Number(f.puntos), 0), await total(db, a, 'mahou'));
      // Anulado el sello de Ana, Ana se queda en 0.
      await a.comoPostgres(() =>
        db.exec(`update public.point_movements set annulled_at = now() where action in ('sello', 'ruta_completa')`),
      );
      assert.equal(Number((await aportes(db, a, uid(1))).find((f) => f.nombre === 'Ana')?.puntos), 0);
    });
  });

  it('otra casa, solo los suyos; y quien no esta en la ruta no lo ve', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 4, 5);
      const filas = await aportes(db, a, uid(1), 'alhambra');
      assert.deepEqual(filas.map((f) => f.nombre), ['Dani']);
      assert.equal(Number(filas[0]?.puntos), 30);
      await a.comoPostgres(() => db.exec(`insert into auth.users (id, email) values ('${uid(9)}', 'u9@example.com')`));
      await a.como(uid(9));
      await a.falla(() => db.query('select * from public.casas_aportes($1, $2)', [RUTA, 'mahou']), /FORBIDDEN/);
      await a.como(uid(1));
      await a.falla(() => db.query('select * from public.casas_aportes($1, $2)', [RUTA, 'heineken']), /INVALID_HOUSE/);
    });
  });
});
