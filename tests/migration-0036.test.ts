import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0036: los 14 bares de la lista cerrada pasan a `catalog_bars`, y las paradas
 * que ya existen reciben su logo.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. los 14 bares quedan en la tabla, con logo, sin dueno, y un admin los ve;
 *  2. **un jugador sigue sin leer la tabla**, pero lee el logo en SU parada (es
 *     el camino por el que ve el sello ahora que la app ya no lo trae);
 *  3. el relleno de paradas casa por nombre sin distinguir mayusculas, no pisa un
 *     logo que la parada ya tenia y no toca lo que no casa;
 *  4. se puede pegar dos veces (y el update se puede repetir solo, tras subir un
 *     bar propio) sin duplicar nada ni pisar lo que un admin cambio entre medias.
 */

const todas = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0036_zzz');
const migraciones = todas.map((n) => leerFichero(`supabase/migrations/${n}`));
const hasta0035 = todas.filter((f) => f <= '0035_zzz').map((n) => leerFichero(`supabase/migrations/${n}`));
const m0036 = migraciones[migraciones.length - 1] as string;

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const JUGADOR = '00000000-0000-4000-8000-00000000000c';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const LOGO_PROPIO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'a@example.com'), ('${JUGADOR}', 'j@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta', true, '${ADMIN}', current_date + 10);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${JUGADOR}');
`;

const parada = (orden: number, nombre: string, logo: string | null = null) =>
  `insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at, logo)
   values ('${RUTA}', ${orden}, '${nombre.replace(/'/g, "''")}', 40.48, -3.36, now(), now() + interval '1 hour',
           ${logo === null ? 'null' : `'${logo}'`})`;

/** Base con la 0035 y paradas ya creadas, y DESPUES la 0036: el caso real del despliegue. */
async function conParadasPrevias(paradas: string[], fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(hasta0035);
  await db.exec(DATOS);
  for (const p of paradas) await db.exec(p);
  await db.exec(m0036);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const logoDe = async (db: PGlite, nombre: string) =>
  (await db.query<{ logo: string | null }>(`select logo from public.route_bars where name = $1`, [nombre])).rows[0]?.logo;

describe('0036: la tabla', () => {
  it('trae los 14 bares, con logo PNG, sin dueno, y un admin los ve', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      const { rows } = await db.query<{ n: string; con_logo: string; sin_dueno: string }>(
        `select count(*)::text as n,
                count(*) filter (where logo like 'data:image/png;base64,%')::text as con_logo,
                count(*) filter (where created_by is null)::text as sin_dueno
         from public.catalog_bars`,
      );
      assert.deepEqual(rows[0], { n: '14', con_logo: '14', sin_dueno: '14' });
    });
  });

  it('un jugador sigue sin ver ni un nombre', async () => {
    await conBase(async (db, a) => {
      await a.como(JUGADOR);
      const { rows } = await db.query(`select name from public.catalog_bars`);
      assert.deepEqual(rows, []);
    });
  });

  it('pegarla dos veces no duplica nada', async () => {
    const db = await crearBase([...migraciones, m0036]);
    try {
      const { rows } = await db.query<{ n: string }>(`select count(*)::text as n from public.catalog_bars`);
      assert.equal(rows[0].n, '14');
    } finally {
      await db.close();
    }
  });

  it('un bar que un admin ya habia creado con ese nombre no se pisa ni se duplica', async () => {
    const db = await crearBase(hasta0035);
    try {
      await db.exec(DATOS);
      await db.exec(`insert into public.catalog_bars (name, lat, lng, logo, created_by)
                     values ('LOLA', 1, 1, '${LOGO_PROPIO}', '${ADMIN}')`);
      await db.exec(m0036);
      const { rows } = await db.query<{ name: string; logo: string; created_by: string }>(
        `select name, logo, created_by from public.catalog_bars where lower(name) = 'lola'`,
      );
      assert.deepEqual(rows, [{ name: 'LOLA', logo: LOGO_PROPIO, created_by: ADMIN }]);
      assert.equal((await db.query(`select 1 from public.catalog_bars`)).rows.length, 14);
    } finally {
      await db.close();
    }
  });
});

describe('0036: las paradas que ya existian', () => {
  it('reciben el logo por nombre, sin distinguir mayusculas ni espacios, y un jugador lo lee', async () => {
    await conParadasPrevias([parada(0, 'ANEXO'), parada(1, '  la ruina '), parada(2, "Wheelan's")], async (db, a) => {
      await a.como(JUGADOR);
      for (const nombre of ['ANEXO', '  la ruina ', "Wheelan's"]) {
        const logo = await logoDe(db, nombre);
        assert.match(logo ?? '', /^data:image\/png;base64,/, nombre);
      }
    });
  });

  it('no pisa un logo que la parada ya llevaba', async () => {
    await conParadasPrevias([parada(0, 'Lola', LOGO_PROPIO)], async (db) => {
      assert.equal(await logoDe(db, 'Lola'), LOGO_PROPIO);
    });
  });

  it('una parada cuyo nombre no casa se queda sin logo (sale con iniciales)', async () => {
    await conParadasPrevias([parada(0, 'Bar de la esquina')], async (db) => {
      assert.equal(await logoDe(db, 'Bar de la esquina'), null);
    });
  });

  it('el relleno se puede repetir solo: copia el logo de un bar subido despues', async () => {
    await conParadasPrevias([parada(0, 'Shamrock')], async (db, a) => {
      assert.equal(await logoDe(db, 'Shamrock'), null);
      await a.como(ADMIN);
      await db.query(`insert into public.catalog_bars (name, lat, lng, logo, created_by) values ('Shamrock', 40.48, -3.36, $1, $2)`, [LOGO_PROPIO, ADMIN]);
      await a.comoPostgres(async () => {
        // Es exactamente el update del fichero, que el admin puede volver a pegar.
        const update = m0036.slice(m0036.indexOf('update public.route_bars'), m0036.indexOf('-- Paradas que siguen sin logo'));
        await db.exec(update);
      });
      assert.equal(await logoDe(db, 'Shamrock'), LOGO_PROPIO);
    });
  });

  it('la consulta final solo lista las paradas sin logo, y no cambia nada', async () => {
    const db = await crearBase(hasta0035);
    try {
      await db.exec(DATOS);
      await db.exec(parada(0, 'Lola'));
      await db.exec(parada(1, 'Bar de la esquina'));
      const resultados = await db.exec(m0036);
      const ultimo = resultados[resultados.length - 1];
      assert.deepEqual(ultimo.rows, [{ parada: 'Bar de la esquina', ruta: 'Ruta' }]);
    } finally {
      await db.close();
    }
  });
});
