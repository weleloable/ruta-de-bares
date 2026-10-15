import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0069: La Caña Perfecta con decimales, y meter a alguien en una ruta.
 *
 *  1. la nota de la caña lleva 2 decimales, el ranking ordena por ellos y los
 *     demas juegos siguen en enteros;
 *  2. una app en cache que envia 87 sigue funcionando;
 *  3. las notas viejas de la caña se borran UNA vez (y volver a pegar no borra
 *     las nuevas); las de los otros juegos se quedan;
 *  4. un admin mete a alguien en una ruta: casa asignada en el acto, equilibrada,
 *     sin saltarse el veto, idempotente, y solo admins.
 */

const todas = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
const hasta = (tope: string) => todas.filter((f) => f <= tope).map((n) => leerFichero(`supabase/migrations/${n}`));
const antes = hasta('0068_zzz');
const migraciones = hasta('0069_zzz');
const M69 = leerFichero('supabase/migrations/0069_cana_decimales_y_meter_en_ruta.sql');

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const RUTA2 = '00000000-0000-4000-8000-0000000000f2';
const CANA = 'cana-perfecta';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin', display_name = 'Admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta', true, '${ADMIN}', current_date),
    ('${RUTA2}', 'Otra', true, '${ADMIN}', current_date);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ADMIN}');
  ${[1, 2, 3, 4]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
    )
    .join('\n')}
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>, lista = migraciones) {
  const db = await crearBase(lista);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

type Filas = { rows: Record<string, unknown>[] };
const enviar = (db: PGlite, juego: string, nota: number | string, ms: number | null = null) =>
  db.query<{ r: { best: number; is_record: boolean } }>('select public.minigame_submit_nota($1, $2, $3, $4) as r', [RUTA, juego, nota, ms]);
// El antirrebote de 4 s entre envios: se adelanta el reloj como postgres (la app no puede tocar la tabla).
const esperar4s = (db: PGlite, a: Actor, quien: string, juego: string) =>
  a.comoPostgres(() =>
    db.query(`update public.minigame_scores set last_submit_at = now() - interval '10 seconds' where user_id = $1 and game = $2`, [quien, juego]),
  );

describe('0069: las notas de la caña con decimales', () => {
  it('guarda dos decimales y los devuelve', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      const r = await enviar(db, CANA, 94.666);
      assert.equal(Number(r.rows[0].r.best), 94.67, 'redondea a dos decimales');
      const g = await a.comoPostgres(() => db.query<{ best_score: string }>(`select best_score from public.minigame_scores where user_id = $1`, [uid(1)]));
      assert.equal(Number(g.rows[0].best_score), 94.67);
    });
  });

  it('mejorar por una centesima es un record; igualar o empeorar, no', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      assert.equal((await enviar(db, CANA, 99.03)).rows[0].r.is_record, true);
      await esperar4s(db, a, uid(1), CANA);
      assert.equal((await enviar(db, CANA, 99.04)).rows[0].r.is_record, true);
      await esperar4s(db, a, uid(1), CANA);
      assert.equal((await enviar(db, CANA, 99.04)).rows[0].r.is_record, false);
      await esperar4s(db, a, uid(1), CANA);
      const r = await enviar(db, CANA, 98.5);
      assert.equal(r.rows[0].r.is_record, false);
      assert.equal(Number(r.rows[0].r.best), 99.04, 'se queda con la mejor');
    });
  });

  it('el ranking ordena por los decimales y los devuelve (99,34 antes que 99,03)', async () => {
    await conBase(async (db, a) => {
      for (const [n, nota] of [[1, 99.03], [2, 99.34], [3, 99.03], [4, 87.5]] as const) {
        await a.como(uid(n));
        await enviar(db, CANA, nota);
      }
      await a.como(uid(1));
      const r = (await db.query<{ pos: string; score: string; display_name: string }>('select * from public.minigame_ranking($1, $2, 10)', [RUTA, CANA])).rows;
      assert.deepEqual(r.map((x) => Number(x.score)), [99.34, 99.03, 99.03, 87.5]);
      assert.equal(r[0].display_name, 'Persona2');
      // Con la misma nota, gana quien la logro antes (Persona1 envio antes que Persona3).
      assert.deepEqual(r.slice(1, 3).map((x) => x.display_name), ['Persona1', 'Persona3']);
    });
  });

  it('el rango sigue siendo 0 a 100', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, CANA, 100.01), 'INVALID_SCORE');
      await a.falla(() => enviar(db, CANA, -0.01), 'INVALID_SCORE');
      assert.equal(Number((await enviar(db, CANA, 100)).rows[0].r.best), 100);
    });
  });

  it('los demas juegos siguen en enteros', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, 'conga-cervecera', 123.5), 'INVALID_SCORE');
      await a.falla(() => enviar(db, 'tapon-al-vuelo', 10.01), 'INVALID_SCORE');
      assert.equal(Number((await enviar(db, 'conga-cervecera', 123)).rows[0].r.best), 123);
      assert.equal(Number((await enviar(db, 'tapon-al-vuelo', 1250)).rows[0].r.best), 1250);
      await a.falla(() => enviar(db, 'tapon-al-vuelo', 1251), 'INVALID_SCORE');
    });
  });

  it('una app en cache (la funcion vieja, con enteros) sigue guardando los demas juegos', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      const r = await db.query<{ r: { best: number } }>(`select public.minigame_submit_score($1, 'conga-cervecera', 4321, null) as r`, [RUTA]);
      assert.equal(Number(r.rows[0].r.best), 4321);
      const q = await db.query<{ r: { best: number } }>(`select public.minigame_submit_score($1, 'quien-quiere-ser-cervecero', 3, 12000) as r`, [RUTA]);
      assert.equal(Number(q.rows[0].r.best), 3);
    });
  });

  it('...pero NO la caña: una pestaña vieja abierta no mete notas de la escala generosa tras el borrado', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => db.query(`select public.minigame_submit_score($1, 'cana-perfecta', 100, null)`, [RUTA]), 'APP_UPDATE_REQUIRED');
      const n = await a.comoPostgres(() => db.query<{ n: number }>(`select count(*)::int as n from public.minigame_scores where game = 'cana-perfecta'`));
      assert.equal(n.rows[0].n, 0, 'no se guardo nada');
      // Y la funcion nueva si guarda la caña.
      assert.equal(Number((await enviar(db, CANA, 94.5)).rows[0].r.best), 94.5);
    });
  });

  it('la vieja respeta lo de siempre en los demas juegos: sesion, ruta y suspension', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => db.query(`select public.minigame_submit_score($1, 'juego-que-no-existe', 1, null)`, [RUTA]), 'INVALID_GAME');
      await a.anonimo();
      await a.falla(() => db.query(`select public.minigame_submit_score($1, 'conga-cervecera', 1, null)`, [RUTA]), /permission denied/);
    });
  });

  it('el quiz sigue pidiendo el tiempo y desempatando por el', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => enviar(db, 'quien-quiere-ser-cervecero', 4), 'INVALID_TIME');
      await enviar(db, 'quien-quiere-ser-cervecero', 4, 30000);
      await a.como(uid(2));
      await enviar(db, 'quien-quiere-ser-cervecero', 4, 20000);
      const r = (await db.query<{ display_name: string }>(`select * from public.minigame_ranking($1, 'quien-quiere-ser-cervecero', 10)`, [RUTA])).rows;
      assert.deepEqual(r.map((x) => x.display_name), ['Persona2', 'Persona1']);
    });
  });

  it('el podio de las casas usa los decimales: 99,34 gana a 99,03', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(`
          insert into public.user_houses (user_id, house) values ('${uid(1)}', 'mahou'), ('${uid(2)}', 'cruzcampo')
            on conflict (user_id) do update set house = excluded.house;
          insert into public.minigame_scores (route_id, user_id, game, best_score, best_at) values
            ('${RUTA}', '${uid(1)}', '${CANA}', 99.03, now()),
            ('${RUTA}', '${uid(2)}', '${CANA}', 99.34, now() + interval '1 minute');`);
      });
      // casas_podios no la llama la app (la usan por dentro las funciones de puntos).
      const p = (
        await a.comoPostgres(() =>
          db.query<{ puesto: number; user_id: string }>(`select * from public.casas_podios($1) where juego = '${CANA}' order by puesto`, [RUTA]),
        )
      ).rows;
      assert.deepEqual(p.map((x) => [x.puesto, x.user_id]), [[1, uid(2)], [2, uid(1)]]);
    });
  });
});

