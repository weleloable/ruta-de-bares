import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0043: las cuatro casas.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. se asigna al entrar por PRIMERA vez en una ruta, equilibrando dentro de ella;
 *  2. Pablo -> Cruzcampo y Rodrigo -> Estrella, por encima del equilibrio;
 *  3. es para siempre: entrar en otra ruta no la cambia;
 *  4. quien ya estaba en rutas recibe casa al aplicar la migracion;
 *  5. todos la ven, nadie la toca desde la app, y "vista" solo la marca uno mismo.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0043_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const ANTES = nombres.filter((n) => n < '0043').map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0043 = leerFichero('supabase/migrations/0043_casas.sql');

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA = '00000000-0000-4000-8000-0000000000f2';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const BASE = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date),
    ('${OTRA}', 'Otra ruta', true, '${ADMIN}', current_date);
`;

/** Crea usuarios con su nombre visible (sin espacios, como exige la 0003). */
const usuarios = (lista: [number, string][]) =>
  lista
    .map(
      ([n, nombre]) =>
        `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
         update public.profiles set display_name = '${nombre}' where id = '${uid(n)}';`,
    )
    .join('\n');

const entrar = (db: PGlite, ruta: string, n: number) =>
  db.exec(`insert into public.route_members (route_id, user_id) values ('${ruta}', '${uid(n)}')`);

const casaDe = async (db: PGlite, n: number) =>
  (await db.query<{ house: string }>('select house from public.user_houses where user_id = $1', [uid(n)])).rows[0]?.house ?? null;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>, previas = migraciones) {
  const db = await crearBase(previas);
  await db.exec(BASE);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

describe('0043: las casas', () => {
  it('al entrar en una ruta toca casa, y ocho personas quedan dos y dos', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(usuarios([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, `Persona${n}`])));
        assert.equal(await casaDe(db, 1), null, 'registrarse no da casa');
        for (let n = 1; n <= 8; n++) await entrar(db, RUTA, n);
        const { rows } = await db.query<{ house: string; n: number }>(
          'select house, count(*)::int as n from public.user_houses group by house order by house',
        );
        assert.deepEqual(rows.map((r) => r.n), [2, 2, 2, 2], JSON.stringify(rows));
      });
    });
  });

  it('el equilibrio es DENTRO de la ruta, no en toda la app', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(usuarios([1, 2, 3, 4, 5].map((n) => [n, `Persona${n}`])));
        // Cuatro entran en OTRA: una de cada casa.
        for (let n = 1; n <= 4; n++) await entrar(db, OTRA, n);
        // El quinto entra en RUTA, donde no hay nadie: cualquier casa vale, pero
        // en cuanto los de OTRA entren tambien en RUTA, ya no se reparte de nuevo.
        await entrar(db, RUTA, 5);
        for (let n = 1; n <= 4; n++) await entrar(db, RUTA, n);
        const { rows } = await db.query<{ n: number }>(`select count(distinct house)::int as n from public.user_houses`);
        assert.equal(rows[0]?.n, 4);
      });
    });
  });

  it('Pablo va a Cruzcampo y Rodrigo a Estrella, aunque desequilibre, sin mirar mayusculas ni tildes', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(usuarios([
          [1, 'Pablo'],
          [2, 'PABLITO_no'],
          [3, 'pabloG'],
          [4, 'Rodrigo92'],
          [5, 'RÓDRIGO'],
          [6, 'Paula'],
        ]));
        for (const n of [1, 3, 4, 5, 2, 6]) await entrar(db, RUTA, n);
        assert.equal(await casaDe(db, 1), 'cruzcampo');
        assert.equal(await casaDe(db, 3), 'cruzcampo');
        assert.equal(await casaDe(db, 4), 'estrella');
        assert.equal(await casaDe(db, 5), 'estrella');
        assert.notEqual(await casaDe(db, 2), null);
        // "PABLITO_no" no empieza por "pablo" (es "pabli..."): entra por equilibrio.
        // Con 2 en Cruzcampo y 2 en Estrella, los dos siguientes van a las vacias.
        const otras = [await casaDe(db, 2), await casaDe(db, 6)].sort();
        assert.deepEqual(otras, ['alhambra', 'mahou']);
      });
    });
  });

  it('es para siempre: entrar en otra ruta, o salir y volver, no la cambia', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(usuarios([[1, 'Ana']]));
        await entrar(db, RUTA, 1);
        const antes = await casaDe(db, 1);
        await entrar(db, OTRA, 1);
        await db.exec(`delete from public.route_members where user_id = '${uid(1)}'`);
        await entrar(db, RUTA, 1);
        assert.equal(await casaDe(db, 1), antes);
      });
    });
  });

  it('quien ya estaba en rutas recibe casa al aplicar la migracion, y quien no, no', async () => {
    const db = await crearBase(ANTES);
    try {
      await db.exec(BASE);
      // Pablo entra el primero: si entrase despues, el sorteo podria haber dado ya
      // Cruzcampo a otro y el iria igual (la excepcion manda sobre el equilibrio).
      await db.exec(usuarios([
        [1, 'Pablo'],
        [2, 'Ana'],
        [3, 'Luis'],
        [4, 'Marta'],
        [5, 'SinRuta'],
      ]));
      for (const n of [1, 2, 3, 4]) await entrar(db, RUTA, n);
      await db.exec(LA_0043);
      assert.equal(await casaDe(db, 1), 'cruzcampo');
      const { rows } = await db.query<{ n: number }>('select count(distinct house)::int as n from public.user_houses');
      assert.equal(rows[0]?.n, 4, 'cuatro personas en una ruta: una por casa');
      assert.equal(await casaDe(db, 5), null);
      // Y la animacion esta pendiente para todos.
      const vistas = await db.query<{ n: number }>('select count(*)::int as n from public.user_houses where seen_at is not null');
      assert.equal(vistas.rows[0]?.n, 0);
      // Pegarla otra vez no reparte de nuevo.
      const antes = await db.query('select user_id, house from public.user_houses order by user_id');
      await db.exec(LA_0043);
      const despues = await db.query('select user_id, house from public.user_houses order by user_id');
      assert.deepEqual(despues.rows, antes.rows);
    } finally {
      await db.close();
    }
  });

  it('todos ven las casas; nadie las toca desde la app; "vista" solo la marca uno mismo', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(usuarios([
          [1, 'Ana'],
          [2, 'Luis'],
        ]));
        await entrar(db, RUTA, 1);
        await entrar(db, RUTA, 2);
      });
      await a.como(uid(1));
      const { rows } = await db.query('select user_id, house from public.user_houses');
      assert.equal(rows.length, 2, 've la casa de los dos');
      await a.falla(() => db.query(`update public.user_houses set house = 'mahou' where user_id = $1`, [uid(1)]), /permission denied/);
      await a.falla(() => db.query(`insert into public.user_houses (user_id, house) values ($1, 'mahou')`, [uid(1)]), /permission denied/);
      await a.falla(() => db.query(`delete from public.user_houses where user_id = $1`, [uid(1)]), /permission denied/);
      await a.falla(() => db.query(`select public.asignar_casa($1, $2)`, [uid(1), RUTA]), /permission denied/);
      await db.query('select public.casa_marcar_vista()');
      await a.comoPostgres(async () => {
        const r = await db.query<{ user_id: string }>('select user_id from public.user_houses where seen_at is not null');
        assert.deepEqual(r.rows.map((x) => x.user_id), [uid(1)]);
      });
    });
  });

  it('se borra con la cuenta', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.exec(usuarios([[1, 'Ana']]));
        await entrar(db, RUTA, 1);
        await db.exec(`delete from auth.users where id = '${uid(1)}'`);
        assert.equal(await casaDe(db, 1), null);
      });
    });
  });
});
