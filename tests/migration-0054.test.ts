import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { crearBase, escenario, leerFichero } from './pglite-supabase.ts';

/** 0054: cualquiera con sesion ve cuanto vale cada accion (y el cambio de un admin se nota). */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0054_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const USUARIO = '00000000-0000-4000-8000-000000000001';

describe('0054: puntos visibles', () => {
  it('cualquiera ve los valores actuales; la tabla sigue cerrada', async () => {
    const db = await crearBase(migraciones);
    try {
      await db.exec(`
        insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${USUARIO}', 'u1@example.com');
        update public.profiles set role = 'admin' where id = '${ADMIN}';
      `);
      await escenario(db, async (a) => {
        await a.como(USUARIO);
        const { rows } = await db.query<{ action: string; points: number }>('select * from public.casas_puntos()');
        const por = Object.fromEntries(rows.map((r) => [r.action, r.points]));
        assert.equal(por.sello, 10);
        assert.equal(por.podio_1, 10);
        assert.equal(por.qr, 5);
        await a.falla(() => db.query('select * from public.point_rules'), /permission denied/);

        await a.como(ADMIN);
        await db.query(`select public.casas_admin_regla('sello', 12)`);
        await a.como(USUARIO);
        const { rows: despues } = await db.query<{ points: number }>(`select points from public.casas_puntos() where action = 'sello'`);
        assert.equal(despues[0]?.points, 12);
      });
    } finally {
      await db.close();
    }
  });
});
