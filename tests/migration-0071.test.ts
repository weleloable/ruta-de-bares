import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { ID_QUIJOTE } from '../src/features/minijuegos/juegos/quijote/modelo.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/** 0071: Don Quijote Cervecero entra en el ranking de la ruta (con un techo de seguridad). */

const migraciones = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0071_zzz')
  .map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin', display_name = 'Admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values ('${RUTA}', 'Ruta', true, '${ADMIN}', current_date);
  ${[1, 2]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
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

const enviar = (db: PGlite, juego: string, nota: number) =>
  db.query<{ r: { best: number; is_record: boolean } }>('select public.minigame_submit_nota($1, $2, $3) as r', [RUTA, juego, nota]);

/** Deja pasar el limite de un envio cada 4 s. */
const sinPrisa = (db: PGlite, a: Actor) =>
  a.comoPostgres(async () => {
    await db.query(`update public.minigame_scores set last_submit_at = now() - interval '1 minute'`);
  });

describe('0071: ranking de Don Quijote Cervecero', () => {
  it('se guarda la mejor partida y sale en el ranking, de mas a menos', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      assert.equal((await enviar(db, ID_QUIJOTE, 2350)).rows[0]!.r.best, 2350);
      await sinPrisa(db, a);
      assert.equal((await enviar(db, ID_QUIJOTE, 1200)).rows[0]!.r.is_record, false);
      await a.como(uid(2));
      await enviar(db, ID_QUIJOTE, 5400);
      const { rows } = await db.query<{ display_name: string; score: number }>('select * from public.minigame_ranking($1, $2)', [RUTA, ID_QUIJOTE]);
      assert.deepEqual(
        rows.map((r) => [r.display_name, Number(r.score)]),
        [
          ['Persona2', 5400],
          ['Persona1', 2350],
        ],
      );
    });
  });

  it('enteros, sin negativos y con un techo que nadie alcanza jugando', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, ID_QUIJOTE, -1), /INVALID_SCORE/);
      await a.falla(() => enviar(db, ID_QUIJOTE, 10.5), /INVALID_SCORE/);
      await a.falla(() => enviar(db, ID_QUIJOTE, 10000001), /INVALID_SCORE/);
      assert.equal((await enviar(db, ID_QUIJOTE, 10000000)).rows[0]!.r.best, 10000000);
    });
  });

  it('los demas juegos siguen igual', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      assert.equal((await enviar(db, 'tapon-al-vuelo', 900)).rows[0]!.r.best, 900);
      await a.falla(() => enviar(db, 'tapon-al-vuelo', 5000), /INVALID_SCORE/);
      await a.falla(() => enviar(db, 'juego-inventado', 5), /INVALID_GAME/);
    });
  });
});
