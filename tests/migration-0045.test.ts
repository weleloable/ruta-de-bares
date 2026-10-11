import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0045: consumiciones y racha.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. solo tras sellar, y solo en el ULTIMO bar sellado;
 *  2. tiempo minimo entre registros; puntuan como mucho N por bar y M por ruta;
 *  3. bonus de variedad la primera vez de cada categoria, con tope; sin alcohol cuenta igual;
 *  4. todo lo decide el servidor: nadie apunta consumiciones ni puntos por su cuenta;
 *  5. racha: tres seguidos de la misma casa en un bar, una vez por casa y bar.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0045_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CASA: Record<number, string> = { 1: 'mahou', 2: 'mahou', 3: 'mahou', 4: 'cruzcampo', 5: 'mahou' };

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
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
              insert into public.user_houses (user_id, house) values ('${uid(n)}', '${CASA[n]}');
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

/** Sella como postgres, `minutos` atras (para ordenar los sellos en el tiempo). */
const sellar = (db: PGlite, a: Actor, n: number, bar: number, minutos = 0) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m, stamped_at)
             values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5, now() - interval '${minutos} minutes')`),
  );

type Resultado = { puntos: number; puntua: boolean; categoria_nueva: boolean; casa: string };
const tomar = async (db: PGlite, bar: number, categoria: string) =>
  (await db.query<{ r: Resultado }>('select public.registrar_consumicion($1, $2) as r', [BAR(bar), categoria])).rows[0]?.r;

/** "Pasa el tiempo": retrasa las consumiciones ya apuntadas. */
const esperar = (db: PGlite, a: Actor, minutos: number) =>
  a.comoPostgres(() => db.exec(`update public.consumiciones set created_at = created_at - interval '${minutos} minutes'`));

const puntosDe = async (db: PGlite, a: Actor, casa: string) =>
  a.comoPostgres(async () => {
    const { rows } = await db.query<{ p: number }>(
      `select coalesce(sum(points), 0)::int as p from public.point_movements where house = $1 and annulled_at is null`,
      [casa],
    );
    return rows[0]?.p ?? 0;
  });

describe('0045: consumiciones', () => {
  it('sin sellar no se puede; tras sellar, si, y la primera da consumicion + categoria nueva', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => tomar(db, 1, 'tercio'), /NOT_STAMPED/);
      await sellar(db, a, 1, 1);
      await a.como(uid(1));
      const r = await tomar(db, 1, 'tercio');
      assert.deepEqual({ puntos: r?.puntos, puntua: r?.puntua, nueva: r?.categoria_nueva }, { puntos: 2 + 5, puntua: true, nueva: true });
    });
  });

  it('al sellar otro bar, el anterior se cierra para ti', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1, 10);
      await sellar(db, a, 1, 2, 0);
      await a.como(uid(1));
      await a.falla(() => tomar(db, 1, 'vino'), /NOT_LAST_BAR/);
      await tomar(db, 2, 'vino');
    });
  });

  it('hay que esperar el tiempo minimo entre registros, en toda la ruta', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await a.como(uid(1));
      await tomar(db, 1, 'tercio');
      await a.falla(() => tomar(db, 1, 'sin_alcohol'), /TOO_SOON/);
      await esperar(db, a, 31);
      await a.como(uid(1));
      await tomar(db, 1, 'sin_alcohol');
    });
  });

  it('en un bar puntua solo la primera (por defecto); las demas se apuntan sin puntos', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await a.como(uid(1));
      await tomar(db, 1, 'tercio');
      await esperar(db, a, 31);
      await a.como(uid(1));
      const segunda = await tomar(db, 1, 'tercio');
      assert.deepEqual({ puntos: segunda?.puntos, puntua: segunda?.puntua }, { puntos: 0, puntua: false });
      await a.comoPostgres(async () => {
        const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.consumiciones');
        assert.equal(rows[0]?.n, 2, 'se apuntan las dos');
      });
    });
  });

  it('la variedad tiene tope (3 por defecto) y "sin alcohol" es una categoria mas', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.routes set consumo_por_bar = 10, consumo_por_ruta = 50 where id = '${RUTA}'`));
      await sellar(db, a, 1, 1);
      const nuevas: boolean[] = [];
      for (const cat of ['sin_alcohol', 'tercio', 'vino', 'sidra']) {
        await a.como(uid(1));
        nuevas.push(Boolean((await tomar(db, 1, cat))?.categoria_nueva));
        await esperar(db, a, 31);
      }
      assert.deepEqual(nuevas, [true, true, true, false], 'la cuarta categoria ya no da bonus');
      // 4 consumiciones a 2 + 3 bonus de variedad a 5 + el sello.
      assert.equal(await puntosDe(db, a, 'mahou'), 4 * 2 + 3 * 5 + 10);
    });
  });

  it('el tope de la ruta corta las consumiciones que puntuan', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.routes set consumo_por_bar = 5, consumo_por_ruta = 2 where id = '${RUTA}'`));
      await sellar(db, a, 1, 1);
      const puntuan: boolean[] = [];
      for (let k = 0; k < 3; k++) {
        await a.como(uid(1));
        puntuan.push(Boolean((await tomar(db, 1, 'tercio'))?.puntua));
        await esperar(db, a, 31);
      }
      assert.deepEqual(puntuan, [true, true, false]);
    });
  });

  it('nadie apunta consumiciones ni puntos por su cuenta, y solo se ven las tuyas', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 2, 1);
      await a.como(uid(1));
      await tomar(db, 1, 'tercio');
      await a.falla(
        () => db.query(`insert into public.consumiciones (route_id, route_bar_id, user_id, categoria, puntua) values ($1, $2, $3, 'jarra', true)`, [RUTA, BAR(1), uid(1)]),
        /permission denied/,
      );
      await a.falla(() => tomar(db, 1, 'cerveza_gratis'), /INVALID_CATEGORY/);
      await a.como(uid(2));
      assert.equal((await db.query('select * from public.consumiciones')).rows.length, 0, 'no ve las de otro');
      await a.como(uid(1));
      assert.equal((await db.query('select * from public.consumiciones')).rows.length, 1);
    });
  });

  it('los limites de la ruta tienen tope en la tabla', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await a.falla(() => db.exec(`update public.routes set consumo_minutos = 999 where id = '${RUTA}'`), /routes_consumo_check/);
        await a.falla(() => db.exec(`update public.routes set variedad_max = 7 where id = '${RUTA}'`), /routes_consumo_check/);
      });
    });
  });
});

describe('0045: racha', () => {
  it('tres seguidos de la misma casa en un bar: bonus para la casa, una sola vez', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1, 30);
      await sellar(db, a, 2, 1, 20);
      const antes = await puntosDe(db, a, 'mahou');
      await sellar(db, a, 3, 1, 10);
      assert.equal(await puntosDe(db, a, 'mahou'), antes + 10 + 6, 'el sello y la racha');
      // Un cuarto de la misma casa: sin racha nueva (una vez por casa y bar).
      await sellar(db, a, 5, 1, 0);
      await a.comoPostgres(async () => {
        const { rows } = await db.query<{ n: number; detail: { usuarios: string[] } }>(
          `select count(*) over ()::int as n, detail from public.point_movements where action = 'racha'`,
        );
        assert.equal(rows.length, 1);
        assert.deepEqual(rows[0]?.detail.usuarios.sort(), [uid(1), uid(2), uid(3)].sort(), 'guarda quienes la hicieron');
      });
    });
  });

  it('si alguien de otra casa sella en medio, no hay racha', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1, 30);
      await sellar(db, a, 4, 1, 20);
      await sellar(db, a, 2, 1, 10);
      await sellar(db, a, 3, 1, 0);
      await a.comoPostgres(async () => {
        const { rows } = await db.query(`select 1 from public.point_movements where action = 'racha'`);
        assert.equal(rows.length, 0);
      });
    });
  });

  it('con la racha repetible, cada sello que la mantiene vuelve a puntuar', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.routes set racha_repetible = true where id = '${RUTA}'`));
      await sellar(db, a, 1, 1, 30);
      await sellar(db, a, 2, 1, 20);
      await sellar(db, a, 3, 1, 10);
      await sellar(db, a, 5, 1, 0);
      await a.comoPostgres(async () => {
        const { rows } = await db.query(`select 1 from public.point_movements where action = 'racha'`);
        assert.equal(rows.length, 2);
      });
    });
  });
});
