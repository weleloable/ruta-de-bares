import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0048: panel "Casas y puntuaciones".
 *
 *  1. solo quien administra;
 *  2. anular con motivo y ajustes a mano;
 *  3. cambiar las reglas cambia lo que se da desde ese momento;
 *  4. cambio de casa: lo suyo se mueve, racha y QR se anulan, y queda apuntado;
 *  5. estadisticas por casa;
 *  6. "descargar mis datos" lleva consumiciones, encuentros y cambios de casa.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0048_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const NOMBRE: Record<number, string> = { 1: 'Ana', 2: 'Bea', 3: 'Carla', 4: 'Dani' };

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

const sellar = (db: PGlite, a: Actor, n: number, bar: number, minutos = 0) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m, stamped_at)
             values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5, now() - interval '${minutos} minutes')`),
  );

const total = (db: PGlite, a: Actor, casa: string) =>
  a.comoPostgres(async () => {
    const { rows } = await db.query<{ p: number }>(
      `select coalesce(sum(points), 0)::int as p from public.point_movements where house = $1 and annulled_at is null`,
      [casa],
    );
    return rows[0]?.p ?? 0;
  });

type Mov = { id: number; action: string; points: number; persona: string | null; annulled_at: string | null; annul_reason: string | null };
const movimientos = async (db: PGlite, a: Actor, filtros = '') => {
  await a.como(ADMIN);
  return (await db.query<Mov>(`select * from public.casas_admin_movimientos(${filtros})`)).rows;
};

describe('0048: panel de casas', () => {
  it('solo quien administra', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      for (const q of [
        'select * from public.casas_admin_movimientos()',
        `select public.casas_admin_anular(1, 'motivo')`,
        `select public.casas_admin_ajuste('${RUTA}', 'mahou', 50, 'porque si')`,
        `select public.casas_admin_regla('sello', 100)`,
        `select public.casas_admin_cambiar_casa('${uid(1)}', 'alhambra', 'me apetece')`,
        'select * from public.casas_admin_estadisticas()',
        'select * from public.casas_admin_personas()',
      ]) {
        await a.falla(() => db.query(q), /FORBIDDEN/);
      }
    });
  });

  it('ve todos los movimientos con quien, filtra, y anula con motivo', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 4, 1);
      const todos = await movimientos(db, a);
      assert.equal(todos.length, 2);
      assert.deepEqual(todos.map((m) => m.persona).sort(), ['Ana', 'Dani']);
      assert.equal((await movimientos(db, a, `p_house => 'alhambra'`)).length, 1);
      assert.equal((await movimientos(db, a, `p_user_id => '${uid(1)}'`)).length, 1);
      const mio = (await movimientos(db, a, `p_user_id => '${uid(1)}'`))[0]!;
      await a.falla(() => db.query('select public.casas_admin_anular($1, $2)', [mio.id, '']), /REASON_REQUIRED/);
      await db.query('select public.casas_admin_anular($1, $2)', [mio.id, 'Selló desde casa']);
      assert.equal(await total(db, a, 'mahou'), 0);
      const anulado = (await movimientos(db, a, `p_user_id => '${uid(1)}'`))[0]!;
      assert.equal(anulado.annul_reason, 'Selló desde casa');
      await a.falla(() => db.query('select public.casas_admin_anular($1, $2)', [mio.id, 'otra vez']), /NOT_FOUND/);
    });
  });

  it('ajustes a mano, en positivo o negativo, con motivo', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await db.query(`select public.casas_admin_ajuste($1, 'alhambra', 12, 'Ganó la prueba del bar')`, [RUTA]);
      await db.query(`select public.casas_admin_ajuste($1, 'alhambra', -2, 'Penalización')`, [RUTA]);
      await a.falla(() => db.query(`select public.casas_admin_ajuste($1, 'alhambra', 0, 'nada')`, [RUTA]), /INVALID_POINTS/);
      await a.falla(() => db.query(`select public.casas_admin_ajuste($1, 'heineken', 5, 'nada')`, [RUTA]), /INVALID_HOUSE/);
      assert.equal(await total(db, a, 'alhambra'), 10);
    });
  });

  it('cambiar una regla vale para lo que venga despues', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await a.como(ADMIN);
      await db.query(`select public.casas_admin_regla('sello', 25)`);
      await sellar(db, a, 2, 1);
      assert.equal(await total(db, a, 'mahou'), 10 + 25);
      await a.como(ADMIN);
      const { rows } = await db.query<{ points: number }>(`select points from public.casas_admin_reglas() where action = 'sello'`);
      assert.equal(rows[0]?.points, 25);
    });
  });

  it('cambio de casa: sus puntos se mueven, racha y QR se anulan, y queda apuntado', async () => {
    await conBase(async (db, a) => {
      // Racha de mahou en el bar 1 (personas 1, 2, 3) y un encuentro QR 1-2.
      await sellar(db, a, 1, 1, 30);
      await sellar(db, a, 2, 1, 20);
      await sellar(db, a, 3, 1, 10);
      await a.comoPostgres(() =>
        db.exec(`insert into public.point_movements (route_id, house, action, points, ref, detail)
                 values ('${RUTA}', 'mahou', 'qr', 5, 'qr:x', '{"usuarios": ["${uid(1)}", "${uid(2)}"]}')`),
      );
      assert.equal(await total(db, a, 'mahou'), 3 * 10 + 6 + 5);

      await a.como(ADMIN);
      const { rows } = await db.query<{ r: { movidos: number; anulados: number } }>(
        `select public.casas_admin_cambiar_casa($1, 'alhambra', 'Se equivocó al registrarse') as r`,
        [uid(1)],
      );
      assert.deepEqual(rows[0]?.r, { movidos: 1, anulados: 2 });
      assert.equal(await total(db, a, 'alhambra'), 10, 'su sello se fue con el');
      assert.equal(await total(db, a, 'mahou'), 2 * 10, 'sin racha ni QR');
      await a.comoPostgres(async () => {
        const { rows: casa } = await db.query<{ house: string }>(`select house from public.user_houses where user_id = $1`, [uid(1)]);
        assert.equal(casa[0]?.house, 'alhambra');
        const { rows: razones } = await db.query<{ annul_reason: string }>(
          `select annul_reason from public.point_movements where action in ('racha', 'qr')`,
        );
        assert.ok(razones.every((r) => r.annul_reason === 'Cambio de casa: Se equivocó al registrarse'));
      });
      await a.como(ADMIN);
      const { rows: log } = await db.query<{ de: string; a: string }>('select * from public.casas_admin_cambios()');
      assert.deepEqual([log[0]?.de, log[0]?.a], ['mahou', 'alhambra']);
    });
  });

  it('estadisticas de las cuatro casas', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 1, 2);
      await sellar(db, a, 4, 1);
      await a.como(ADMIN);
      const { rows } = await db.query<{ house: string; puntos: number; miembros: number; por_accion: Record<string, number>; mejor: string | null }>(
        'select * from public.casas_admin_estadisticas($1)',
        [RUTA],
      );
      const mahou = rows.find((r) => r.house === 'mahou')!;
      assert.equal(rows.length, 4);
      assert.equal(mahou.puntos, 10 + 10 + 20);
      assert.equal(mahou.miembros, 3);
      assert.deepEqual(mahou.por_accion, { sello: 20, ruta_completa: 20 });
      assert.equal(mahou.mejor, 'Ana');
      assert.equal(rows.find((r) => r.house === 'cruzcampo')?.puntos, 0);
      const { rows: global } = await db.query<{ house: string; miembros: number }>('select * from public.casas_admin_estadisticas()');
      assert.equal(global.find((r) => r.house === 'mahou')?.miembros, 3);
    });
  });

  it('descargar mis datos lleva consumiciones, encuentros, cambios de casa y la racha', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1, 30);
      await sellar(db, a, 2, 1, 20);
      await sellar(db, a, 3, 1, 10);
      await a.como(uid(1));
      await db.query(`select public.registrar_consumicion($1, 'sin_alcohol')`, [BAR(1)]);
      await a.comoPostgres(() =>
        db.exec(`insert into public.encuentros (route_id, usuarios, house, puntua)
                 values ('${RUTA}', array['${uid(1)}', '${uid(2)}']::uuid[], 'mahou', true)`),
      );
      await a.como(uid(1));
      const { rows } = await db.query<{ d: Record<string, unknown[]> }>('select public.export_my_data() as d');
      const d = rows[0]!.d;
      assert.equal(d.consumiciones?.length, 1);
      assert.deepEqual((d.encuentros?.[0] as { con: string[] }).con, ['Bea']);
      assert.deepEqual(d.cambios_de_casa, []);
      assert.ok((d.puntos as { accion: string }[]).some((p) => p.accion === 'racha'), 'la racha en la que estuvo');
      assert.ok(d.cana !== undefined && d.sellos !== undefined, 'lo de antes sigue');
    });
  });
});
