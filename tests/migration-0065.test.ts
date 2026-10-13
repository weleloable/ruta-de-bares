import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { crearBase, escenario, leerFichero } from './pglite-supabase.ts';

/**
 * 0065: `casas_admin_regla` sigue haciendo lo mismo que en la 0048 (cambia la
 * regla, avisa al tiempo real de TODAS las rutas, solo para admins) pero con
 * `where true`. Que la sentencia lleve WHERE lo vigila
 * tests/migraciones-sin-update-suelto.test.ts: PGlite no tiene pg-safeupdate,
 * asi que aqui solo se comprueba que el comportamiento no cambio.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0065_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const USUARIA = '00000000-0000-4000-8000-000000000001';
const RUTA = (n: number) => `00000000-0000-4000-8000-0000000000f${n}`;

describe('0065: cambiar los puntos de una accion', () => {
  it('cambia la regla y marca TODAS las rutas como cambiadas', async () => {
    const db = await crearBase(migraciones);
    try {
      await db.exec(`
        insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${USUARIA}', 'u@example.com');
        update public.profiles set role = 'admin' where id = '${ADMIN}';
        insert into public.routes (id, name, is_published, created_by, event_date) values
          ('${RUTA(1)}', 'Una', true, '${ADMIN}', current_date),
          ('${RUTA(2)}', 'Otra', true, '${ADMIN}', current_date);
        update public.casas_marcador set cambiado_at = '2000-01-01'::timestamptz where route_id in ('${RUTA(1)}', '${RUTA(2)}');
      `);
      await escenario(db, async (a) => {
        await a.como(ADMIN);
        await db.query(`select public.casas_admin_regla('sello', 33)`);
        const { rows } = await db.query<{ points: number }>(`select points from public.casas_admin_reglas() where action = 'sello'`);
        assert.equal(rows[0]?.points, 33);
        await a.comoPostgres(async () => {
          const { rows: marcadores } = await db.query<{ viejos: number }>(
            `select count(*)::int as viejos from public.casas_marcador where cambiado_at < '2001-01-01'::timestamptz`,
          );
          assert.equal(marcadores[0]?.viejos, 0, 'alguna ruta no se entero del cambio');
        });
      });
    } finally {
      await db.close();
    }
  });

  it('sigue siendo solo para admins, y rechaza puntos fuera de rango o una accion que no existe', async () => {
    const db = await crearBase(migraciones);
    try {
      await db.exec(`
        insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${USUARIA}', 'u@example.com');
        update public.profiles set role = 'admin' where id = '${ADMIN}';
      `);
      await escenario(db, async (a) => {
        await a.como(USUARIA);
        await a.falla(() => db.query(`select public.casas_admin_regla('sello', 5)`), /FORBIDDEN/);
        await a.como(ADMIN);
        await a.falla(() => db.query(`select public.casas_admin_regla('sello', 1001)`), /INVALID_POINTS/);
        await a.falla(() => db.query(`select public.casas_admin_regla('sello', -1)`), /INVALID_POINTS/);
        await a.falla(() => db.query(`select public.casas_admin_regla('no_existe', 5)`), /NOT_FOUND/);
      });
    } finally {
      await db.close();
    }
  });
});