describe('0069: las notas viejas', () => {
  it('se borran las de la caña, una sola vez, y se quedan las de los demas juegos', async () => {
    const db = await crearBase(antes);
    try {
      await db.exec(DATOS);
      await db.exec(`
        insert into public.minigame_scores (route_id, user_id, game, best_score, best_at) values
          ('${RUTA}', '${uid(1)}', '${CANA}', 100, now()),
          ('${RUTA}', '${uid(2)}', '${CANA}', 87, now()),
          ('${RUTA}', '${uid(1)}', 'conga-cervecera', 5000, now());`);
      await db.exec(M69);
      let n = await db.query<{ game: string }>(`select game from public.minigame_scores order by game`);
      assert.deepEqual(n.rows.map((r) => r.game), ['conga-cervecera'], 'la caña vieja fuera, la conga se queda');

      // Una nota NUEVA y volver a pegar la migracion: no se borra.
      await db.exec(`insert into public.minigame_scores (route_id, user_id, game, best_score, best_at) values ('${RUTA}', '${uid(3)}', '${CANA}', 99.03, now());`);
      await db.exec(M69);
      n = await db.query<{ game: string }>(`select game from public.minigame_scores where game = '${CANA}'`);
      assert.equal(n.rows.length, 1, 'volver a pegar la 0069 no borra las notas nuevas');
    } finally {
      await db.close();
    }
  });
});

