import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0047: retos.
 *
 *  1. cada tipo de condicion se cumple cuando toca, y puntua una vez por persona;
 *  2. el limite de personas: solo los primeros N;
 *  3. un reto creado despues se da al mirarlo;
 *  4. desactivado no puntua mas, pero no quita lo dado;
 *  5. solo quien administra los crea; las condiciones tienen tope (no premiar beber).
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0047_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR(1)}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(2)}', '${RUTA}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
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

/** Crea un reto como admin y devuelve su id. */
async function reto(db: PGlite, a: Actor, campos: Record<string, unknown>): Promise<string> {
  await a.como(ADMIN);
  const todo: Record<string, unknown> = { route_id: RUTA, nombre: 'Reto', puntos: 15, ...campos };
  const cols = Object.keys(todo);
  const vals = Object.values(todo);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.retos (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
    vals,
  );
  return rows[0]!.id;
}

const sellar = (db: PGlite, a: Actor, n: number, bar: number, minutos = 0) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m, stamped_at)
             values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5, now() - interval '${minutos} minutes')`),
  );

/** Consumicion directa (como postgres): la regla de la espera ya la prueba la 0045. */
const consumir = (db: PGlite, a: Actor, n: number, cat: string) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.consumiciones (route_id, route_bar_id, user_id, categoria, puntua)
             values ('${RUTA}', '${BAR(1)}', '${uid(n)}', '${cat}', true)`),
  );

const puntosReto = (db: PGlite, a: Actor, n: number) =>
  a.comoPostgres(async () => {
    const { rows } = await db.query<{ p: number }>(
      `select coalesce(sum(points), 0)::int as p from public.point_movements
        where action = 'reto' and user_id = $1 and annulled_at is null`,
      [uid(n)],
    );
    return rows[0]?.p ?? 0;
  });

type Mio = { nombre: string; progreso: number; meta: number; conseguido: boolean; conseguidos: number };
const mios = async (db: PGlite, a: Actor, n: number) => {
  await a.como(uid(n));
  return (await db.query<Mio>('select * from public.retos_mios($1)', [RUTA])).rows;
};

describe('0047: retos', () => {
  it('sellar X bares: puntua al llegar, una sola vez', async () => {
    await conBase(async (db, a) => {
      await reto(db, a, { tipo: 'bares', objetivo: 2 });
      await sellar(db, a, 1, 1, 10);
      assert.equal(await puntosReto(db, a, 1), 0);
      assert.deepEqual((await mios(db, a, 1)).map((r) => [r.progreso, r.meta, r.conseguido]), [[1, 2, false]]);
      await sellar(db, a, 1, 2);
      assert.equal(await puntosReto(db, a, 1), 15);
      assert.equal((await mios(db, a, 1))[0]?.conseguido, true);
      assert.equal(await puntosReto(db, a, 1), 15, 'mirarlo no vuelve a dar');
    });
  });

  it('categorias distintas y consumiciones de una categoria', async () => {
    await conBase(async (db, a) => {
      await reto(db, a, { tipo: 'categorias', objetivo: 2, puntos: 8 });
      await reto(db, a, { tipo: 'consumiciones_categoria', objetivo: 2, categoria: 'sidra', puntos: 4 });
      await consumir(db, a, 1, 'sidra');
      assert.equal(await puntosReto(db, a, 1), 0);
      await consumir(db, a, 1, 'sidra');
      assert.equal(await puntosReto(db, a, 1), 4, 'dos sidras');
      await consumir(db, a, 1, 'sin_alcohol');
      assert.equal(await puntosReto(db, a, 1), 4 + 8, 'y dos categorias');
    });
  });

  it('encuentros por QR: cuenta para los dos', async () => {
    await conBase(async (db, a) => {
      await reto(db, a, { tipo: 'encuentros_qr', objetivo: 1 });
      await a.comoPostgres(() =>
        db.exec(`insert into public.encuentros (route_id, usuarios, house, puntua)
                 values ('${RUTA}', array['${uid(1)}', '${uid(2)}']::uuid[], 'mahou', true)`),
      );
      assert.equal(await puntosReto(db, a, 1), 15);
      assert.equal(await puntosReto(db, a, 2), 15);
      assert.equal(await puntosReto(db, a, 3), 0);
    });
  });

  it('completar la ruta antes de una hora', async () => {
    await conBase(async (db, a) => {
      await reto(db, a, { tipo: 'ruta_antes_de', hora_limite: new Date(Date.now() - 5 * 60_000).toISOString() });
      await sellar(db, a, 1, 1, 30);
      await sellar(db, a, 1, 2, 10);
      assert.equal(await puntosReto(db, a, 1), 15, 'acabo hace 10 min, el limite era hace 5');
      await sellar(db, a, 2, 1, 30);
      await sellar(db, a, 2, 2, 0);
      assert.equal(await puntosReto(db, a, 2), 0, 'acabo tarde');
    });
  });

  it('con limite de personas solo puntuan los primeros', async () => {
    await conBase(async (db, a) => {
      await reto(db, a, { tipo: 'bares', objetivo: 1, max_personas: 2 });
      for (const n of [1, 2, 3]) await sellar(db, a, n, 1);
      assert.deepEqual([await puntosReto(db, a, 1), await puntosReto(db, a, 2), await puntosReto(db, a, 3)], [15, 15, 0]);
      assert.equal((await mios(db, a, 3))[0]?.conseguidos, 2);
    });
  });

  it('un reto creado despues se da al mirarlo; desactivado, ni puntua ni se ve (salvo si ya lo tenias)', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      const id = await reto(db, a, { tipo: 'bares', objetivo: 1 });
      assert.equal(await puntosReto(db, a, 1), 0);
      assert.equal((await mios(db, a, 1))[0]?.conseguido, true);
      assert.equal(await puntosReto(db, a, 1), 15);
      await a.como(ADMIN);
      await db.query('update public.retos set activo = false where id = $1', [id]);
      await sellar(db, a, 2, 1);
      assert.equal(await puntosReto(db, a, 2), 0);
      assert.equal((await mios(db, a, 2)).length, 0);
      assert.equal((await mios(db, a, 1)).length, 1, 'quien lo consiguio lo sigue viendo');
      assert.equal(await puntosReto(db, a, 1), 15, 'y conserva los puntos');
    });
  });

  it('solo quien administra crea retos, y las condiciones tienen tope', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(
        () => db.query(`insert into public.retos (route_id, nombre, tipo, puntos) values ($1, 'Mio', 'bares', 50)`, [RUTA]),
        /row-level security/,
      );
      await a.falla(() => reto(db, a, { tipo: 'consumiciones_categoria', objetivo: 5, categoria: 'chupito' }), /retos_condicion_check/);
      await a.falla(() => reto(db, a, { tipo: 'consumiciones_categoria', objetivo: 2 }), /retos_condicion_check/);
      await a.falla(() => reto(db, a, { tipo: 'ruta_antes_de' }), /retos_condicion_check/);
      await reto(db, a, { tipo: 'consumiciones_categoria', objetivo: 5, categoria: 'sin_alcohol' });
    });
  });

  it('fuera de la ruta no se ven', async () => {
    await conBase(async (db, a) => {
      await reto(db, a, { tipo: 'bares', objetivo: 1 });
      await a.comoPostgres(() => db.exec(`insert into auth.users (id, email) values ('${uid(9)}', 'u9@example.com')`));
      await a.como(uid(9));
      assert.equal((await db.query('select * from public.retos')).rows.length, 0);
      await a.falla(() => db.query('select * from public.retos_mios($1)', [RUTA]), /FORBIDDEN/);
    });
  });
});
