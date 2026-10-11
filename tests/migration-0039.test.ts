import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { PUNTUACION_MAXIMA } from '../src/features/minijuegos/juegos/conga/modelo.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0039: La Conga Cervecera entra en el ranking por ruta de la 0034.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. la conga se guarda y se rankea con sus puntos de partida (mas de 100), y
 *     su ranking no se mezcla con el de La Cana Perfecta;
 *  2. cada juego conserva SU tope: la cana sigue en 0..100 aunque la conga acepte
 *     mas, y la conga no pasa del tope, que es el mismo que el de la app;
 *  3. las restricciones de la TABLA tambien lo dicen (no solo la funcion);
 *  4. lo de la 0034 sigue igual: ritmo minimo, solo quien esta en la ruta;
 *  5. se puede pegar dos veces.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0039_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0039 = leerFichero('supabase/migrations/0039_ranking_conga.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const FUERA = '00000000-0000-4000-8000-00000000000e';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${FUERA}', 'fuera@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date + 10);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>, extra: string[] = []) {
  const db = await crearBase([...migraciones, ...extra]);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const nota = (db: PGlite, juego: string, puntos: number) =>
  db.query<{ r: { best: number; is_record: boolean } }>(`select public.minigame_submit_score($1, $2, $3) as r`, [
    RUTA,
    juego,
    puntos,
  ]);

const ranking = async (db: PGlite, juego: string) =>
  (await db.query<{ score: number; is_me: boolean }>(`select * from public.minigame_ranking($1, $2)`, [RUTA, juego])).rows.map(
    (r) => [r.score, r.is_me],
  );

/** El envio esta espaciado: para el siguiente se retrasa la ultima marca. */
async function pasarElTiempo(db: PGlite, a: Actor) {
  await a.comoPostgres(() => db.exec(`update public.minigame_scores set last_submit_at = last_submit_at - interval '1 hour'`));
}

describe('0039: el ranking de La Conga Cervecera', () => {
  it('guarda la mejor partida con sus puntos y la rankea aparte de la cana', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      assert.deepEqual((await nota(db, 'conga-cervecera', 435)).rows[0]?.r, { best: 435, is_record: true });
      await pasarElTiempo(db, a);
      assert.deepEqual((await nota(db, 'conga-cervecera', 120)).rows[0]?.r, { best: 435, is_record: false });
      await pasarElTiempo(db, a);
      assert.deepEqual((await nota(db, 'conga-cervecera', 910)).rows[0]?.r, { best: 910, is_record: true });
      // La cana va por su lado: el ritmo minimo es por juego, asi que no hay que esperar.
      await nota(db, 'cana-perfecta', 80);

      await a.como(LUIS);
      await nota(db, 'conga-cervecera', 300);

      assert.deepEqual(await ranking(db, 'conga-cervecera'), [[910, false], [300, true]]);
      assert.deepEqual(await ranking(db, 'cana-perfecta'), [[80, false]]);
    });
  });

  it('cada juego conserva su tope, y el de la conga es el de la app', async () => {
    assert.ok(LA_0039.includes(`between 0 and ${PUNTUACION_MAXIMA}`), 'la tabla usa el tope de la app');
    assert.ok(LA_0039.includes(`'conga-cervecera' then ${PUNTUACION_MAXIMA}`), 'la funcion usa el tope de la app');
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => nota(db, 'cana-perfecta', 101), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'conga-cervecera', PUNTUACION_MAXIMA + 1), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'conga-cervecera', -1), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'otro-juego', 5), /INVALID_GAME/);
      await nota(db, 'conga-cervecera', PUNTUACION_MAXIMA);
      await nota(db, 'cana-perfecta', 100);
    });
  });

  it('la tabla tambien lo impide, aunque se escriba sin pasar por la funcion', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        const meter = (juego: string, puntos: number) =>
          db.query(`insert into public.minigame_scores (route_id, user_id, game, best_score) values ($1, $2, $3, $4)`, [
            RUTA,
            ANA,
            juego,
            puntos,
          ]);
        await a.falla(() => meter('cana-perfecta', 500), /minigame_scores_best_score_check/);
        await a.falla(() => meter('conga-cervecera', PUNTUACION_MAXIMA + 1), /minigame_scores_best_score_check/);
        // Un juego desconocido incumple las dos restricciones; Postgres nombra la primera que mira.
        await a.falla(() => meter('otro-juego', 5), /minigame_scores_(game|best_score)_check/);
        await meter('conga-cervecera', 500);
      });
    });
  });

  it('sigue la regla de la 0034: ritmo minimo y solo quien esta en la ruta', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, 'conga-cervecera', 50);
      await a.falla(() => nota(db, 'conga-cervecera', 60), /TOO_FAST/);
      await a.como(FUERA);
      await a.falla(() => nota(db, 'conga-cervecera', 60), /FORBIDDEN/);
      await a.falla(() => ranking(db, 'conga-cervecera'), /FORBIDDEN/);
    });
  });

  it('las notas que ya habia siguen ahi y pegarla dos veces no rompe nada', async () => {
    await conBase(
      async (db, a) => {
        await a.como(ANA);
        await nota(db, 'conga-cervecera', 700);
        assert.deepEqual(await ranking(db, 'conga-cervecera'), [[700, true]]);
      },
      [LA_0039],
    );
  });
});
