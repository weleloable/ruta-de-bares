import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0060: tipo de parada. Solo los bares ('bar') se sellan y cuentan.
 *
 *  1. por defecto 'bar'; solo bar, foto u otra;
 *  2. claim_stamp rechaza el sello de una parada que no es un bar;
 *  3. completar la ruta, retos, nivel de "¿Conduces tu?" y estadisticas cuentan solo los bares;
 *  4. si una parada deja de ser un bar, pierde sus sellos y los puntos de esos sellos.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0060_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = '00000000-0000-4000-8000-0000000000b1';
const FOTO = '00000000-0000-4000-8000-0000000000b2';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at, tipo) values
    ('${BAR}', '${RUTA}', 0, 'El bar', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours', 'bar'),
    ('${FOTO}', '${RUTA}', 1, 'Foto en la plaza', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours', 'foto');
  ${[1, 2, 3]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
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

const sellar = async (db: PGlite, a: Actor, n: number, bar: string) => {
  await a.como(uid(n));
  return db.query('select public.claim_stamp($1, 40.48, -3.36)', [bar]);
};

const puntos = (db: PGlite, a: Actor, accion: string) =>
  a.comoPostgres(async () => {
    const { rows } = await db.query<{ p: number }>(
      `select coalesce(sum(points), 0)::int as p from public.point_movements where action = $1 and annulled_at is null`,
      [accion],
    );
    return rows[0]?.p ?? 0;
  });

describe('0060: tipo de parada', () => {
  it('por defecto es bar, y solo hay bar, foto u otra', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(`insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at)
                       values ('${RUTA}', 5, 'Sin tipo', 40.48, -3.36, now(), now() + interval '1 hour')`);
        const { rows } = await db.query<{ tipo: string }>(`select tipo from public.route_bars where name = 'Sin tipo'`);
        assert.equal(rows[0]?.tipo, 'bar');
        await a.falla(() => db.exec(`update public.route_bars set tipo = 'museo' where id = '${BAR}'`), /route_bars_tipo_check/);
        await db.exec(`update public.route_bars set tipo = 'otra' where name = 'Sin tipo'`);
      });
    });
  });

  it('el servidor rechaza sellar una parada que no es un bar', async () => {
    await conBase(async (db, a) => {
      await a.falla(() => sellar(db, a, 1, FOTO), /NOT_STAMPABLE/);
      await sellar(db, a, 1, BAR);
      await a.comoPostgres(async () => {
        const { rows } = await db.query('select 1 from public.stamps');
        assert.equal(rows.length, 1, 'solo el del bar');
      });
    });
  });

  it('completar la ruta y los retos cuentan solo los bares', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() =>
        db.exec(`insert into public.retos (route_id, nombre, tipo, objetivo, puntos, hora_limite)
                   values ('${RUTA}', 'Todo', 'ruta_antes_de', 1, 9, now() + interval '1 hour');`),
      );
      await sellar(db, a, 1, BAR);
      assert.equal(await puntos(db, a, 'ruta_completa'), 20, 'con el unico bar basta');
      await a.comoPostgres(async () => {
        const { rows } = await db.query(`select 1 from public.point_movements where action = 'reto'`);
        assert.equal(rows.length, 1, 'el reto de acabar la ruta tambien');
      });
    });
  });

  it('el nivel maximo de "¿Conduces tu?" es el numero de bares, sin las otras paradas', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, BAR);
      await a.como(uid(1));
      await a.falla(() => db.query('select public.conduces_submit_score($1, 2, 500)', [RUTA]), /INVALID_LEVEL/);
      await db.query('select public.conduces_submit_score($1, 1, 500)', [RUTA]);
    });
  });

  it('las estadisticas de admin cuentan solo los bares', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, BAR);
      await a.como(ADMIN);
      const { rows } = await db.query<{ r: { ruta: { bares: number; completaron: number } } }>(
        'select public.admin_estadisticas_ruta($1) as r',
        [RUTA],
      );
      assert.deepEqual([rows[0]!.r.ruta.bares, rows[0]!.r.ruta.completaron], [1, 1]);
      const { rows: act } = await db.query<{ r: { bares: { nombre: string }[] } }>('select public.admin_estadisticas_actividad($1) as r', [RUTA]);
      assert.deepEqual(act[0]!.r.bares.map((b) => b.nombre), ['El bar']);
      const { rows: glo } = await db.query<{ r: { rutas: { bares: number; completaron: number }[] } }>('select public.admin_estadisticas_global() as r');
      assert.deepEqual([glo[0]!.r.rutas[0]?.bares, glo[0]!.r.rutas[0]?.completaron], [1, 1]);
    });
  });

  it('si una parada deja de ser un bar, pierde sus sellos y los puntos de esos sellos', async () => {
    await conBase(async (db, a) => {
      // Racha en el bar (tres personas seguidas) y sus sellos.
      for (const n of [1, 2, 3]) await sellar(db, a, n, BAR);
      assert.equal(await puntos(db, a, 'racha'), 6);
      assert.equal(await puntos(db, a, 'sello'), 30);
      await a.como(ADMIN);
      await db.query(`update public.route_bars set tipo = 'otra' where id = $1`, [BAR]);
      assert.equal(await puntos(db, a, 'sello'), 0);
      assert.equal(await puntos(db, a, 'racha'), 0);
      await a.comoPostgres(async () => {
        assert.equal((await db.query('select 1 from public.stamps')).rows.length, 0, 'sin sellos');
        const { rows } = await db.query<{ annul_reason: string }>(`select distinct annul_reason from public.point_movements where annulled_at is not null and action in ('sello', 'racha')`);
        assert.deepEqual(rows.map((r) => r.annul_reason), ['La parada dejo de ser un bar: sin sello']);
        // La ruta completa que ya se dio se queda.
        assert.equal(await puntos(db, a, 'ruta_completa'), 60);
      });
    });
  });
});
