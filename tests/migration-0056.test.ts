import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { PUNTUACION_MAXIMA as MAX_CONGA } from '../src/features/minijuegos/juegos/conga/modelo.ts';
import { PUNTUACION_MAXIMA as MAX_TAPON } from '../src/features/minijuegos/juegos/tapon/modelo.ts';
import { CONFIG, ID_JUEGO as ID_QUIZ } from '../src/features/quiz/config.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0056: "Tapon al Vuelo" entra en el ranking por ruta.
 *
 * Sobre Postgres real:
 *  1. se guarda y se rankea, aparte de los demas juegos;
 *  2. su tope es PUNTUACION_MAXIMA del modelo: lo acepta y rechaza uno mas;
 *  3. los TRES juegos anteriores siguen aceptandose con sus topes (y no mas);
 *  4. la TABLA tambien lo dice, no solo la funcion;
 *  5. ritmo minimo y solo quien esta en la ruta, como siempre;
 *  6. se puede pegar dos veces.
 */

const TAPON = 'tapon-al-vuelo';
const MAX_QUIZ = CONFIG.premios[CONFIG.premios.length - 1] as number;

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0056_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0056 = leerFichero('supabase/migrations/0056_ranking_tapon.sql');

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

describe('0056: el ranking de Tapon al Vuelo', () => {
  it('el tope del SQL es PUNTUACION_MAXIMA del modelo', () => {
    assert.equal(MAX_TAPON, 1250);
    assert.ok(LA_0056.includes(`when '${TAPON}' then ${MAX_TAPON}`), 'la funcion');
    assert.ok(LA_0056.includes(`game = '${TAPON}' and best_score between 0 and ${MAX_TAPON}`), 'la tabla');
  });

  it('guarda la mejor partida y la rankea aparte', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      assert.deepEqual((await nota(db, TAPON, 340)).rows[0]?.r, { best: 340, is_record: true });
      await nota(db, ID_QUIZ, 10);
      await a.como(LUIS);
      await nota(db, TAPON, 815);
      assert.deepEqual(await ranking(db, TAPON), [[815, true], [340, false]]);
      assert.deepEqual(await ranking(db, ID_QUIZ), [[10, false]]);
    });
  });

  it('acepta el tope y rechaza tope + 1; los tres juegos de antes conservan los suyos', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => nota(db, TAPON, MAX_TAPON + 1), /INVALID_SCORE/);
      await a.falla(() => nota(db, TAPON, -1), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'cana-perfecta', 101), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'conga-cervecera', MAX_CONGA + 1), /INVALID_SCORE/);
      await a.falla(() => nota(db, ID_QUIZ, MAX_QUIZ + 1), /INVALID_SCORE/);
      await a.falla(() => nota(db, 'otro-juego', 5), /INVALID_GAME/);
      // Cada juego tiene su propio ritmo minimo: se pueden mandar seguidos.
      await nota(db, TAPON, MAX_TAPON);
      await nota(db, 'cana-perfecta', 100);
      await nota(db, 'conga-cervecera', MAX_CONGA);
      await nota(db, ID_QUIZ, MAX_QUIZ);
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
        await a.falla(() => meter(TAPON, MAX_TAPON + 1), /minigame_scores_best_score_check/);
        await a.falla(() => meter(ID_QUIZ, MAX_QUIZ + 1), /minigame_scores_best_score_check/);
        await meter(TAPON, MAX_TAPON);
      });
    });
  });

  it('sigue la regla de la 0034: ritmo minimo y solo quien esta en la ruta', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, TAPON, 50);
      await a.falla(() => nota(db, TAPON, 60), /TOO_FAST/);
      await a.como(FUERA);
      await a.falla(() => nota(db, TAPON, 60), /FORBIDDEN/);
      await a.falla(() => ranking(db, TAPON), /FORBIDDEN/);
    });
  });

  it('las notas que ya habia siguen ahi y pegarla dos veces no rompe nada', async () => {
    await conBase(
      async (db, a) => {
        await a.como(ANA);
        await nota(db, TAPON, 700);
        await a.como(LUIS);
        await nota(db, ID_QUIZ, 25);
        assert.deepEqual(await ranking(db, TAPON), [[700, false]]);
      },
      [LA_0056],
    );
  });
});
