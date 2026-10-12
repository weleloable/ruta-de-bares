import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0059: estadisticas de auditoria (una ruta) y globales (todas / una temporada).
 *
 *  1. auditoria: anulados con sus motivos mas repetidos, ajustes netos y cambios de casa;
 *  2. global: totales y una fila por ruta, filtrable por temporada;
 *  3. solo admins.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0059_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = (n: number) => `00000000-0000-4000-8000-0000000000f${n}`;
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.temporadas (id, nombre) values ('00000000-0000-4000-8000-0000000000e1', 'Otoño');
  insert into public.routes (id, name, is_published, created_by, event_date, temporada_id) values
    ('${RUTA(1)}', 'Primera', true, '${ADMIN}', current_date - 7, '00000000-0000-4000-8000-0000000000e1'),
    ('${RUTA(2)}', 'Segunda', true, '${ADMIN}', current_date, null);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR(1)}', '${RUTA(1)}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(2)}', '${RUTA(1)}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(3)}', '${RUTA(2)}', 0, 'Tres', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              insert into public.user_houses (user_id, house) values ('${uid(n)}', 'mahou');
              insert into public.route_members (route_id, user_id) values ('${RUTA(1)}', '${uid(n)}');`,
    )
    .join('\n')}
  insert into public.route_members (route_id, user_id) values ('${RUTA(2)}', '${uid(1)}'), ('${RUTA(2)}', '${uid(2)}');
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

const sellar = (db: PGlite, a: Actor, n: number, bar: number) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m)
             values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5)`),
  );

describe('0059: auditoria y global', () => {
  it('auditoria: anulados con motivos, ajustes netos y cambios de casa', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 2, 1);
      await sellar(db, a, 3, 1);
      await a.como(ADMIN);
      await db.query(`select public.casas_admin_ajuste($1, 'mahou', 10, 'Premio del bar')`, [RUTA(1)]);
      await db.query(`select public.casas_admin_ajuste($1, 'mahou', -4, 'Penalizacion')`, [RUTA(1)]);
      const { rows: movs } = await db.query<{ id: number }>(
        `select id from public.casas_admin_movimientos($1, null, $2, 'sello')`,
        [RUTA(1), uid(1)],
      );
      await db.query('select public.casas_admin_anular($1, $2)', [movs[0]!.id, 'Selló desde casa']);
      const { rows: movs2 } = await db.query<{ id: number }>(
        `select id from public.casas_admin_movimientos($1, null, $2, 'sello')`,
        [RUTA(1), uid(2)],
      );
      await db.query('select public.casas_admin_anular($1, $2)', [movs2[0]!.id, 'Selló desde casa']);
      await db.query(`select public.casas_admin_cambiar_casa($1, 'alhambra', 'Se equivocó')`, [uid(3)]);

      const { rows } = await db.query<{ r: { anulados: { n: number; puntos: number; motivos: { motivo: string; n: number }[] }; ajustes: { n: number; puntos: number }; cambios_casa: number } }>(
        'select public.admin_estadisticas_auditoria($1) as r',
        [RUTA(1)],
      );
      const r = rows[0]!.r;
      assert.equal(r.anulados.n >= 2, true);
      assert.deepEqual(r.anulados.motivos[0], { motivo: 'Selló desde casa', n: 2 });
      assert.deepEqual(r.ajustes, { n: 2, puntos: 6 });
      assert.equal(r.cambios_casa, 1);
      const { rows: otra } = await db.query<{ r: { anulados: { n: number }; cambios_casa: number } }>(
        'select public.admin_estadisticas_auditoria($1) as r',
        [RUTA(2)],
      );
      assert.equal(otra[0]!.r.anulados.n, 0);
      assert.equal(otra[0]!.r.cambios_casa, 0, 'la persona cambiada solo esta en la ruta 1');
    });
  });

  it('global: totales y una fila por ruta; filtra por temporada', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 1, 2);
      await sellar(db, a, 2, 1);
      await sellar(db, a, 1, 3);
      await a.como(ADMIN);
      type G = { totales: Record<string, number>; rutas: { nombre: string; personas: number; sellos: number; completaron: number; cerrada: boolean }[] };
      const todo = (await db.query<{ r: G }>('select public.admin_estadisticas_global() as r')).rows[0]!.r;
      assert.deepEqual([todo.totales.rutas, todo.totales.personas, todo.totales.sellos], [2, 3, 4]);
      assert.deepEqual(todo.rutas.map((x) => x.nombre), ['Segunda', 'Primera'], 'la mas reciente primero');
      const primera = todo.rutas.find((x) => x.nombre === 'Primera')!;
      assert.deepEqual([primera.personas, primera.sellos, primera.completaron, primera.cerrada], [3, 3, 1, false]);
      await db.query('select public.casas_cerrar_ruta($1)', [RUTA(1)]);
      const t = (await db.query<{ r: G }>('select public.admin_estadisticas_global($1) as r', ['00000000-0000-4000-8000-0000000000e1'])).rows[0]!.r;
      assert.deepEqual([t.totales.rutas, t.totales.sellos], [1, 3]);
      assert.equal(t.rutas[0]?.cerrada, true);
    });
  });

  it('solo admins', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => db.query('select public.admin_estadisticas_global()'), /./);
      await a.falla(() => db.query('select public.admin_estadisticas_auditoria($1)', [RUTA(1)]), /./);
    });
  });
});
