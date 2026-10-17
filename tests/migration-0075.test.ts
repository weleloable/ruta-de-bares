import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { ID_BARMAN, PUNTUACION_MAXIMA as MAX_BARMAN } from '../src/features/minijuegos/juegos/barman/modelo.ts';
import { ID_PAREJAS } from '../src/features/minijuegos/juegos/parejas/modelo.ts';
import { ID_PULSO, PUNTUACION_MAXIMA } from '../src/features/minijuegos/juegos/pulso/modelo.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0075: Pulso de Camarero en el ranking por ruta y en el podio de las casas.
 * Un porcentaje de 0 a 100,00 con DOS decimales y MAS es mejor. El tope SQL se
 * lee del modelo (PUNTUACION_MAXIMA), no se copia a mano. Y todos los juegos de
 * antes siguen con sus topes, sus decimales y su sentido.
 */

const migraciones = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql') && f <= '0075_zzz')
  .sort()
  .map((n) => leerFichero(`supabase/migrations/${n}`));
const M75 = leerFichero('supabase/migrations/0075_pulso_de_camarero.sql');

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const P = ID_PULSO;
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

type Respuesta = { best: string | number; is_record: boolean };
const enviar = (db: PGlite, juego: string, nota: number | string, ms: number | null = null) =>
  db.query<{ r: Respuesta }>('select public.minigame_submit_nota($1, $2, $3, $4) as r', [RUTA, juego, nota, ms]);
const esperar4s = (db: PGlite, a: Actor, quien: string, juego: string) =>
  a.comoPostgres(() =>
    db.query(`update public.minigame_scores set last_submit_at = now() - interval '10 seconds' where user_id = $1 and game = $2`, [quien, juego]),
  );
