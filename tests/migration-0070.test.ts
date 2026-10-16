import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { JUEGOS_MENOS_ES_MEJOR } from '../src/features/minijuegos/nota.ts';
import { ID_PAREJAS, TIEMPO_MAXIMO, TIEMPO_MINIMO } from '../src/features/minijuegos/juegos/parejas/modelo.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0070: Parejas de Barra, el primer juego en el que MENOS es mejor.
 *
 * Cada sitio que compara notas se prueba con este juego Y con uno de "mas es
 * mejor", para demostrar que los antiguos no cambian: guardar, ranking, podio de
 * las casas y el "mejor" de las estadisticas de admins.
 *
 * TIEMPO_MINIMO y TIEMPO_MAXIMO se leen del modelo, no se copian: si alguien
 * cambia el modelo y no la migracion (o al reves), esto falla.
 */

const todas = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
const migraciones = todas.filter((f) => f <= '0070_zzz').map((n) => leerFichero(`supabase/migrations/${n}`));
const M70 = leerFichero('supabase/migrations/0070_parejas_de_barra.sql');

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const P = ID_PAREJAS;
const TAPON = 'tapon-al-vuelo';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin', display_name = 'Admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta', true, '${ADMIN}', current_date);
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

const enviar = (db: PGlite, juego: string, nota: number | string) =>
  db.query<{ r: { best: number; is_record: boolean } }>('select public.minigame_submit_nota($1, $2, $3) as r', [RUTA, juego, nota]);
const esperar4s = (db: PGlite, a: Actor, quien: string, juego: string) =>
  a.comoPostgres(() =>
    db.query(`update public.minigame_scores set last_submit_at = now() - interval '10 seconds' where user_id = $1 and game = $2`, [quien, juego]),
  );
