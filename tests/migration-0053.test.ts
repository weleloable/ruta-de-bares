import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0053: de donde salen los puntos de cada persona.
 *
 *  1. agrupado por tipo, con veces y puntos; QR a medias y racha a partes iguales;
 *  2. la suma del desglose es la que dice `casas_aportes` de esa persona;
 *  3. retos y podios con su nombre; los anulados no cuentan;
 *  4. solo quien esta en la ruta (o administra) lo ve.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0053_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOMBRE: Record<number, string> = { 1: 'Ana', 2: 'Bea', 3: 'Carla' };

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR(1)}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(2)}', '${RUTA}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(3)}', '${RUTA}', 2, 'Tres', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = '${NOMBRE[n]}' where id = '${uid(n)}';
              insert into public.user_houses (user_id, house) values ('${uid(n)}', 'mahou');
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

const sellar = (db: PGlite, a: Actor, n: number, bar: number, minutos: number) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m, stamped_at)
             values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5, now() - interval '${minutos} minutes')`),
  );

type Fila = { tipo: string; detalle: string | null; puesto: number | null; veces: number; puntos: string };
const detalle = async (db: PGlite, a: Actor, quien: string, de: number) => {
  await a.como(quien);
  return (await db.query<Fila>('select * from public.casas_aportes_detalle($1, $2, $3)', [RUTA, 'mahou', uid(de)])).rows;
};
const aporte = async (db: PGlite, a: Actor, de: number) => {
  await a.como(uid(1));
  const { rows } = await db.query<{ user_id: string; puntos: string }>('select user_id, puntos from public.casas_aportes($1, $2)', [RUTA, 'mahou']);
  return Number(rows.find((r) => r.user_id === uid(de))?.puntos);
};

describe('0053: procedencia de los puntos', () => {
  it('agrupa por tipo; QR a medias y racha a partes iguales; la suma cuadra con el aporte', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1, 50);
      await sellar(db, a, 1, 2, 40);
      // Racha de mahou en el bar 3 (Ana, Bea, Carla).
      await sellar(db, a, 1, 3, 30);
      await sellar(db, a, 2, 3, 20);
      await sellar(db, a, 3, 3, 10);
      await a.comoPostgres(() =>
        db.exec(`insert into public.point_movements (route_id, house, action, points, ref, detail)
                 values ('${RUTA}', 'mahou', 'qr', 5, 'qr:x', '{"usuarios": ["${uid(1)}", "${uid(2)}"]}')`),
      );
      const filas = await detalle(db, a, uid(2), 1);
      const por = Object.fromEntries(filas.map((f) => [f.tipo, [f.veces, Number(f.puntos)]]));
      // 3 sellos, la ruta completa, la racha (6/3) y el QR (5/2).
      assert.deepEqual(por, { sello: [3, 30], ruta_completa: [1, 20], racha: [1, 2], qr: [1, 2.5] });
      assert.equal(filas.reduce((s, f) => s + Number(f.puntos), 0), await aporte(db, a, 1));
      // Carla no estaba en el QR.
      assert.equal((await detalle(db, a, uid(2), 3)).some((f) => f.tipo === 'qr'), false);
    });
  });

  it('retos con su nombre, podios por juego y puesto, y los anulados no cuentan', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1, 10);
      await a.comoPostgres(() =>
        db.exec(`insert into public.point_movements (route_id, user_id, house, action, points, ref, detail)
                   values ('${RUTA}', '${uid(1)}', 'mahou', 'reto', 15, 'reto:x:1', '{"reto": "x", "nombre": "Peregrino"}');
                 insert into public.minigame_scores (route_id, user_id, game, best_score, best_at)
                   values ('${RUTA}', '${uid(1)}', 'cana-perfecta', 90, now()), ('${RUTA}', '${uid(2)}', 'cana-perfecta', 80, now());`),
      );
      const filas = await detalle(db, a, uid(3), 1);
      const reto = filas.find((f) => f.tipo === 'reto');
      assert.deepEqual([reto?.detalle, Number(reto?.puntos)], ['Peregrino', 15]);
      const podio = filas.find((f) => f.tipo === 'podio');
      assert.deepEqual([podio?.detalle, podio?.puesto, Number(podio?.puntos)], ['cana-perfecta', 1, 10]);
      assert.equal(filas.reduce((s, f) => s + Number(f.puntos), 0), await aporte(db, a, 1));
      await a.comoPostgres(() => db.exec(`update public.point_movements set annulled_at = now() where action = 'reto'`));
      assert.equal((await detalle(db, a, uid(3), 1)).some((f) => f.tipo === 'reto'), false);
    });
  });

  it('solo quien esta en la ruta lo ve', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`insert into auth.users (id, email) values ('${uid(9)}', 'u9@example.com')`));
      await a.como(uid(9));
      await a.falla(() => db.query('select * from public.casas_aportes_detalle($1, $2, $3)', [RUTA, 'mahou', uid(1)]), /FORBIDDEN/);
      await a.como(ADMIN);
      assert.deepEqual((await db.query('select * from public.casas_aportes_detalle($1, $2, $3)', [RUTA, 'mahou', uid(1)])).rows, []);
    });
  });
});
