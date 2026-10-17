import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { ID_BARMAN, PUNTUACION_MAXIMA } from '../src/features/minijuegos/juegos/barman/modelo.ts';
import { ID_PAREJAS } from '../src/features/minijuegos/juegos/parejas/modelo.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0073: Barman Express en el ranking por ruta y en el podio de las casas.
 * Entero y MAS es mejor. El tope SQL se lee del modelo (PUNTUACION_MAXIMA), no
 * se copia a mano. Y todos los juegos de antes siguen como estaban.
 */

const migraciones = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql') && f <= '0073_zzz')
  .sort()
  .map((n) => leerFichero(`supabase/migrations/${n}`));
const M73 = leerFichero('supabase/migrations/0073_barman_express.sql');

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const B = ID_BARMAN;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin', display_name = 'Admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values ('${RUTA}', 'Ruta', true, '${ADMIN}', current_date);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ADMIN}');
  ${[1, 2, 3, 4]
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

const enviar = (db: PGlite, juego: string, nota: number | string, ms: number | null = null) =>
  db.query<{ r: { best: number; is_record: boolean } }>('select public.minigame_submit_nota($1, $2, $3, $4) as r', [RUTA, juego, nota, ms]);
const esperar4s = (db: PGlite, a: Actor, quien: string, juego: string) =>
  a.comoPostgres(() =>
    db.query(`update public.minigame_scores set last_submit_at = now() - interval '10 seconds' where user_id = $1 and game = $2`, [quien, juego]),
  );
const notas = (db: PGlite, a: Actor, juego: string, filas: [number, number][]) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.minigame_scores (route_id, user_id, game, best_score, best_at) values ${filas
      .map(([n, nota], i) => `('${RUTA}', '${uid(n)}', '${juego}', ${nota}, now() + interval '${i} minutes')`)
      .join(', ')};`),
  );

describe('0073: el tope es el del modelo', () => {
  it('el case y el check llevan PUNTUACION_MAXIMA, leida del modelo', () => {
    assert.match(M73, new RegExp(`when '${B}' then ${PUNTUACION_MAXIMA}\\b`));
    assert.match(M73, new RegExp(`game = '${B}' and best_score between 0 and ${PUNTUACION_MAXIMA} and best_score = trunc\\(best_score\\)`));
  });

  it('no entra en minijuego_menos_es_mejor (mas es mejor)', async () => {
    await conBase(async (db) => {
      const r = await db.query<{ v: boolean }>(`select public.minijuego_menos_es_mejor('${B}') as v`);
      assert.equal(r.rows[0]?.v, false);
    });
  });
});

describe('0073: guardar Barman Express', () => {
  it('acepta una nota entera dentro del rango (0 y el tope incluidos)', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      assert.equal(Number((await enviar(db, B, 1830)).rows[0]?.r.best), 1830);
      await a.como(uid(2));
      assert.equal(Number((await enviar(db, B, PUNTUACION_MAXIMA)).rows[0]?.r.best), PUNTUACION_MAXIMA);
      await a.como(uid(3));
      assert.equal(Number((await enviar(db, B, 0)).rows[0]?.r.best), 0);
    });
  });

  it('rechaza tope + 1, negativos y decimales', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, B, PUNTUACION_MAXIMA + 1), 'INVALID_SCORE');
      await a.falla(() => enviar(db, B, -1), 'INVALID_SCORE');
      await a.falla(() => enviar(db, B, 100.5), 'INVALID_SCORE');
      await a.falla(() => enviar(db, B, '1830.01'), 'INVALID_SCORE');
    });
  });

  it('un record peor NO sustituye al mejor (mas es mejor)', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await enviar(db, B, 2000);
      await esperar4s(db, a, uid(1), B);
      let r = (await enviar(db, B, 1500)).rows[0]?.r;
      assert.equal(r?.is_record, false);
      assert.equal(Number(r?.best), 2000);
      await esperar4s(db, a, uid(1), B);
      r = (await enviar(db, B, 2001)).rows[0]?.r;
      assert.equal(r?.is_record, true);
      assert.equal(Number(r?.best), 2001);
    });
  });

  it('el check de la tabla cierra el rango aunque se escriba a mano', async () => {
    await conBase(async (db, a) => {
      await a.falla(() => notas(db, a, B, [[1, PUNTUACION_MAXIMA + 1]]), /minigame_scores_best_score_check/);
      await a.falla(() => notas(db, a, B, [[1, 10.5]]), /minigame_scores_best_score_check/);
    });
  });
});

describe('0073: ranking, podio y estadisticas', () => {
  it('el ranking sale de mayor a menor', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, B, [[1, 900], [2, 3100], [3, 1500]]);
      await a.como(uid(1));
      const r = (await db.query<{ user_id: string }>('select * from public.minigame_ranking($1, $2)', [RUTA, B])).rows;
      assert.deepEqual(r.map((x) => x.user_id), [uid(2), uid(3), uid(1)]);
    });
  });

  it('casas_podios premia a los 3 mejores', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() =>
        db.exec(`insert into public.user_houses (user_id, house) values
          ('${uid(1)}', 'mahou'), ('${uid(2)}', 'cruzcampo'), ('${uid(3)}', 'estrella'), ('${uid(4)}', 'alhambra')
          on conflict (user_id) do update set house = excluded.house;`),
      );
      await notas(db, a, B, [[1, 100], [2, 3000], [3, 2000], [4, 2500]]);
      const p = (
        await a.comoPostgres(() =>
          db.query<{ puesto: number; user_id: string }>(`select * from public.casas_podios($1) where juego = $2 order by puesto`, [RUTA, B]),
        )
      ).rows.map((x) => [x.puesto, x.user_id]);
      assert.deepEqual(p, [[1, uid(2)], [2, uid(4)], [3, uid(3)]]);
    });
  });

  it('el "mejor" de las estadisticas de admins es el mayor', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, B, [[1, 100], [2, 3000]]);
      await a.como(ADMIN);
      const r = await db.query<{ j: { juegos: { juego: string; mejor: number }[] } }>('select public.admin_estadisticas_actividad($1) as j', [RUTA]);
      assert.equal(Number(r.rows[0]?.j.juegos.find((x) => x.juego === B)?.mejor), 3000);
    });
  });
});

describe('0073: los juegos de antes siguen igual', () => {
  const TOPES: [string, number, boolean][] = [
    // juego, tope, menos es mejor
    ['cana-perfecta', 100, false],
    ['conga-cervecera', 15000, false],
    ['tapon-al-vuelo', 1250, false],
    [ID_PAREJAS, 600, true],
    // El Quijote (0071): la 0073 parte de su funcion y de sus checks; si los pisara, esto fallaria.
    ['quijote-cervecero', 10000000, false],
  ];

  it('cada uno con su tope de siempre', async () => {
    await conBase(async (db, a) => {
      for (const [juego, tope] of TOPES) {
        await a.como(uid(1));
        assert.equal(Number((await enviar(db, juego, tope)).rows[0]?.r.best), tope, juego);
        await a.como(uid(2));
        await a.falla(() => enviar(db, juego, tope + 1), 'INVALID_SCORE');
      }
      // El quiz, con su tiempo.
      await a.como(uid(1));
      assert.equal(Number((await enviar(db, 'quien-quiere-ser-cervecero', 5, 30000)).rows[0]?.r.best), 5);
      // Parejas sigue con su minimo de 4,00 s.
      await a.como(uid(3));
      await a.falla(() => enviar(db, ID_PAREJAS, 3.99), 'INVALID_SCORE');
    });
  });

  it('y con su sentido: parejas guarda el menor y el ranking va de menor a mayor; los demas, al reves', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await enviar(db, ID_PAREJAS, 30);
      await esperar4s(db, a, uid(1), ID_PAREJAS);
      assert.equal((await enviar(db, ID_PAREJAS, 20)).rows[0]?.r.is_record, true);
      await notas(db, a, 'tapon-al-vuelo', [[1, 100], [2, 900]]);
      await notas(db, a, ID_PAREJAS, [[2, 50], [3, 10]]);
      await a.como(uid(1));
      const tapon = (await db.query<{ user_id: string }>('select * from public.minigame_ranking($1, $2)', [RUTA, 'tapon-al-vuelo'])).rows;
      assert.deepEqual(tapon.map((x) => x.user_id), [uid(2), uid(1)]);
      const parejas = (await db.query<{ user_id: string }>('select * from public.minigame_ranking($1, $2)', [RUTA, ID_PAREJAS])).rows;
      assert.deepEqual(parejas.map((x) => x.user_id), [uid(3), uid(1), uid(2)]);
    });
  });

  it('el Quijote sigue guardando con su techo y sus notas altas (numeric(12, 2) intacto)', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      const r = await enviar(db, 'quijote-cervecero', 9_999_999);
      assert.equal(Number(r.rows[0]?.r.best), 9_999_999);
      await a.falla(() => enviar(db, 'quijote-cervecero', 10_000_001), 'INVALID_SCORE');
      await a.falla(() => enviar(db, 'quijote-cervecero', 123.5), 'INVALID_SCORE');
      // Y entra en el ranking, de mayor a menor, junto a Barman.
      await notas(db, a, 'quijote-cervecero', [[2, 500], [3, 8000]]);
      await a.como(uid(1));
      const rk = (await db.query<{ user_id: string }>('select * from public.minigame_ranking($1, $2)', [RUTA, 'quijote-cervecero'])).rows;
      assert.equal(rk[0]?.user_id, uid(1));
      const col = await a.comoPostgres(() =>
        db.query<{ p: number }>(`select numeric_precision as p from information_schema.columns where table_name = 'minigame_scores' and column_name = 'best_score'`),
      );
      assert.equal(col.rows[0]?.p, 12);
    });
  });

  it('un juego que no existe sigue dando INVALID_GAME', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, 'barman-expres', 10), 'INVALID_GAME');
    });
  });
});

describe('0073: se puede volver a pegar', () => {
  it('pegarla dos veces no toca las notas', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, B, [[1, 1234]]);
      await a.comoPostgres(() => db.exec(M73));
      const n = await a.comoPostgres(() => db.query<{ best_score: string }>(`select best_score from public.minigame_scores where game = '${B}'`));
      assert.equal(Number(n.rows[0]?.best_score), 1234);
    });
  });
});