const notas = (db: PGlite, a: Actor, juego: string, filas: [number, number | string][]) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.minigame_scores (route_id, user_id, game, best_score, best_at) values ${filas
      .map(([n, nota], i) => `('${RUTA}', '${uid(n)}', '${juego}', ${nota}, now() + interval '${i} minutes')`)
      .join(', ')};`),
  );

describe('0075: el tope es el del modelo', () => {
  it('el case y el check llevan PUNTUACION_MAXIMA, leida del modelo, y el check NO exige entero', () => {
    assert.equal(PUNTUACION_MAXIMA, 100);
    assert.match(M75, new RegExp(`when '${P}' then ${PUNTUACION_MAXIMA}\\b`));
    assert.match(M75, new RegExp(`game = '${P}' and best_score between 0 and ${PUNTUACION_MAXIMA}\\)`));
    assert.doesNotMatch(M75, new RegExp(`game = '${P}'[^\\n]*trunc`), 'el check de Pulso exige entero: perderia los decimales');
  });

  it('no entra en minijuego_menos_es_mejor (mas es mejor)', async () => {
    await conBase(async (db) => {
      assert.equal((await db.query<{ v: boolean }>(`select public.minijuego_menos_es_mejor('${P}') as v`)).rows[0]?.v, false);
    });
  });
});

describe('0075: guardar Pulso de Camarero', () => {
  it('acepta una nota de dos decimales en rango y la guarda tal cual', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      assert.equal(Number((await enviar(db, P, 68.43)).rows[0]?.r.best), 68.43);
      await a.como(uid(2));
      assert.equal(Number((await enviar(db, P, 99.99)).rows[0]?.r.best), 99.99);
      await a.como(uid(3));
      assert.equal(Number((await enviar(db, P, PUNTUACION_MAXIMA)).rows[0]?.r.best), PUNTUACION_MAXIMA);
      await a.como(uid(4));
      assert.equal(Number((await enviar(db, P, 0)).rows[0]?.r.best), 0);
      const guardado = await a.comoPostgres(() =>
        db.query<{ best_score: string }>(`select best_score::text from public.minigame_scores where user_id = $1 and game = $2`, [uid(1), P]),
      );
      assert.equal(guardado.rows[0]?.best_score, '68.43', 'se guardo con otra forma');
    });
  });

  it('redondea a dos decimales (68,4567 -> 68,46; 99,994 -> 99,99), como la caña', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      assert.equal(Number((await enviar(db, P, 68.4567)).rows[0]?.r.best), 68.46);
      await a.como(uid(2));
      assert.equal(Number((await enviar(db, P, '99.994')).rows[0]?.r.best), 99.99);
      await a.como(uid(3));
      assert.equal(Number((await enviar(db, P, 12.345)).rows[0]?.r.best), 12.35);
    });
  });

  it('rechaza tope + 0,01 y negativos', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, P, PUNTUACION_MAXIMA + 0.01), 'INVALID_SCORE');
      await a.falla(() => enviar(db, P, 100.5), 'INVALID_SCORE');
      await a.falla(() => enviar(db, P, -0.01), 'INVALID_SCORE');
      await a.falla(() => enviar(db, P, -1), 'INVALID_SCORE');
    });
  });

  it('un record peor NO sustituye al mejor, y 68,43 gana a 68,42', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await enviar(db, P, 68.42);
      await esperar4s(db, a, uid(1), P);
      let r = (await enviar(db, P, 40.1)).rows[0]?.r;
      assert.equal(r?.is_record, false);
      assert.equal(Number(r?.best), 68.42);
      await esperar4s(db, a, uid(1), P);
      r = (await enviar(db, P, 68.43)).rows[0]?.r;
      assert.equal(r?.is_record, true);
      assert.equal(Number(r?.best), 68.43);
      await esperar4s(db, a, uid(1), P);
      r = (await enviar(db, P, 68.43)).rows[0]?.r;
      assert.equal(r?.is_record, false, 'empatar no es mejorar');
    });
  });

  it('espaciado de 4 s entre envios, como siempre', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await enviar(db, P, 10);
      await a.falla(() => enviar(db, P, 20), 'TOO_FAST');
    });
  });

  it('el check de la tabla cierra el rango aunque se escriba a mano, y deja los decimales', async () => {
    await conBase(async (db, a) => {
      await a.falla(() => notas(db, a, P, [[1, PUNTUACION_MAXIMA + 0.01]]), /minigame_scores_best_score_check/);
      await notas(db, a, P, [[2, 57.89]]);
      const r = await a.comoPostgres(() => db.query<{ s: string }>(`select best_score::text as s from public.minigame_scores where game = '${P}'`));
      assert.equal(r.rows[0]?.s, '57.89');
    });
  });
});

describe('0075: ranking, podio y estadisticas', () => {
  it('el ranking sale de mayor a menor y la nota sale con sus decimales', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, P, [[1, 90.12], [2, 90.13], [3, 31.5]]);
      await a.como(uid(1));
      const r = (await db.query<{ user_id: string; score: string }>('select * from public.minigame_ranking($1, $2)', [RUTA, P])).rows;
      assert.deepEqual(r.map((x) => x.user_id), [uid(2), uid(1), uid(3)]);
      assert.deepEqual(r.map((x) => Number(x.score)), [90.13, 90.12, 31.5]);
    });
  });

  it('casas_podios premia a los 3 mejores', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() =>
        db.exec(`insert into public.user_houses (user_id, house) values
          ('${uid(1)}', 'mahou'), ('${uid(2)}', 'cruzcampo'), ('${uid(3)}', 'estrella'), ('${uid(4)}', 'alhambra')
          on conflict (user_id) do update set house = excluded.house;`),
      );
      await notas(db, a, P, [[1, 10.5], [2, 88.88], [3, 70.01], [4, 70.02]]);
      const p = (
        await a.comoPostgres(() =>
          db.query<{ puesto: number; user_id: string }>(`select * from public.casas_podios($1) where juego = $2 order by puesto`, [RUTA, P]),
        )
      ).rows.map((x) => [x.puesto, x.user_id]);
      assert.deepEqual(p, [[1, uid(2)], [2, uid(4)], [3, uid(3)]]);
    });
  });

  it('el "mejor" de las estadisticas de admins es el mayor y conserva los decimales', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, P, [[1, 10.5], [2, 88.88]]);
      await a.como(ADMIN);
      const r = await db.query<{ j: { juegos: { juego: string; mejor: number }[] } }>('select public.admin_estadisticas_actividad($1) as j', [RUTA]);
      assert.equal(Number(r.rows[0]?.j.juegos.find((x) => x.juego === P)?.mejor), 88.88);
    });
  });
});

describe('0075: los juegos de antes siguen igual', () => {
  const TOPES: [string, number][] = [
    ['cana-perfecta', 100],
    ['conga-cervecera', 15000],
    ['tapon-al-vuelo', 1250],
    [ID_PAREJAS, 600],
    [ID_BARMAN, MAX_BARMAN],
    ['quijote-cervecero', 10000000],
  ];

  it('cada uno con su tope de siempre (Barman incluido, que la 0075 hereda de la 0073)', async () => {
    await conBase(async (db, a) => {
      for (const [juego, tope] of TOPES) {
        await a.como(uid(1));
        assert.equal(Number((await enviar(db, juego, tope)).rows[0]?.r.best), tope, juego);
        await a.como(uid(2));
        await a.falla(() => enviar(db, juego, tope + 1), 'INVALID_SCORE');
      }
      await a.como(uid(1));
      assert.equal(Number((await enviar(db, 'quien-quiere-ser-cervecero', 5, 30000)).rows[0]?.r.best), 5);
      await a.como(uid(3));
      await a.falla(() => enviar(db, ID_PAREJAS, 3.99), 'INVALID_SCORE');
    });
  });

  it('y con sus decimales de siempre: conga, tapon y barman siguen exigiendo entero; la caña redondea; parejas exige dos', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      for (const juego of ['conga-cervecera', 'tapon-al-vuelo', ID_BARMAN, 'quijote-cervecero']) {
        await a.falla(() => enviar(db, juego, 100.5), 'INVALID_SCORE');
      }
      assert.equal(Number((await enviar(db, 'cana-perfecta', 94.6666)).rows[0]?.r.best), 94.67);
      await a.falla(() => enviar(db, ID_PAREJAS, 23.4666), 'INVALID_SCORE');
      assert.equal(Number((await enviar(db, ID_PAREJAS, 23.47)).rows[0]?.r.best), 23.47);
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

  it('el Quijote sigue con su techo y su numeric(12, 2)', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      assert.equal(Number((await enviar(db, 'quijote-cervecero', 9_999_999)).rows[0]?.r.best), 9_999_999);
      const col = await a.comoPostgres(() =>
        db.query<{ p: number }>(`select numeric_precision as p from information_schema.columns where table_name = 'minigame_scores' and column_name = 'best_score'`),
      );
      assert.equal(col.rows[0]?.p, 12);
    });
  });

  it('un juego que no existe sigue dando INVALID_GAME', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, 'pulso-camarero', 10), 'INVALID_GAME');
    });
  });
});

describe('0075: se puede volver a pegar', () => {
  it('pegarla dos veces no toca las notas', async () => {
    await conBase(async (db, a) => {
      await notas(db, a, P, [[1, 71.23]]);
      await a.comoPostgres(() => db.exec(M75));
      const n = await a.comoPostgres(() => db.query<{ best_score: string }>(`select best_score from public.minigame_scores where game = '${P}'`));
      assert.equal(Number(n.rows[0]?.best_score), 71.23);
    });
  });
});
