import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * 0003 hace el "Nombre de bartalla" unico (sin distinguir mayusculas), sin
 * espacios y de <= 30 caracteres. La parte delicada no es el CHECK ni el
 * indice en si, sino que el ALTA SIGA FUNCIONANDO: handle_new_user (0001)
 * crea el perfil dentro de la MISMA transaccion que auth.users, asi que si dos
 * personas coinciden en el nombre por defecto (mismo prefijo de email, o el
 * mismo nombre puesto a mano en la invitacion) y el INSERT choca con el
 * indice unico, TODA la creacion de la cuenta fallaria. 0003 evita esto
 * anadiendo "-2", "-3"... hasta encontrar un nombre libre.
 *
 * Postgres real via PGlite, igual que 0002: un CHECK o un indice que solo
 * parsea no demuestra que el trigger seguira dando de alta cuentas.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const m0001 = leer('supabase/migrations/0001_init.sql');
const m0002 = leer('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0003 = leer('supabase/migrations/0003_nombre_unico.sql');

// Lo justo de un proyecto Supabase para que 0001 se ejecute entera.
const SUPABASE_MINIMO = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create role authenticator login noinherit;
  create role supabase_auth_admin login noinherit bypassrls;
  grant anon, authenticated, service_role to authenticator;

  create schema auth;
  create schema storage;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/')
  $$;

  grant usage on schema public, auth, storage to anon, authenticated, service_role, supabase_auth_admin;
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role, supabase_auth_admin;
`;

async function crearBase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_MINIMO);
  await db.exec(m0001);
  await db.exec(m0002);
  await db.exec(m0003);
  return db;
}

/** Solo 0001 + 0002: como un proyecto real antes de aplicar la 0003. */
async function crearBaseLegado(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_MINIMO);
  await db.exec(m0001);
  await db.exec(m0002);
  return db;
}

/** Da de alta un usuario como lo haria auth.users, con el trigger real. */
async function altaUsuario(
  db: PGlite,
  email: string,
  displayName?: string,
): Promise<string> {
  const metadata = displayName ? JSON.stringify({ display_name: displayName }) : '{}';
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id::text as id`,
    [email, metadata],
  );
  return rows[0].id;
}

const nombreDe = async (db: PGlite, id: string): Promise<string> => {
  const { rows } = await db.query<{ display_name: string }>(
    `select display_name from public.profiles where id = $1`,
    [id],
  );
  assert.equal(rows.length, 1, `no existe el perfil ${id}: el alta fallo`);
  return rows[0].display_name;
};

const esViolacionUnica = (err: unknown) => {
  assert.ok(err instanceof Error);
  assert.equal((err as { code?: string }).code, '23505');
  return true;
};

describe('0003_nombre_unico.sql: el alta nunca falla por un nombre repetido', () => {
  it('dos emails con el mismo prefijo (dominios distintos) dan de alta a los dos', async () => {
    const db = await crearBase();
    const id1 = await altaUsuario(db, 'marta@gmail.com');
    const id2 = await altaUsuario(db, 'marta@hotmail.com');
    assert.equal(await nombreDe(db, id1), 'marta');
    assert.equal(await nombreDe(db, id2), 'marta-2');
  });

  it('tres colisiones seguidas: -2, -3, -4', async () => {
    const db = await crearBase();
    const ids = await Promise.all(
      ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'].map((email) => altaUsuario(db, email, 'Rutero')),
    );
    const nombres = await Promise.all(ids.map((id) => nombreDe(db, id)));
    assert.deepEqual(nombres, ['Rutero', 'Rutero-2', 'Rutero-3', 'Rutero-4']);
  });

  it('la comparacion no distingue mayusculas: "Marta" choca con "marta"', async () => {
    const db = await crearBase();
    const id1 = await altaUsuario(db, 'uno@x.com', 'Marta');
    const id2 = await altaUsuario(db, 'dos@x.com', 'MARTA');
    assert.equal(await nombreDe(db, id1), 'Marta');
    assert.equal(await nombreDe(db, id2), 'MARTA-2');
  });

  it('quita los espacios del nombre de la invitacion antes de guardarlo', async () => {
    const db = await crearBase();
    const id = await altaUsuario(db, 'uno@x.com', '  Marta  Lopez  ');
    assert.equal(await nombreDe(db, id), 'MartaLopez');
  });

  it('un nombre de invitacion de mas de 30 se recorta, y el sufijo cabe dentro del limite', async () => {
    const db = await crearBase();
    const largo = 'a'.repeat(35);
    const id1 = await altaUsuario(db, 'uno@x.com', largo);
    const id2 = await altaUsuario(db, 'dos@x.com', largo);
    const n1 = await nombreDe(db, id1);
    const n2 = await nombreDe(db, id2);
    assert.equal(n1, 'a'.repeat(30));
    assert.equal(n2, 'a'.repeat(28) + '-2');
    assert.ok(n1.length <= 30 && n2.length <= 30);
  });

  it('sin email ni nombre de invitacion (caso degenerado) cae en "rutero"', async () => {
    const db = await crearBase();
    const id1 = await altaUsuario(db, '@x.com');
    const id2 = await altaUsuario(db, '@x.com');
    assert.equal(await nombreDe(db, id1), 'rutero');
    assert.equal(await nombreDe(db, id2), 'rutero-2');
  });

  it('re-ejecutar la 0003 no rompe nada (idempotente)', async () => {
    const db = await crearBase();
    await db.exec(m0003);
    const id = await altaUsuario(db, 'uno@x.com');
    assert.equal(await nombreDe(db, id), 'uno');
  });
});

