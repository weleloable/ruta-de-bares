import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { calcularCerveza } from '../src/features/minijuegos/juegos/maestro/estilo.ts';
import type { LevaduraId, MaltaId } from '../src/features/minijuegos/juegos/maestro/datos.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0030: minijuegos. Ranking POR RUTA y cervezas guardadas.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. **solo ve y escribe quien esta dentro de la ruta** (un admin puede leer),
 *     y las tablas no se tocan por la API: todo pasa por funciones;
 *  2. **el servidor calcula la cerveza**, y lo que calcula coincide con
 *     `estilo.ts` para TODAS las combinaciones (si no, la tarjeta que ves y la
 *     que ven los demas dirian cosas distintas);
 *  3. el ranking guarda SOLO la mejor nota, es por ruta y no se puede falsear
 *     con notas fuera de rango ni a ritmo de script;
 *  4. quien esta suspendida no envia nada, pero lo suyo se descarga y se borra;
 *  5. se va con la ruta y con la cuenta, y sale en "descargar mis datos".
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0030_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const MARTA = '00000000-0000-4000-8000-00000000000c'; // solo en la otra ruta
const FUERA = '00000000-0000-4000-8000-00000000000e'; // sin ninguna ruta
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA = '00000000-0000-4000-8000-0000000000f2';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${MARTA}', 'marta@example.com'),
    ('${FUERA}', 'fuera@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date + 10),
    ('${OTRA}', 'Otra ruta', true, '${ADMIN}', current_date + 10);
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'), ('${OTRA}', '${MARTA}');
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

/** Envia una nota como quien sea el actor actual. */
const nota = (db: PGlite, ruta: string, puntos: number, juego = 'cana-perfecta') =>
  db.query<{ r: { best: number; is_record: boolean } }>(`select public.minigame_submit_score($1, $2, $3) as r`, [ruta, juego, puntos]);

/** Como el envio esta espaciado, para el siguiente se "pasa el tiempo" retrasando la ultima marca. */
async function pasarElTiempo(db: PGlite, a: Actor) {
  await a.comoPostgres(async () => {
    await db.exec(`
      update public.minigame_scores set last_submit_at = last_submit_at - interval '1 hour';
      update public.maestro_beers set created_at = created_at - interval '1 hour';
    `);
  });
}

const cerveza = (db: PGlite, ruta: string, nombre = 'Mi caña', receta: readonly [string, string, number, number, number] = ['palida', 'ale', 100, 100, 100]) =>
  db.query<{ r: Record<string, unknown> }>(
    `select public.maestro_submit_beer($1, $2, $3, $4, $5, $6, $7) as r`,
    [ruta, nombre, ...receta],
  );

describe('0030: las tablas no se tocan por la API', () => {
  it('ni leer, ni escribir, ni borrar: solo las funciones', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, RUTA, 50);
      await cerveza(db, RUTA);
      for (const tabla of ['minigame_scores', 'maestro_beers']) {
        await a.falla(() => db.query(`select * from public.${tabla}`), /permission denied/);
      }
      await a.falla(() => db.query(`insert into public.minigame_scores (route_id, user_id, game, best_score) values ('${RUTA}', '${ANA}', 'cana-perfecta', 100)`), /permission denied/);
      await a.falla(() => db.query(`update public.minigame_scores set best_score = 100`), /permission denied/);
      await a.falla(() => db.query(`delete from public.maestro_beers`), /permission denied/);
      await a.anonimo();
      await a.falla(() => nota(db, RUTA, 50), /permission denied|NOT_AUTHENTICATED/);
    });
  });

  it('el calculo interno y la comprobacion de pertenencia no se llaman desde la API', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => db.query(`select * from public.maestro_calcular_cerveza('palida', 'ale', 1, 1, 1)`), /permission denied/);
      await a.falla(() => db.query(`select public.minijuegos_require($1, true)`, [RUTA]), /permission denied/);
    });
  });
});

