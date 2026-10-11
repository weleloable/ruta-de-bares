import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { crearBase, escenario, leerFichero } from './pglite-supabase.ts';

/**
 * 0051: La Cana ensena quien es moderador.
 * `match_grid` devuelve `es_admin` (solo un si/no): true para quien administra.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0051_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('0051: moderador en La Cana', () => {
  it('la lista marca al admin y no a los demas', async () => {
    const db = await crearBase(migraciones);
    try {
      await db.exec(`
        insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
        update public.profiles set role = 'admin' where id = '${ADMIN}';
        insert into public.routes (id, name, is_published, created_by, event_date)
        values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
        ${[1, 2, 3]
          .map(
            (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
                    insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
          )
          .join('\n')}
        insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ADMIN}');
        insert into public.match_profiles (user_id, is_active, bio) values
          ('${ADMIN}', true, 'hola'), ('${uid(1)}', true, 'hola'), ('${uid(2)}', true, 'hola'), ('${uid(3)}', true, 'hola');
        insert into public.match_route_activations (route_id, user_id) values
          ('${RUTA}', '${ADMIN}'), ('${RUTA}', '${uid(1)}'), ('${RUTA}', '${uid(2)}'), ('${RUTA}', '${uid(3)}');
      `);
      await escenario(db, async (a) => {
        await a.como(uid(1));
        const { rows } = await db.query<{ user_id: string; es_admin: boolean }>('select user_id, es_admin from public.match_grid($1)', [RUTA]);
        assert.equal(rows.length, 3);
        assert.deepEqual(
          Object.fromEntries(rows.map((r) => [r.user_id, r.es_admin])),
          { [ADMIN]: true, [uid(2)]: false, [uid(3)]: false },
        );
      });
    } finally {
      await db.close();
    }
  });
});
