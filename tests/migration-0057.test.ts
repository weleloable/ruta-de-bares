import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0057: estadisticas de las casas.
 *
 *  1. los puntos por origen SUMAN lo que dice casas_ranking (con podios, retos y ajustes);
 *  2. sellos y consumiciones por casa, y miembros;
 *  3. solo quien esta en la ruta (o administra) lo ve.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0057_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CASA: Record<number, string> = { 1: 'mahou', 2: 'mahou', 3: 'mahou', 4: 'alhambra' };

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR(1)}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(2)}', '${RUTA}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3, 4]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              insert into public.user_houses (user_id, house) values ('${uid(n)}', '${CASA[n]}');
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

type Fila = {
  house: string;
  miembros: number;
  sellos: number;
  consumiciones: number;
  p_sellos: string;
  p_consumo: string;
  p_juegos: string;
  p_social: string;
  p_otros: string;
};
const stats = async (db: PGlite, a: Actor, quien: string) => {
  await a.como(quien);
  return (await db.query<Fila>('select * from public.casas_estadisticas($1)', [RUTA])).rows;
};
const suma = (f: Fila) => [f.p_sellos, f.p_consumo, f.p_juegos, f.p_social, f.p_otros].reduce((s, v) => s + Number(v), 0);

describe('0057: estadisticas de casas', () => {
  it('los puntos por origen suman lo que dice el ranking, con todo tipo de puntos', async () => {
    await conBase(async (db, a) => {
      // Racha de mahou en el bar 1 (1, 2, 3), consumicion, QR, reto, ajuste y un podio.
      await sellar(db, a, 1, 1, 30);
      await sellar(db, a, 2, 1, 20);
      await sellar(db, a, 3, 1, 10);
      await sellar(db, a, 4, 1, 5);
      await a.como(uid(1));
      await db.query(`select public.registrar_consumicion($1, 'tercio')`, [BAR(1)]);
      await a.comoPostgres(() =>
        db.exec(`insert into public.point_movements (route_id, house, action, points, ref, detail)
                   values ('${RUTA}', 'mahou', 'qr', 5, 'qr:x', '{"usuarios": ["${uid(1)}", "${uid(2)}"]}');
                 insert into public.point_movements (route_id, user_id, house, action, points, ref, detail)
                   values ('${RUTA}', '${uid(2)}', 'mahou', 'reto', 15, 'reto:x:2', '{"reto": "x", "nombre": "R"}');
                 insert into public.minigame_scores (route_id, user_id, game, best_score, best_at)
                   values ('${RUTA}', '${uid(4)}', 'cana-perfecta', 90, now());`),
      );
      await a.como(ADMIN);
      await db.query(`select public.casas_admin_ajuste($1, 'alhambra', 7, 'Ajuste de prueba')`, [RUTA]);

      const filas = await stats(db, a, uid(1));
      assert.equal(filas.length, 4);
      const { rows: ranking } = await db.query<{ house: string; puntos: number }>('select * from public.casas_ranking($1)', [RUTA]);
      for (const f of filas) {
        assert.equal(suma(f), ranking.find((r) => r.house === f.house)?.puntos, `${f.house} no cuadra con el ranking`);
      }
      const mahou = filas.find((f) => f.house === 'mahou')!;
      assert.deepEqual([mahou.miembros, mahou.sellos, mahou.consumiciones], [3, 3, 1]);
      assert.equal(Number(mahou.p_social), 11, 'QR 5 + racha 6');
      assert.equal(Number(mahou.p_otros), 15, 'el reto');
      const alhambra = filas.find((f) => f.house === 'alhambra')!;
      assert.equal(Number(alhambra.p_juegos), 10, 'su podio de la Cana');
      assert.equal(Number(alhambra.p_otros), 7, 'el ajuste');
    });
  });

  it('solo quien esta en la ruta lo ve', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`insert into auth.users (id, email) values ('${uid(9)}', 'u9@example.com')`));
      await a.como(uid(9));
      await a.falla(() => db.query('select * from public.casas_estadisticas($1)', [RUTA]), /FORBIDDEN/);
      assert.equal((await stats(db, a, ADMIN)).length, 4);
    });
  });
});