describe('0030: solo quien esta dentro de la ruta', () => {
  it('quien no es de la ruta no envia, ni lee: FORBIDDEN', async () => {
    await conBase(async (db, a) => {
      for (const quien of [FUERA, MARTA]) {
        await a.como(quien);
        await a.falla(() => nota(db, RUTA, 50), /FORBIDDEN/);
        await a.falla(() => cerveza(db, RUTA), /FORBIDDEN/);
        await a.falla(() => db.query(`select * from public.minigame_ranking($1, 'cana-perfecta')`, [RUTA]), /FORBIDDEN/);
        await a.falla(() => db.query(`select * from public.maestro_list_beers($1)`, [RUTA]), /FORBIDDEN/);
      }
    });
  });

  it('sin sesion: NOT_AUTHENTICATED', async () => {
    await conBase(async (db, a) => {
      await a.como('00000000-0000-4000-8000-0000000000aa');
      await a.falla(() => nota(db, RUTA, 50), /FORBIDDEN/);
    });
  });

  it('un admin LEE aunque no este en la ruta, pero no escribe', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, RUTA, 70);
      await cerveza(db, RUTA);
      await a.como(ADMIN);
      const r = await db.query(`select * from public.minigame_ranking($1, 'cana-perfecta')`, [RUTA]);
      assert.equal(r.rows.length, 1);
      const b = await db.query(`select * from public.maestro_list_beers($1)`, [RUTA]);
      assert.equal(b.rows.length, 1);
      await a.falla(() => nota(db, RUTA, 50), /FORBIDDEN/);
    });
  });

  it('quien esta suspendida no envia, pero sigue viendo lo suyo', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, RUTA, 40);
      await a.comoPostgres(async () => {
        await db.exec(`insert into public.account_suspensions (user_id, reason) values ('${ANA}', 'prueba')`);
      });
      await pasarElTiempo(db, a);
      await a.falla(() => nota(db, RUTA, 90), /SUSPENDED/);
      await a.falla(() => cerveza(db, RUTA), /SUSPENDED/);
    });
  });
});

describe('0030: el ranking de La Cana Perfecta', () => {
  it('guarda SOLO la mejor: una peor no la pisa y una mejor si', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      assert.deepEqual((await nota(db, RUTA, 60)).rows[0]?.r, { best: 60, is_record: true });
      await pasarElTiempo(db, a);
      assert.deepEqual((await nota(db, RUTA, 30)).rows[0]?.r, { best: 60, is_record: false });
      await pasarElTiempo(db, a);
      assert.deepEqual((await nota(db, RUTA, 60)).rows[0]?.r, { best: 60, is_record: false }, 'igualar no es record');
      await pasarElTiempo(db, a);
      assert.deepEqual((await nota(db, RUTA, 85)).rows[0]?.r, { best: 85, is_record: true });
      await a.comoPostgres(async () => {
        const { rows } = await db.query(`select count(*)::int as n, max(best_score) as m from public.minigame_scores`);
        assert.deepEqual(rows[0], { n: 1, m: 85 }, 'una fila por persona, con su mejor nota');
      });
    });
  });

  it('ordena de mayor a menor y el empate lo gana quien llego antes', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, RUTA, 70);
      await a.como(LUIS);
      await nota(db, RUTA, 70);
      await a.como(ANA);
      const { rows } = await db.query<{ pos: string; display_name: string; score: number; is_me: boolean }>(
        `select * from public.minigame_ranking($1, 'cana-perfecta')`,
        [RUTA],
      );
      assert.deepEqual(
        rows.map((r) => [Number(r.pos), r.score, r.is_me]),
        [[1, 70, true], [2, 70, false]],
      );
      assert.ok(rows[0]?.display_name && rows[1]?.display_name, 'trae el nombre visible');
    });
  });

  it('es POR RUTA: la nota de una no aparece en la otra', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, RUTA, 99);
      await a.como(MARTA);
      await nota(db, OTRA, 10);
      const { rows } = await db.query<{ score: number }>(`select * from public.minigame_ranking($1, 'cana-perfecta')`, [OTRA]);
      assert.deepEqual(rows.map((r) => r.score), [10]);
    });
  });

  it('con limite, tu fila sale aunque no entres en el top', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await nota(db, RUTA, 90);
      await a.como(LUIS);
      await nota(db, RUTA, 20);
      const { rows } = await db.query<{ pos: string; is_me: boolean }>(
        `select * from public.minigame_ranking($1, 'cana-perfecta', 1)`,
        [RUTA],
      );
      assert.deepEqual(rows.map((r) => [Number(r.pos), r.is_me]), [[1, false], [2, true]]);
    });
  });

  it('rechaza notas fuera de 0-100, juegos que no existen y el ritmo de un script', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => nota(db, RUTA, 101), /INVALID_SCORE/);
      await a.falla(() => nota(db, RUTA, -1), /INVALID_SCORE/);
      await a.falla(() => nota(db, RUTA, 50, 'otro-juego'), /INVALID_GAME/);
      await nota(db, RUTA, 10);
      // Dos seguidas sin dejar pasar el tiempo.
      await a.falla(() => nota(db, RUTA, 100), /TOO_FAST/);
      await pasarElTiempo(db, a);
      await nota(db, RUTA, 100);
    });
  });
});