describe('0069: meter a alguien en una ruta', () => {
  const meter = (db: PGlite, quien: string, ruta: string) =>
    db.query<{ r: { ya_estaba: boolean; casa: string | null } }>('select public.admin_meter_en_ruta($1, $2) as r', [quien, ruta]);
  const casaDe = async (db: PGlite, a: Actor, quien: string) =>
    a.comoPostgres(async () => (await db.query<{ house: string }>(`select house from public.user_houses where user_id = $1`, [quien])).rows[0]?.house ?? null);

  it('queda como miembro, con quien lo hizo, y se le asigna casa en el acto', async () => {
    await conBase(async (db, a) => {
      // Una cuenta recien creada: sin ruta y sin casa (las de los datos de prueba ya entraron en RUTA).
      await a.comoPostgres(() => db.exec(`insert into auth.users (id, email) values ('${uid(9)}', 'nueva@example.com');`));
      await a.como(ADMIN);
      assert.equal(await casaDe(db, a, uid(9)), null, 'antes no tiene casa');
      const r = await meter(db, uid(9), RUTA2);
      assert.equal(r.rows[0].r.ya_estaba, false);
      const casa = r.rows[0].r.casa;
      assert.ok(['mahou', 'cruzcampo', 'estrella', 'alhambra'].includes(casa as string), `casa ${casa}`);
      assert.equal(await casaDe(db, a, uid(9)), casa);
      const m = await a.comoPostgres(() => db.query<{ added_by: string; invite_id: string | null }>(`select added_by, invite_id from public.route_members where route_id = $1 and user_id = $2`, [RUTA2, uid(9)]));
      assert.deepEqual(m.rows, [{ added_by: ADMIN, invite_id: null }]);
    });
  });

  it('la casa es la que menos gente tiene en ESA ruta', async () => {
    await conBase(async (db, a) => {
      // Los cuatro de RUTA, con casa fija: dos de mahou, uno de cruzcampo, uno de estrella.
      await a.comoPostgres(() =>
        db.exec(`
          insert into auth.users (id, email) values ('${uid(9)}', 'nueva@example.com');
          -- Tambien el admin, que esta en RUTA y tiene casa al azar: sin fijarla, a veces
          -- caia en alhambra y el test dejaba de ser determinista.
          update public.user_houses set house = case user_id
            when '${uid(1)}' then 'mahou' when '${uid(2)}' then 'mahou' when '${ADMIN}' then 'mahou'
            when '${uid(3)}' then 'cruzcampo' when '${uid(4)}' then 'estrella' end
           where user_id in ('${uid(1)}', '${uid(2)}', '${uid(3)}', '${uid(4)}', '${ADMIN}');`),
      );
      await a.como(ADMIN);
      const r = await meter(db, uid(9), RUTA);
      assert.equal(r.rows[0].r.casa, 'alhambra', 'la unica casa vacia en esa ruta');
    });
  });

  it('si ya tiene casa, se queda con ella', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`insert into public.user_houses (user_id, house) values ('${uid(1)}', 'estrella') on conflict (user_id) do update set house = 'estrella';`));
      await a.como(ADMIN);
      assert.equal((await meter(db, uid(1), RUTA2)).rows[0].r.casa, 'estrella');
    });
  });

  it('es idempotente: la segunda vez dice que ya estaba y no cambia nada', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      const uno = await meter(db, uid(1), RUTA2);
      const dos = await meter(db, uid(1), RUTA2);
      assert.equal(uno.rows[0].r.ya_estaba, false);
      assert.equal(dos.rows[0].r.ya_estaba, true);
      assert.equal(dos.rows[0].r.casa, uno.rows[0].r.casa);
      const n = await a.comoPostgres(() => db.query<{ n: number }>(`select count(*)::int as n from public.route_members where route_id = $1 and user_id = $2`, [RUTA2, uid(1)]));
      assert.equal(n.rows[0].n, 1);
    });
  });

  it('no se salta el veto: ni alguien vetado de esa ruta ni una cuenta suspendida', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() =>
        db.exec(`
          insert into public.route_bans (route_id, user_id, reason, banned_by) values ('${RUTA2}', '${uid(1)}', 'Prueba', '${ADMIN}');
          insert into public.account_suspensions (user_id, reason, suspended_by) values ('${uid(2)}', 'Prueba', '${ADMIN}');`),
      );
      await a.como(ADMIN);
      await a.falla(() => meter(db, uid(1), RUTA2), 'ROUTE_BANNED');
      await a.falla(() => meter(db, uid(2), RUTA2), 'ACCOUNT_SUSPENDED');
      // Y a otra persona, en esa misma ruta, si.
      assert.equal((await meter(db, uid(3), RUTA2)).rows[0].r.ya_estaba, false);
      const dentro = await a.comoPostgres(() => db.query<{ n: number }>(`select count(*)::int as n from public.route_members where route_id = $1 and user_id in ($2, $3)`, [RUTA2, uid(1), uid(2)]));
      assert.equal(dentro.rows[0].n, 0, 'los dos vetados siguen fuera');
    });
  });

  it('una persona que no existe o una ruta que no existe, no', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await a.falla(() => meter(db, uid(99), RUTA), 'NOT_FOUND');
      await a.falla(() => meter(db, uid(1), uid(98)), 'ROUTE_NOT_FOUND');
    });
  });

  it('solo un admin: ni un jugador (ni a si mismo) ni sin sesion', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => meter(db, uid(1), RUTA2), 'NOT_ADMIN');
      await a.anonimo();
      await a.falla(() => meter(db, uid(1), RUTA2), /permission denied/);
    });
  });
});

describe('0069: nada de lo anterior se rompe', () => {
  it('una base con todas las migraciones hasta la 0069 arranca', async () => {
    const db = await crearBase(migraciones);
    try {
      const r = await db.query<{ data_type: string; numeric_scale: number }>(
        `select data_type, numeric_scale from information_schema.columns where table_name = 'minigame_scores' and column_name = 'best_score'`,
      );
      assert.deepEqual(r.rows, [{ data_type: 'numeric', numeric_scale: 2 }]);
      for (const nombre of ['minigame_submit_score', 'minigame_submit_nota']) {
        const n = (await db.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname = $1`, [nombre])).rows[0].n;
        assert.equal(n, 1, `una sola ${nombre}: dos sobrecargas con los mismos argumentos nombrados dan "Could not choose the best candidate function" en PostgREST`);
      }
    } finally {
      await db.close();
    }
  });
});

void (null as unknown as Filas);
