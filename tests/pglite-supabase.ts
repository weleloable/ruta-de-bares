import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Supabase minimo sobre PGlite (Postgres real compilado a wasm) para probar
 * migraciones ejecutandolas de verdad. Es el mismo montaje que usa
 * tests/migration-0002.test.ts, sacado a un modulo para las migraciones
 * siguientes.
 *
 * Cada peticion se simula como la hace PostgREST: conexion como
 * `authenticator`, rol del JWT con SET ROLE local y request.jwt.claims.
 * Lo que NO cubre: que el Supabase real se comporte igual. Eso se comprueba
 * contra el Supabase local (docs/TIRATE-UNA-CANA.md).
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/** En Windows git puede sacar los ficheros con CRLF; los regex cuentan con \n. */
export function leerFichero(ruta: string): string {
  return readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
}

export const SUPABASE_MINIMO = `
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
  create table auth.identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    provider text not null,
    provider_id text not null,
    identity_data jsonb not null default '{}',
    created_at timestamptz default now(),
    last_sign_in_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text,
    created_at timestamptz default now()
  );
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/')
  $$;

  grant usage on schema public, auth, storage to anon, authenticated, service_role, supabase_auth_admin;
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role, supabase_auth_admin;
`;

export async function crearBase(migraciones: string[]): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_MINIMO);
  for (const migracion of migraciones) await db.exec(migracion);
  return db;
}

export type Actor = {
  /** Las siguientes consultas van como peticion de la API con el JWT de `uid`. */
  como(uid: string): Promise<void>;
  /** Peticion con la clave publicable y sin sesion. */
  anonimo(): Promise<void>;
  /** Ejecuta `fn` como postgres (el SQL Editor) y vuelve a la identidad anterior. */
  comoPostgres<T>(fn: () => Promise<T>): Promise<T>;
  /** Espera que `fn` falle con un mensaje que contenga `codigo`, sin abortar la transaccion. */
  falla(fn: () => Promise<unknown>, codigo: string | RegExp): Promise<void>;
};

/**
 * Un escenario completo dentro de una transaccion que se deshace al terminar:
 * todos empiezan de la misma base. Dentro se cambia de usuario solo con los
 * claims, como dos moviles distintos contra la misma API.
 */
export async function escenario(db: PGlite, fn: (actor: Actor) => Promise<void>): Promise<void> {
  const comoApi = async (claims: Record<string, unknown>, rol: string) => {
    await db.exec('set local session authorization authenticator');
    await db.query(`select set_config('role', $1, true)`, [rol]);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  };
  let identidad: () => Promise<void> = async () => {};

  const actor: Actor = {
    async como(uid) {
      identidad = () => comoApi({ role: 'authenticated', sub: uid }, 'authenticated');
      await identidad();
    },
    async anonimo() {
      identidad = () => comoApi({ role: 'anon' }, 'anon');
      await identidad();
    },
    async comoPostgres(fn) {
      await db.exec('set local session authorization postgres');
      await db.query(`select set_config('role', 'none', true)`);
      try {
        return await fn();
      } finally {
        await identidad();
      }
    },
    async falla(fn, codigo) {
      await db.exec('savepoint antes_del_fallo');
      let error: unknown = null;
      try {
        await fn();
      } catch (e) {
        error = e;
      }
      // Un error aborta la transaccion entera; volver al savepoint la deja
      // usable para el resto del escenario.
      await db.exec('rollback to savepoint antes_del_fallo');
      await identidad();
      assert.ok(error instanceof Error, `se esperaba un error ${String(codigo)} y no fallo`);
      assert.match(error.message, codigo instanceof RegExp ? codigo : new RegExp(codigo));
    },
  };

  await db.exec('begin');
  try {
    await fn(actor);
  } finally {
    await db.exec('rollback');
    // Igual que en migration-0002.test.ts: en PGlite un SET SESSION
    // AUTHORIZATION puede sobrevivir al rollback; se fuerza la identidad de
    // vuelta y se comprueba, para que ningun escenario herede la del anterior.
    await db.exec(`
      set session authorization postgres;
      set role none;
      reset request.jwt.claims;
    `);
    const { rows } = await db.query<{ s: string; r: string }>(
      `select session_user::text as s, current_setting('role') as r`,
    );
    assert.deepEqual(rows[0], { s: 'postgres', r: 'none' });
  }
}