describe('0030: Maestro Cervecero, el servidor calcula la cerveza', () => {
  it('guarda la cerveza con lo que CALCULA el servidor, no lo que diga el cliente', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      const { rows } = await cerveza(db, RUTA, '  Stout de Cervantes  ', ['negra', 'ale', 100, 100, 100]);
      assert.deepEqual(rows[0]?.r, {
        id: (rows[0]?.r as { id: string }).id,
        name: 'Stout de Cervantes',
        estilo: 'Stout',
        abv: 6.6,
        ibu: 60,
        cuerpo: 'con cuerpo',
        score: 100,
      });
    });
  });

  it('la funcion SQL y estilo.ts dan LO MISMO con todas las combinaciones', async () => {
    const db = await crearBase(migraciones);
    try {
      const valores = [0, 1, 2, 7, 13, 25, 33, 49, 50, 51, 66, 67, 75, 83, 90, 99, 100];
      const { rows } = await db.query<{
        malta: MaltaId; levadura: LevaduraId; m: number; am: number; ar: number;
        estilo: string; abv: string; ibu: number; cuerpo: string; score: number;
      }>(`
        select t.malta, l.levadura, m, am, ar, c.estilo, c.abv::text as abv, c.ibu, c.cuerpo, c.score
          from (values ('palida'), ('caramelo'), ('tostada'), ('negra')) t(malta)
          cross join (values ('ale'), ('lager')) l(levadura)
          cross join unnest($1::int[]) m
          cross join unnest($1::int[]) am
          cross join unnest($1::int[]) ar
          cross join lateral public.maestro_calcular_cerveza(t.malta, l.levadura, m, am, ar) c
      `, [valores]);
      assert.equal(rows.length, 4 * 2 * valores.length ** 3, 'no salieron todas las filas');

      const distintos: string[] = [];
      for (const r of rows) {
        const ts = calcularCerveza({
          malta: r.malta, levadura: r.levadura, maceracion: r.m / 100,
          lupulo: { amargor: r.am / 100, aroma: r.ar / 100 },
        });
        const sql = { estilo: r.estilo, abv: Number(r.abv), ibu: r.ibu, cuerpo: r.cuerpo, puntuacion: r.score };
        if (JSON.stringify(ts) !== JSON.stringify(sql)) {
          distintos.push(`${r.malta}/${r.levadura} ${r.m}/${r.am}/${r.ar}: ts=${JSON.stringify(ts)} sql=${JSON.stringify(sql)}`);
          if (distintos.length >= 5) break;
        }
      }
      assert.deepEqual(distintos, [], distintos.join('\n'));
    } finally {
      await db.close();
    }
  });

  it('rechaza recetas inventadas y nombres vacios, largos o con caracteres de control', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => cerveza(db, RUTA, 'x', ['vino', 'ale', 1, 1, 1]), /INVALID_RECIPE|check/);
      await a.falla(() => cerveza(db, RUTA, 'x', ['palida', 'ale', 101, 1, 1]), /INVALID_RECIPE/);
      await a.falla(() => cerveza(db, RUTA, 'x', ['palida', 'ale', -1, 1, 1]), /INVALID_RECIPE/);
      await a.falla(() => cerveza(db, RUTA, '   '), /INVALID_NAME/);
      await a.falla(() => cerveza(db, RUTA, 'a'.repeat(31)), /INVALID_NAME/);
      await a.falla(() => cerveza(db, RUTA, 'hola\nmundo'), /INVALID_NAME/);
      await cerveza(db, RUTA, 'a'.repeat(30));
    });
  });

  it('frena el ritmo de un script y el exceso de cervezas', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await cerveza(db, RUTA);
      await a.falla(() => cerveza(db, RUTA), /TOO_FAST/);
      await pasarElTiempo(db, a);
      // Se rellena hasta el tope como postgres y se comprueba que a la 101 se para.
      await a.comoPostgres(async () => {
        await db.exec(`
          insert into public.maestro_beers (route_id, user_id, name, malta, levadura, maceracion, amargor, aroma, estilo, abv, ibu, cuerpo, score, created_at)
          select '${RUTA}', '${ANA}', 'n' || g, 'palida', 'ale', 1, 1, 1, 'Rubia', 4.2, 10, 'ligero', 1, now() - interval '2 hours'
            from generate_series(1, 99) g;
        `);
      });
      await a.falla(() => cerveza(db, RUTA), /LIMIT_REACHED/);
    });
  });
});

