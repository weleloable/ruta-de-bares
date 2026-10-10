import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0035: catalogo de bares compartido entre admins, y logo en la parada.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. **solo los admins leen y escriben `catalog_bars`**: un jugador, aunque
 *     este dentro de una ruta, no ve ni los nombres (una ruta sin publicar es
 *     una sorpresa), y sin sesion tampoco;
 *  2. **un admin ve los bares que creo otro** (el bug que arregla);
 *  3. nadie crea un bar a nombre de otro, ni edita, ni borra el de otro;
 *  4. el nombre es unico sin distinguir mayusculas, y el logo y las
 *     coordenadas tienen tope en el servidor;
 *  5. `route_bars.logo` acepta el mismo formato y lo mismo tope;
 *  6. borrarse la cuenta no se lleva el bar, y ese bar huerfano lo quita un admin.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0035_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN_A = '00000000-0000-4000-8000-00000000000a';
const ADMIN_B = '00000000-0000-4000-8000-00000000000b';
const JUGADOR = '00000000-0000-4000-8000-00000000000c';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ADMIN_A}', 'a@example.com'),
    ('${ADMIN_B}', 'b@example.com'),
    ('${JUGADOR}', 'j@example.com');
  update public.profiles set role = 'admin' where id in ('${ADMIN_A}', '${ADMIN_B}');
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta', true, '${ADMIN_A}', current_date + 10);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${JUGADOR}');
`;

const LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const crear = (db: PGlite, uid: string, nombre: string, logo: string | null = LOGO, lat = 40.48, lng = -3.36) =>
  db.query(`insert into public.catalog_bars (name, lat, lng, logo, created_by) values ($1, $2, $3, $4, $5)`, [
    nombre,
    lat,
    lng,
    logo,
    uid,
  ]);

const nombresVisibles = async (db: PGlite) =>
  (await db.query<{ name: string }>(`select name from public.catalog_bars order by name`)).rows.map((r) => r.name);

describe('0035: quien ve el catalogo compartido', () => {
  it('un admin ve el bar que creo OTRO admin, con su logo (el bug)', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.como(ADMIN_B);
      const { rows } = await db.query<{ name: string; logo: string }>(`select name, logo from public.catalog_bars`);
      assert.deepEqual(rows, [{ name: 'La Cepa', logo: LOGO }]);
    });
  });

  it('un jugador de la ruta no ve nada, ni los nombres', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.como(JUGADOR);
      assert.deepEqual(await nombresVisibles(db), []);
    });
  });

  it('sin sesion no hay ni permiso para la tabla', async () => {
    await conBase(async (db, a) => {
      await a.anonimo();
      await a.falla(() => db.query(`select * from public.catalog_bars`), /permission denied/);
      await a.falla(() => crear(db, ADMIN_A, 'X'), /permission denied/);
    });
  });

  it('un jugador no puede crear', async () => {
    await conBase(async (db, a) => {
      await a.como(JUGADOR);
      await a.falla(() => crear(db, JUGADOR, 'Colado'), /row-level security/);
    });
  });
});

describe('0035: quien escribe', () => {
  it('no se crea un bar a nombre de otro admin', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await a.falla(() => crear(db, ADMIN_B, 'Suplantado'), /row-level security/);
      await a.falla(() => db.query(`insert into public.catalog_bars (name, lat, lng) values ('Sin autor', 1, 1)`), /row-level security/);
    });
  });

  it('solo borra el que lo creo; el otro admin no (0 filas, sin error)', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.como(ADMIN_B);
      const ajeno = await db.query(`delete from public.catalog_bars where name = 'La Cepa'`);
      assert.equal(ajeno.affectedRows, 0);
      await a.como(ADMIN_A);
      const propio = await db.query(`delete from public.catalog_bars where name = 'La Cepa'`);
      assert.equal(propio.affectedRows, 1);
    });
  });

  it('no se puede editar: ni el autor', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.falla(() => db.query(`update public.catalog_bars set logo = null`), /permission denied/);
    });
  });

  it('ni anon ni authenticated pueden vaciar la tabla (truncate)', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await a.falla(() => db.query(`truncate public.catalog_bars`), /permission denied/);
    });
  });

  it('un bar sin autor (cuenta borrada) lo puede quitar cualquier admin, y sobrevive al borrado', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_B);
      await crear(db, ADMIN_B, 'Huerfano');
      // ADMIN_A es quien creo la ruta (routes.created_by sin cascade): se borra la cuenta de B.
      await a.comoPostgres(async () => {
        await db.exec(`delete from auth.users where id = '${ADMIN_B}'`);
      });
      await a.como(ADMIN_A);
      assert.deepEqual(await nombresVisibles(db), ['Huerfano']);
      const { affectedRows } = await db.query(`delete from public.catalog_bars where name = 'Huerfano'`);
      assert.equal(affectedRows, 1);
    });
  });
});

describe('0035: lo que el servidor no deja pasar', () => {
  it('el nombre es unico sin distinguir mayusculas ni espacios de los bordes', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await a.como(ADMIN_B);
      await a.falla(() => crear(db, ADMIN_B, '  la cepa '), /catalog_bars_name_key|duplicate/);
    });
  });

  it('nombre vacio o de mas de 60 caracteres', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await a.falla(() => crear(db, ADMIN_A, '   '), /check/);
      await a.falla(() => crear(db, ADMIN_A, 'x'.repeat(61)), /check/);
      await crear(db, ADMIN_A, 'x'.repeat(60));
    });
  });

  it('coordenadas fuera de rango', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await a.falla(() => crear(db, ADMIN_A, 'Norte', LOGO, 91, 0), /check/);
      await a.falla(() => crear(db, ADMIN_A, 'Este', LOGO, 0, 181), /check/);
    });
  });

  it('el logo tiene que ser una imagen y no pasar de 300.000 caracteres', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await a.falla(() => crear(db, ADMIN_A, 'Script', 'javascript:alert(1)'), /check/);
      await a.falla(() => crear(db, ADMIN_A, 'Texto', 'data:text/html;base64,AAAA'), /check/);
      const justo = `data:image/jpeg;base64,${'A'.repeat(300_000 - 'data:image/jpeg;base64,'.length)}`;
      assert.equal(justo.length, 300_000);
      await crear(db, ADMIN_A, 'En el tope', justo);
      await a.falla(() => crear(db, ADMIN_A, 'Pasado', `${justo}A`), /check/);
      await crear(db, ADMIN_A, 'Sin logo', null);
    });
  });
});

describe('0035: el logo viaja con la parada', () => {
  const parada = (logo: string | null) =>
    `insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at, logo)
     values ('${RUTA}', 0, 'La Cepa', 40.48, -3.36, now(), now() + interval '1 hour', ${logo === null ? 'null' : `'${logo}'`})`;

  it('un admin guarda el logo y un jugador de la ruta lo lee (sin tocar catalog_bars)', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await db.exec(parada(LOGO));
      await a.como(JUGADOR);
      const { rows } = await db.query<{ logo: string }>(`select logo from public.route_bars`);
      assert.deepEqual(rows, [{ logo: LOGO }]);
      assert.deepEqual(await nombresVisibles(db), []);
    });
  });

  it('route_bars.logo tiene el mismo formato y el mismo tope', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await a.falla(() => db.exec(parada('http://malo.example/x.png')), /route_bars_logo_valido/);
      const largo = `data:image/jpeg;base64,${'A'.repeat(300_000)}`;
      await a.falla(() => db.exec(parada(largo)), /route_bars_logo_valido/);
      await db.exec(parada(null));
    });
  });

  it('borrar el bar del catalogo no toca la parada ya copiada', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN_A);
      await crear(db, ADMIN_A, 'La Cepa');
      await db.exec(parada(LOGO));
      await db.query(`delete from public.catalog_bars`);
      const { rows } = await db.query<{ logo: string }>(`select logo from public.route_bars`);
      assert.deepEqual(rows, [{ logo: LOGO }]);
    });
  });
});

describe('0035: re-ejecutarla no rompe nada', () => {
  it('pegarla dos veces deja la misma tabla y los mismos permisos', async () => {
    const db = await crearBase([...migraciones, migraciones[migraciones.length - 1] as string]);
    try {
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::text as n from pg_policies where tablename = 'catalog_bars'`,
      );
      assert.equal(rows[0].n, '3');
    } finally {
      await db.close();
    }
  });
});
