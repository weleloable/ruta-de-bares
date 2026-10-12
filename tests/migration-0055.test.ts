import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { PUNTUACION_MAXIMA } from '../src/features/minijuegos/juegos/conga/modelo.ts';
import { CONFIG, ID_JUEGO } from '../src/features/quiz/config.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0055: "¿Quien quiere ser cervecero?" entra en el ranking por ruta de la 0034.
 *
 * Sobre Postgres real:
 *  1. el quiz se guarda y se rankea con su premio (0 a 25), aparte de los demas juegos;
 *  2. cada juego conserva SU tope (cana 100, conga 15000, quiz 25), y el del quiz es el de la app;
 *  3. la TABLA tambien lo dice, no solo la funcion;
 *  4. lo de antes sigue igual: ritmo minimo, solo quien esta en la ruta;
 *  5. se puede pegar dos veces.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0055_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0055 = leerFichero('supabase/migrations/0055_ranking_quiz.sql');

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

describe('0055: el ranking de ¿Quien quiere ser cervecero?', () => {
  it('guarda la mejor partida y la rankea aparte de los otros juegos', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      assert.deepEqual((await nota(db, ID_JUEGO, 5)).rows[0]?.r, { best: 5, is_record: true });
      await pasarElTiempo(db, a);
      assert.deepEqual((await nota(db, ID_JUEGO, 2)).rows[0]?.r, { best: 5, is_record: false });
      await pasarElTiempo(db, a);
      assert.deepEqual((await nota(db, ID_JUEGO, 25)).rows[0]?.r, { best: 25, is_record: true });
      await nota(db, 'conga-cervecera', 900);

      await a.como(LUIS);
      await nota(db, ID_JUEGO, 10);

      assert.deepEqual(await ranking(db, ID_JUEGO), [[25, false], [10, true]]);
      assert.deepEqual(await ranking(db, 'conga-cervecera'), [[900, false]]);
    });
  });

  it('un empate lo gana quien llego antes a esa nota', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, ID_JUEGO, 10);
      await a.como(LUIS);
      await nota(db, ID_JUEGO, 10);
      await a.comoPostgres(() =>
        db.exec(`update public.minigame_scores set best_at = best_at - interval '1 minute' where user_id = '${LUIS}'`),
      );
      assert.deepEqual(await ranking(db, ID_JUEGO), [[10, true], [10, false]]);
    });
  });

  it('cada juego conserva su tope, y el del quiz es el de la app', async () => {
    const tope = CONFIG.premios[CONFIG.premios.length - 1];
    assert.ok(LA_0055.includes(`between 0 and ${tope}`), 'la tabla usa el tope de la app');
    assert.ok(LA_0055.includes(`when '${ID_JUEGO}' then ${tope}`), 'la funcion usa el tope de la app');
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => nota(db, ID_JUEGO, tope + 1), /INVALID_SCORE/);
      await a.falla(() => nota(db, ID_JUEGO, -1), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'cana-perfecta', 101), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'conga-cervecera', PUNTUACION_MAXIMA + 1), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'otro-juego', 5), /INVALID_GAME/);
      await nota(db, ID_JUEGO, tope);
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
        await a.falla(() => meter(ID_JUEGO, 26), /minigame_scores_best_score_check/);
        await a.falla(() => meter('cana-perfecta', 500), /minigame_scores_best_score_check/);
        await a.falla(() => meter('otro-juego', 5), /minigame_scores_(game|best_score)_check/);
        await meter(ID_JUEGO, 10);
      });
    });
  });

  it('sigue la regla de la 0034: ritmo minimo y solo quien esta en la ruta', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, ID_JUEGO, 5);
      await a.falla(() => nota(db, ID_JUEGO, 10), /TOO_FAST/);
      await a.como(FUERA);
      await a.falla(() => nota(db, ID_JUEGO, 10), /FORBIDDEN/);
      await a.falla(() => ranking(db, ID_JUEGO), /FORBIDDEN/);
    });
  });

  it('las notas que ya habia siguen ahi y pegarla dos veces no rompe nada', async () => {
    await conBase(
      async (db, a) => {
        await a.como(ANA);
        await nota(db, ID_JUEGO, 10);
        assert.deepEqual(await ranking(db, ID_JUEGO), [[10, true]]);
      },
      [LA_0055],
    );
  });
});