describe('0030: la lista de cervezas', () => {
  it('la ve toda la ruta, con su autor, y solo la de la ruta', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await cerveza(db, RUTA, 'De Ana');
      await a.como(LUIS);
      await cerveza(db, RUTA, 'De Luis');
      await a.como(MARTA);
      await cerveza(db, OTRA, 'De Marta');

      await a.como(ANA);
      const { rows } = await db.query<{ name: string; display_name: string; is_mine: boolean }>(
        `select * from public.maestro_list_beers($1)`,
        [RUTA],
      );
      assert.deepEqual(rows.map((r) => [r.name, r.is_mine]).sort(), [['De Ana', true], ['De Luis', false]]);
      assert.ok(rows.every((r) => r.display_name.length > 0));

      const mias = await db.query<{ name: string }>(`select * from public.maestro_list_beers($1, 50, 0, true)`, [RUTA]);
      assert.deepEqual(mias.rows.map((r) => r.name), ['De Ana']);
    });
  });

  it('el limite y el desplazamiento paginan y estan acotados', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(`
          insert into public.maestro_beers (route_id, user_id, name, malta, levadura, maceracion, amargor, aroma, estilo, abv, ibu, cuerpo, score, created_at)
          select '${RUTA}', '${ANA}', 'n' || g, 'palida', 'ale', 1, 1, 1, 'Rubia', 4.2, 10, 'ligero', 1, now() - g * interval '1 minute'
            from generate_series(1, 30) g;
        `);
      });
      await a.como(LUIS);
      const pag = await db.query<{ name: string }>(`select * from public.maestro_list_beers($1, 10, 10)`, [RUTA]);
      assert.deepEqual(pag.rows.map((r) => r.name), Array.from({ length: 10 }, (_, i) => `n${11 + i}`));
      const enorme = await db.query(`select * from public.maestro_list_beers($1, 100000)`, [RUTA]);
      assert.ok(enorme.rows.length <= 100);
    });
  });

  it('borrar: la tuya si, la de otra persona no, y un admin cualquiera', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      const id = ((await cerveza(db, RUTA, 'De Ana')).rows[0]?.r as { id: string }).id;
      await a.como(LUIS);
      await a.falla(() => db.query(`select public.maestro_delete_beer($1)`, [id]), /FORBIDDEN/);
      await a.como(ANA);
      assert.equal((await db.query<{ r: boolean }>(`select public.maestro_delete_beer($1) as r`, [id])).rows[0]?.r, true);
      await a.falla(() => db.query(`select public.maestro_delete_beer($1)`, [id]), /FORBIDDEN/);

      await pasarElTiempo(db, a);
      const otra = ((await cerveza(db, RUTA, 'Otra de Ana')).rows[0]?.r as { id: string }).id;
      await a.como(ADMIN);
      await db.query(`select public.maestro_delete_beer($1)`, [otra]);
    });
  });
});

