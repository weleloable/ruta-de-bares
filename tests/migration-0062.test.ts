import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { crearBase, escenario, leerFichero } from './pglite-supabase.ts';

/** 0062: "descargar mis datos" trae los sorteos en los que saliste y el tiempo del quiz. */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0062_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('0062: exportar sorteos y tiempo del quiz', () => {
  it('sale el sorteo (ganador o suplente) y el tiempo del quiz; lo de antes sigue', async () => {
    const db = await crearBase(migraciones);
    try {
      await db.exec(`
        insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${uid(1)}', 'u1@example.com'), ('${uid(2)}', 'u2@example.com');
        update public.profiles set role = 'admin' where id = '${ADMIN}';
        insert into public.routes (id, name, is_published, created_by, event_date) values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
        insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(1)}'), ('${RUTA}', '${uid(2)}');
        insert into public.sorteos (route_id, premio, ganador, suplentes, participantes)
          values ('${RUTA}', 'una camiseta', '${uid(1)}', array['${uid(2)}']::uuid[], 2);
        insert into public.minigame_scores (route_id, user_id, game, best_score, best_ms, best_at)
          values ('${RUTA}', '${uid(1)}', 'quien-quiere-ser-cervecero', 4, 41300, now());
      `);
      await escenario(db, async (a) => {
        type D = { sorteos: { premio: string; saliste_como: string }[]; minijuegos: { records: { tiempo_ms: number }[] }; sellos: unknown[] };
        await a.como(uid(1));
        const yo = (await db.query<{ d: D }>('select public.export_my_data() as d')).rows[0]!.d;
        assert.deepEqual(yo.sorteos.map((s) => [s.premio, s.saliste_como]), [['una camiseta', 'ganador']]);
        assert.equal(yo.minijuegos.records[0]?.tiempo_ms, 41300);
        assert.ok(Array.isArray(yo.sellos), 'lo de antes sigue');
        await a.como(uid(2));
        const otra = (await db.query<{ d: D }>('select public.export_my_data() as d')).rows[0]!.d;
        assert.deepEqual(otra.sorteos.map((s) => s.saliste_como), ['suplente']);
      });
    } finally {
      await db.close();
    }
  });
});