/** Mete notas a mano (como postgres), con la hora para desempatar. */
const notas = (db: PGlite, a: Actor, juego: string, filas: [number, number][]) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.minigame_scores (route_id, user_id, game, best_score, best_at) values ${filas
      .map(([n, nota], i) => `('${RUTA}', '${uid(n)}', '${juego}', ${nota}, now() + interval '${i} minutes')`)
      .join(', ')};`),
  );

describe('0070: un solo sitio dice que juegos son "menos es mejor"', () => {
  it('la lista de SQL es la misma que la de la app (nota.ts)', () => {
    const m = M70.match(/select p_game in \(([^)]*)\);/);
    assert.ok(m, 'no encuentro la lista en minijuego_menos_es_mejor');
    const sql = [...(m[1] as string).matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    assert.deepEqual(sql, [...JUEGOS_MENOS_ES_MEJOR].sort());
  });

  it('el rango de la migracion es el del modelo', () => {
    assert.match(M70, new RegExp(`when 'parejas-de-barra' then ${TIEMPO_MAXIMO}\\b`));
    assert.match(M70, new RegExp(`when 'parejas-de-barra' then ${TIEMPO_MINIMO.toFixed(2).replace('.', '\\.')} else 0`));
    assert.match(M70, new RegExp(`best_score between ${TIEMPO_MINIMO.toFixed(2).replace('.', '\\.')} and ${TIEMPO_MAXIMO}\\)`));
  });

  it('minijuego_menos_es_mejor contesta lo esperado', async () => {
    await conBase(async (db) => {
      const r = await db.query<{ p: boolean; t: boolean }>(
        `select public.minijuego_menos_es_mejor('${P}') as p, public.minijuego_menos_es_mejor('${TAPON}') as t`,
      );
      assert.deepEqual(r.rows[0], { p: true, t: false });
    });
  });
});

describe('0070: guardar un tiempo', () => {
  it('acepta el juego nuevo, en el rango y con dos decimales', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      const r = await enviar(db, P, 23.47);
      assert.equal(Number(r.rows[0].r.best), 23.47);
      assert.equal(r.rows[0].r.is_record, true);
      await esperar4s(db, a, uid(1), P);
      assert.equal(Number((await enviar(db, P, TIEMPO_MINIMO)).rows[0].r.best), TIEMPO_MINIMO, 'el minimo exacto vale');
    });
  });

  it('rechaza por debajo de TIEMPO_MINIMO, por encima de TIEMPO_MAXIMO y con 3 decimales', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, P, TIEMPO_MINIMO - 0.01), 'INVALID_SCORE');
      await a.falla(() => enviar(db, P, 0.01), 'INVALID_SCORE');
      await a.falla(() => enviar(db, P, 0), 'INVALID_SCORE');
      await a.falla(() => enviar(db, P, TIEMPO_MAXIMO + 0.01), 'INVALID_SCORE');
      await a.falla(() => enviar(db, P, '23.471'), 'INVALID_SCORE');
      // Y se puede guardar justo en el tope.
      assert.equal(Number((await enviar(db, P, TIEMPO_MAXIMO)).rows[0].r.best), TIEMPO_MAXIMO);
    });
  });

  it('un tiempo PEOR no sustituye al mejor; uno mejor, si; empatar no es record', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await enviar(db, P, 30);
      await esperar4s(db, a, uid(1), P);
      let r = (await enviar(db, P, 45.5)).rows[0].r;
      assert.equal(r.is_record, false);
      assert.equal(Number(r.best), 30, 'tardar mas no pisa el record');
      await esperar4s(db, a, uid(1), P);
      r = (await enviar(db, P, 30)).rows[0].r;
      assert.equal(r.is_record, false);
      await esperar4s(db, a, uid(1), P);
      r = (await enviar(db, P, 21.09)).rows[0].r;
      assert.equal(r.is_record, true);
      assert.equal(Number(r.best), 21.09);
    });
  });

  it('los de "mas es mejor" siguen guardando el MAYOR', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await enviar(db, TAPON, 500);
      await esperar4s(db, a, uid(1), TAPON);
      assert.equal((await enviar(db, TAPON, 400)).rows[0].r.is_record, false);
      await esperar4s(db, a, uid(1), TAPON);
      const r = (await enviar(db, TAPON, 900)).rows[0].r;
      assert.equal(r.is_record, true);
      assert.equal(Number(r.best), 900);
      await esperar4s(db, a, uid(1), TAPON);
      // Tapon sigue sin decimales y sin minimo nuevo.
      await a.falla(() => enviar(db, TAPON, 10.5), 'INVALID_SCORE');
      assert.equal(Number((await enviar(db, 'cana-perfecta', 0)).rows[0].r.best), 0);
    });
  });

  it('el check de la tabla tambien cierra el rango (aunque se escriba a mano)', async () => {
    await conBase(async (db, a) => {
      await a.falla(() => notas(db, a, P, [[1, 3.99]]), /minigame_scores_best_score_check/);
      await a.falla(() => notas(db, a, P, [[1, 600.01]]), /minigame_scores_best_score_check/);
      // Y el de game deja entrar al juego nuevo (y a nadie mas).
      await a.falla(() => notas(db, a, 'parejas-de-bar', [[1, 10]]), /minigame_scores_(game|best_score)_check/);
    });
  });
});

describe('0070: el ranking', () => {
  it('Parejas sale de menor a mayor; empate, quien llego antes', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, P, [[1, 40], [2, 12.5], [3, 25], [4, 12.5]]);
      await a.como(uid(1));
      const r = (await db.query<{ pos: string; user_id: string; score: string }>('select * from public.minigame_ranking($1, $2)', [RUTA, P])).rows;
      assert.deepEqual(r.map((x) => [Number(x.pos), x.user_id, Number(x.score)]), [
        [1, uid(2), 12.5],
        [2, uid(4), 12.5],
        [3, uid(3), 25],
        [4, uid(1), 40],
      ]);
    });
  });

  it('los demas siguen de mayor a menor', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, TAPON, [[1, 100], [2, 900], [3, 500]]);
      await a.como(uid(1));
      const r = (await db.query<{ user_id: string }>('select * from public.minigame_ranking($1, $2)', [RUTA, TAPON])).rows;
      assert.deepEqual(r.map((x) => x.user_id), [uid(2), uid(3), uid(1)]);
    });
  });
});

describe('0070: el podio de las casas', () => {
  it('premia a los mas RAPIDOS en Parejas y a los mas altos en el resto', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() =>
        db.exec(`insert into public.user_houses (user_id, house) values
          ('${uid(1)}', 'mahou'), ('${uid(2)}', 'cruzcampo'), ('${uid(3)}', 'estrella'), ('${uid(4)}', 'alhambra')
          on conflict (user_id) do update set house = excluded.house;`),
      );
      await notas(db, a, P, [[1, 50], [2, 9.99], [3, 20], [4, 100]]);
      await notas(db, a, TAPON, [[1, 50], [2, 9], [3, 20], [4, 100]]);
      const podio = async (juego: string) =>
        (
          await a.comoPostgres(() =>
            db.query<{ puesto: number; user_id: string }>(`select * from public.casas_podios($1) where juego = $2 order by puesto`, [RUTA, juego]),
          )
        ).rows.map((x) => [x.puesto, x.user_id]);
      assert.deepEqual(await podio(P), [[1, uid(2)], [2, uid(3)], [3, uid(1)]], 'el que mas tarda (100 s) se queda fuera');
      assert.deepEqual(await podio(TAPON), [[1, uid(4)], [2, uid(1)], [3, uid(3)]], 'tapon: los mas altos, como siempre');
    });
  });
});

describe('0070: estadisticas de admins', () => {
  it('el "mejor" de Parejas es el menor; el de los demas, el mayor', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, P, [[1, 50], [2, 9.99], [3, 20]]);
      await notas(db, a, TAPON, [[1, 50], [2, 9], [3, 200]]);
      await a.como(ADMIN);
      const r = await db.query<{ j: { juegos: { juego: string; mejor: number; jugadores: number }[] } }>(
        'select public.admin_estadisticas_actividad($1) as j',
        [RUTA],
      );
      const por = Object.fromEntries(r.rows[0].j.juegos.map((x) => [x.juego, x]));
      assert.equal(Number(por[P]?.mejor), 9.99);
      assert.equal(por[P]?.jugadores, 3);
      assert.equal(Number(por[TAPON]?.mejor), 200);
    });
  });
});

describe('0070: se puede volver a pegar', () => {
  it('pegarla dos veces no rompe nada ni toca las notas', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, P, [[1, 12.34]]);
      await a.comoPostgres(() => db.exec(M70));
      const n = await a.comoPostgres(() => db.query<{ best_score: string }>(`select best_score from public.minigame_scores where game = '${P}'`));
      assert.equal(Number(n.rows[0].best_score), 12.34);
    });
  });
});