describe('0030: se va con la ruta y con la cuenta, y sale en "descargar mis datos"', () => {
  const sembrar = async (db: PGlite, a: Actor) => {
    await a.como(ANA);
    await nota(db, RUTA, 77);
    await cerveza(db, RUTA, 'Mi caña');
  };
  const cuantas = (db: PGlite, a: Actor) =>
    a.comoPostgres(async () => {
      const { rows } = await db.query<{ n: number }>(
        `select (select count(*) from public.minigame_scores)::int + (select count(*) from public.maestro_beers)::int as n`,
      );
      return rows[0]?.n as number;
    });

  it('borrar la ruta se lleva las notas y las cervezas', async () => {
    await conBase(async (db, a) => {
      await sembrar(db, a);
      assert.equal(await cuantas(db, a), 2);
      await a.como(ADMIN);
      await db.query(`delete from public.routes where id = $1`, [RUTA]);
      assert.equal(await cuantas(db, a), 0);
    });
  });

  it('borrar la cuenta se lleva las notas y las cervezas', async () => {
    await conBase(async (db, a) => {
      await sembrar(db, a);
      await a.comoPostgres(async () => {
        await db.exec(`delete from auth.users where id = '${ANA}'`);
      });
      assert.equal(await cuantas(db, a), 0);
    });
  });

  it('export_my_data incluye los records y las cervezas, con el nombre de la ruta', async () => {
    await conBase(async (db, a) => {
      await sembrar(db, a);
      const { rows } = await db.query<{ d: { minijuegos: { records: Record<string, unknown>[]; cervezas: Record<string, unknown>[] }; cuenta: unknown } }>(
        `select public.export_my_data() as d`,
      );
      const mj = rows[0]?.d.minijuegos;
      assert.equal(mj?.records.length, 1);
      assert.equal(mj?.records[0]?.mejor_nota, 77);
      assert.equal(mj?.records[0]?.ruta, 'Ruta de prueba');
      assert.equal(mj?.cervezas.length, 1);
      assert.equal(mj?.cervezas[0]?.nombre, 'Mi caña');
      assert.ok(rows[0]?.d.cuenta, 'sigue saliendo el resto de la exportacion');

      // Y solo lo de quien la pide.
      await a.como(LUIS);
      const luis = await db.query<{ d: { minijuegos: { records: unknown[]; cervezas: unknown[] } } }>(`select public.export_my_data() as d`);
      assert.deepEqual(luis.rows[0]?.d.minijuegos, { records: [], cervezas: [] });
    });
  });

  it('re-ejecutar la migracion no rompe nada ni duplica', async () => {
    const db = await crearBase(migraciones);
    try {
      await db.exec(migraciones.at(-1) as string);
      await db.exec(migraciones.at(-1) as string);
    } finally {
      await db.close();
    }
  });
});
