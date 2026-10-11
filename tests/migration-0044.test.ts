import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0044: los puntos de las casas y el ranking de la ruta.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. sellar da puntos a tu casa, una sola vez por sello; completar la ruta, una vez;
 *  2. los podios se calculan en vivo: un record nuevo reordena y no duplica nada;
 *     solo el top 3; en ¿Conduces tu? cuenta el nivel mas alto;
 *  3. el ranking lo ve quien esta en la ruta (y los admins); nada mas es legible;
 *  4. cambiar una regla afecta a lo nuevo, no a lo ya ganado;
 *  5. un sello borrado deja de puntuar; una cuenta borrada deja sus puntos a la casa;
 *  6. el marcador de tiempo real se toca; los sellos de antes se puntuan al migrar;
 *  7. descargar mis datos trae la casa y los puntos.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0044_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const ANTES = nombres.filter((n) => n < '0044').map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0044 = leerFichero('supabase/migrations/0044_puntos_casas.sql');

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const FUERA = '00000000-0000-4000-8000-0000000000fe';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Persona n -> su casa, fija para el test (se pone antes de entrar en la ruta). */
const CASA: Record<number, string> = { 1: 'mahou', 2: 'cruzcampo', 3: 'estrella', 4: 'alhambra', 5: 'mahou' };

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'), ('${FUERA}', 'fuera@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR(1)}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(2)}', '${RUTA}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(3)}', '${RUTA}', 2, 'Tres', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3, 4, 5]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
              insert into public.user_houses (user_id, house) values ('${uid(n)}', '${CASA[n]}');
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
    )
    .join('\n')}
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>, previas = migraciones) {
  const db = await crearBase(previas);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const sellar = (db: PGlite, n: number, bar: number) =>
  db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m) values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5)`);

/** Los puntos de cada casa, vistos como alguien de la ruta. */
async function ranking(db: PGlite, a: Actor): Promise<Record<string, number>> {
  await a.como(uid(1));
  const { rows } = await db.query<{ house: string; puntos: number }>('select house, puntos from public.casas_ranking($1)', [RUTA]);
  return Object.fromEntries(rows.map((r) => [r.house, r.puntos]));
}

const nota = (db: PGlite, n: number, juego: string, puntos: number, minutos = 0) =>
  db.exec(`insert into public.minigame_scores (route_id, user_id, game, best_score, best_at)
           values ('${RUTA}', '${uid(n)}', '${juego}', ${puntos}, now() - interval '${minutos} minutes')
           on conflict (route_id, user_id, game) do update set best_score = excluded.best_score, best_at = excluded.best_at`);

describe('0044: puntos por sellar', () => {
  it('cada sello da 10 a la casa de quien sella, una sola vez', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await sellar(db, 1, 1);
        await sellar(db, 2, 1);
        // Volver a pasar el sello por la funcion (un reintento) no duplica.
        await db.exec(`select public.puntos_por_sello(id) from public.stamps`);
      });
      assert.deepEqual(await ranking(db, a), { mahou: 10, cruzcampo: 10, estrella: 0, alhambra: 0 });
    });
  });

  it('completar la ruta da 20 una vez, aunque luego se anada un bar y se vuelva a completar', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        for (const b of [1, 2, 3]) await sellar(db, 3, b);
        await db.exec(`insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at)
                       values ('${BAR(4)}', '${RUTA}', 3, 'Cuatro', 40.48, -3.36, now(), now() + interval '2 hours')`);
        await sellar(db, 3, 4);
      });
      assert.equal((await ranking(db, a)).estrella, 4 * 10 + 20);
    });
  });
});

describe('0044: podios de los minijuegos', () => {
  it('solo el top 3 puntua, 10/7/5, y un record nuevo reordena sin duplicar', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await nota(db, 1, 'cana-perfecta', 80);
        await nota(db, 2, 'cana-perfecta', 90);
        await nota(db, 3, 'cana-perfecta', 70);
        await nota(db, 4, 'cana-perfecta', 60);
      });
      assert.deepEqual(await ranking(db, a), { mahou: 7, cruzcampo: 10, estrella: 5, alhambra: 0 });
      await a.comoPostgres(() => nota(db, 4, 'cana-perfecta', 95));
      assert.deepEqual(await ranking(db, a), { mahou: 5, cruzcampo: 7, estrella: 0, alhambra: 10 });
    });
  });

  it('en empate gana quien llego antes', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await nota(db, 1, 'conga-cervecera', 300, 5);
        await nota(db, 2, 'conga-cervecera', 300, 10);
      });
      const r = await ranking(db, a);
      assert.equal(r.cruzcampo, 10);
      assert.equal(r.mahou, 7);
    });
  });

  it('cada juego tiene su podio, y dos de la misma casa suman los dos', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await nota(db, 1, 'cana-perfecta', 99);
        await nota(db, 5, 'cana-perfecta', 98);
        await nota(db, 1, 'conga-cervecera', 500);
      });
      assert.equal((await ranking(db, a)).mahou, 10 + 7 + 10);
    });
  });

  it('en ¿Conduces tu? solo cuenta el nivel mas alto con partidas', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(`insert into public.conduces_scores (route_id, user_id, level, best_distance) values
          ('${RUTA}', '${uid(1)}', 1, 5000), ('${RUTA}', '${uid(2)}', 3, 40), ('${RUTA}', '${uid(3)}', 3, 90)`);
      });
      assert.deepEqual(await ranking(db, a), { mahou: 0, cruzcampo: 7, estrella: 10, alhambra: 0 });
    });
  });

  it('en Maestro Cervecero cuenta la mejor cerveza de cada persona', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        const cerveza = (n: number, score: number) =>
          db.exec(`insert into public.maestro_beers (route_id, user_id, name, malta, levadura, maceracion, amargor, aroma, estilo, abv, ibu, cuerpo, score)
                   values ('${RUTA}', '${uid(n)}', 'Birra', 'palida', 'ale', 50, 50, 50, 'Pale Ale', 5.0, 30, 'medio', ${score})`);
        await cerveza(1, 90);
        await cerveza(1, 85);
        await cerveza(1, 80);
        await cerveza(2, 70);
      });
      // Persona 1 es primera (una sola vez, no tres), persona 2 segunda.
      assert.deepEqual(await ranking(db, a), { mahou: 10, cruzcampo: 7, estrella: 0, alhambra: 0 });
    });
  });

  it('quien ya no esta en la ruta no ocupa podio', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await nota(db, 1, 'cana-perfecta', 99);
        await nota(db, 2, 'cana-perfecta', 50);
        await db.exec(`delete from public.route_members where user_id = '${uid(1)}'`);
      });
      await a.como(uid(2));
      const { rows } = await db.query<{ house: string; puntos: number }>('select house, puntos from public.casas_ranking($1)', [RUTA]);
      assert.equal(rows.find((r) => r.house === 'cruzcampo')?.puntos, 10);
    });
  });
});

describe('0044: quien ve que', () => {
  it('el ranking lo ve quien esta en la ruta y los admins; nadie mas', async () => {
    await conBase(async (db, a) => {
      await a.como(FUERA);
      await a.falla(() => db.query('select * from public.casas_ranking($1)', [RUTA]), /FORBIDDEN/);
      await a.como(ADMIN);
      assert.equal((await db.query('select * from public.casas_ranking($1)', [RUTA])).rows.length, 4);
    });
  });

  it('el historial y las reglas no se leen ni se tocan por la API', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => db.query('select * from public.point_movements'), /permission denied/);
      await a.falla(() => db.query('select * from public.point_rules'), /permission denied/);
      await a.falla(() => db.query(`select public.puntos_otorgar($1, $2, 'mahou', 'sello', 'trampa')`, [RUTA, uid(1)]), /permission denied/);
    });
  });

  it('el marcador lo ve quien esta en la ruta, y se toca al ganar puntos', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => sellar(db, 1, 1));
      await a.como(uid(2));
      assert.equal((await db.query('select * from public.casas_marcador')).rows.length, 1);
      await a.como(FUERA);
      assert.equal((await db.query('select * from public.casas_marcador')).rows.length, 0);
    });
  });
});

describe('0044: reglas, borrados y migracion', () => {
  it('cambiar una regla vale para lo nuevo; lo ya ganado se queda como estaba', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await sellar(db, 1, 1);
        await db.exec(`update public.point_rules set points = 15 where action = 'sello'`);
        await sellar(db, 1, 2);
      });
      assert.equal((await ranking(db, a)).mahou, 25);
    });
  });

  it('si se quita un bar, sus sellos dejan de puntuar (anulados, no borrados)', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await sellar(db, 1, 1);
        await sellar(db, 1, 2);
        await db.exec(`delete from public.route_bars where id = '${BAR(2)}'`);
        const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.point_movements where annulled_at is not null');
        assert.equal(rows[0]?.n, 1);
      });
      assert.equal((await ranking(db, a)).mahou, 10);
    });
  });

  it('si alguien borra su cuenta, sus puntos se quedan en su casa, sin nombre', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await sellar(db, 5, 1);
        await db.exec(`delete from auth.users where id = '${uid(5)}'`);
        const { rows } = await db.query<{ user_id: string | null }>(`select user_id from public.point_movements`);
        assert.deepEqual(rows, [{ user_id: null }]);
      });
      assert.equal((await ranking(db, a)).mahou, 10);
    });
  });

  it('al migrar se puntuan los sellos que ya habia, y pegarla otra vez no duplica', async () => {
    const db = await crearBase(ANTES);
    try {
      await db.exec(DATOS);
      await sellar(db, 1, 1);
      await sellar(db, 2, 1);
      await db.exec(LA_0044);
      await db.exec(LA_0044);
      const { rows } = await db.query<{ n: number; total: number }>(
        'select count(*)::int as n, sum(points)::int as total from public.point_movements',
      );
      assert.deepEqual(rows[0], { n: 2, total: 20 });
    } finally {
      await db.close();
    }
  });

  it('descargar mis datos trae tu casa y tus puntos', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => sellar(db, 1, 1));
      await a.como(uid(1));
      const { rows } = await db.query<{ d: { casa: { casa: string }; puntos: { accion: string; puntos: number }[]; cana: unknown } }>(
        'select public.export_my_data() as d',
      );
      assert.equal(rows[0]?.d.casa.casa, 'mahou');
      assert.deepEqual(rows[0]?.d.puntos.map((p) => [p.accion, p.puntos]), [['sello', 10]]);
      assert.ok(rows[0]?.d.cana !== undefined, 'lo de antes sigue');
    });
  });
});