describe('0003_nombre_unico.sql: la regla en si, sobre Postgres real', () => {
  it('CHECK: rechaza espacios en un UPDATE directo', async () => {
    const db = await crearBase();
    const id = await altaUsuario(db, 'uno@x.com');
    await assert.rejects(
      db.query(`update public.profiles set display_name = 'con espacio' where id = $1`, [id]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /profiles_display_name_formato/);
        return true;
      },
    );
  });

  it('CHECK: rechaza mas de 30 caracteres', async () => {
    const db = await crearBase();
    const id = await altaUsuario(db, 'uno@x.com');
    await assert.rejects(
      db.query(`update public.profiles set display_name = $1 where id = $2`, ['x'.repeat(31), id]),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /profiles_display_name_formato/);
        return true;
      },
    );
  });

  it('CHECK: 30 caracteres exactos si vale', async () => {
    const db = await crearBase();
    const id = await altaUsuario(db, 'uno@x.com');
    await db.query(`update public.profiles set display_name = $1 where id = $2`, ['x'.repeat(30), id]);
    assert.equal(await nombreDe(db, id), 'x'.repeat(30));
  });

  it('indice unico: un UPDATE a un nombre ya usado por otro choca, sin distinguir mayusculas', async () => {
    const db = await crearBase();
    const id1 = await altaUsuario(db, 'uno@x.com', 'Marta');
    const id2 = await altaUsuario(db, 'dos@x.com', 'Elena');
    await assert.rejects(
      db.query(`update public.profiles set display_name = 'MARTA' where id = $1`, [id2]),
      esViolacionUnica,
    );
    // La fila de Elena no ha cambiado: la sentencia entera se deshace.
    assert.equal(await nombreDe(db, id2), 'Elena');
    assert.equal(await nombreDe(db, id1), 'Marta');
  });

  it('un usuario SI puede quedarse con su propio nombre (no choca consigo mismo)', async () => {
    const db = await crearBase();
    const id = await altaUsuario(db, 'uno@x.com', 'Marta');
    await db.query(`update public.profiles set display_name = 'Marta' where id = $1`, [id]);
    assert.equal(await nombreDe(db, id), 'Marta');
  });
});

describe('0003_nombre_unico.sql: backfill de nombres puestos antes de la regla', () => {
  it('reproduce el caso real ("Il Doctore" con espacio) y lo arregla en el mismo paso', async () => {
    // Sin la 0003 (solo 0001+0002), el trigger original no quita espacios: es
    // exactamente como quedo "Il Doctore" en produccion antes de esta migracion.
    // Aplicar m0003 no debe fallar: su propio backfill lo normaliza primero.
    const db = await crearBaseLegado();
    const id = await altaUsuario(db, 'doctore@x.com', 'Il Doctore');
    await db.exec(m0003);
    assert.equal(await nombreDe(db, id), 'IlDoctore');
  });

  it('dos nombres legado que coinciden al quitarles el espacio: el mas antiguo se queda el limpio', async () => {
    const db = await crearBaseLegado();
    const idViejo = await altaUsuario(db, 'viejo@x.com', 'Il Doctore');
    const idNuevo = await altaUsuario(db, 'nuevo@x.com', 'IL DOCTORE');
    await db.exec(m0003);
    assert.equal(await nombreDe(db, idViejo), 'IlDoctore');
    assert.equal(await nombreDe(db, idNuevo), 'ILDOCTORE-2');
  });

  it('un nombre legado que ya coincide con uno valido existente (que no viola nada) se le arrima detras', async () => {
    // 'ILDOCTORE' nunca ha violado la regla (sin espacios, corto): el backfill
    // no lo toca. 'Il Doctore' si la viola y, al perder el espacio, choca con
    // el que ya estaba, aunque sea la cuenta mas antigua: quien tenia un
    // nombre valido desde el principio no se mueve, cede el hueco quien
    // necesitaba normalizarse.
    const db = await crearBaseLegado();
    const idViejo = await altaUsuario(db, 'viejo@x.com', 'Il Doctore');
    const idNuevo = await altaUsuario(db, 'nuevo@x.com', 'ILDOCTORE');
    await db.exec(m0003);
    assert.equal(await nombreDe(db, idNuevo), 'ILDOCTORE');
    assert.equal(await nombreDe(db, idViejo), 'IlDoctore-2');
  });

  it('un nombre legado de mas de 30 se recorta al aplicar la 0003', async () => {
    const db = await crearBaseLegado();
    const id = await altaUsuario(db, 'largo@x.com', 'a'.repeat(40));
    await db.exec(m0003);
    assert.equal(await nombreDe(db, id), 'a'.repeat(30));
  });
});
