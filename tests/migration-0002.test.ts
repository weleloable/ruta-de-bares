import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import init from 'pg-query-emscripten';

/**
 * 0002 decide quien puede cambiar `profiles.role`, o sea quien puede hacerse
 * admin. Un fallo aqui es escalada de privilegios, asi que no basta con que el
 * SQL parsee: se ejecuta de verdad.
 *
 * PGlite es Postgres real compilado a wasm (plpgsql, roles, RLS, SET ROLE,
 * SET SESSION AUTHORIZATION). Encima se monta lo minimo de Supabase que tocan
 * las migraciones (esquemas auth y storage, auth.uid() y los roles de la API),
 * y cada peticion se simula como la hace PostgREST: conexion como
 * `authenticator`, SET ROLE local al rol del JWT y request.jwt.claims.
 *
 * Lo que este test NO puede cubrir: que el SQL Editor del panel de Supabase y
 * PostgREST sigan comportandose asi en el proyecto real. Eso lo afirman las
 * docs citadas en la migracion, y el punto 1 de la lista de verificacion de
 * docs/SETUP.md lo comprueba de punta a punta.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
// En Windows git puede sacar los ficheros con CRLF; los regex de abajo cuentan
// con \n.
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const m0001 = leer('supabase/migrations/0001_init.sql');
const m0002 = leer('supabase/migrations/0002_guard_role_sql_editor.sql');
const setup = leer('docs/SETUP.md');

const NORMAL = '00000000-0000-4000-8000-000000000001';
const ADMIN = '00000000-0000-4000-8000-000000000002';
const OTRO = '00000000-0000-4000-8000-000000000003';

// Lo justo de un proyecto Supabase para que 0001 se ejecute entera. auth.uid()
// es la definicion actual de Supabase (lee request.jwt.claims).
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

async function crearBase(migraciones: string[]): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_MINIMO);
  for (const migracion of migraciones) await db.exec(migracion);
  // handle_new_user crea las tres filas de profiles con rol 'user'.
  await db.exec(`
    insert into auth.users (id, email) values
      ('${NORMAL}', 'normal@example.com'),
      ('${ADMIN}', 'admin@example.com'),
      ('${OTRO}', 'otro@example.com');
  `);
  return db;
}

type Sesion = {
  /** Usuario con el que se abrio la conexion. Sin el, `postgres` (el SQL Editor). */
  sessionUser?: string;
  /** SET ROLE local, como hace PostgREST con el rol del JWT. */
  rol?: string;
  claims?: Record<string, unknown>;
};

const SQL_EDITOR: Sesion = {};
const api = (rol: string, sub?: string): Sesion => ({
  sessionUser: 'authenticator',
  rol,
  claims: sub ? { role: rol, sub } : { role: rol },
});

/**
 * Ejecuta `fn` dentro de una transaccion con la identidad de `sesion` y la
 * deshace al terminar: cada escenario empieza de la misma base, y SET SESSION
 * AUTHORIZATION tambien se revierte con el rollback.
 * `preparar` corre antes como postgres, para montar trampas (policies de mas,
 * funciones RPC) que solo existen en ese escenario.
 */
async function enSesion<T>(
  db: PGlite,
  sesion: Sesion,
  fn: () => Promise<T>,
  preparar?: string,
): Promise<T> {
  await db.exec('begin');
  try {
    if (preparar) await db.exec(preparar);
    if (sesion.sessionUser) await db.exec(`set local session authorization ${sesion.sessionUser}`);
    if (sesion.rol) await db.query(`select set_config('role', $1, true)`, [sesion.rol]);
    if (sesion.claims) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(sesion.claims),
      ]);
    }
    return await fn();
  } finally {
    await db.exec('rollback');
    // Rareza de PGlite (comprobada, no supuesta): un SET SESSION AUTHORIZATION
    // sin LOCAL sobrevive al rollback, y ni RESET ni DEFAULT lo deshacen; solo
    // un SET explicito a postgres. Por eso arriba se usa SET LOCAL y aqui se
    // fuerza la identidad de vuelta y se comprueba: ningun escenario hereda la
    // del anterior, y un fallo del arnes no se disfraza de fallo de 0002.
    await db.exec(`
      set session authorization postgres;
      set role none;
      reset request.jwt.claims;
    `);
    const { rows } = await db.query<{ s: string; c: string; r: string; claims: string | null }>(
      `select session_user::text as s, current_user::text as c,
              current_setting('role') as r,
              nullif(current_setting('request.jwt.claims', true), '') as claims`,
    );
    assert.deepEqual(rows[0], { s: 'postgres', c: 'postgres', r: 'none', claims: null });
  }
}

const ascender = (db: PGlite, id: string) =>
  db.query(`update public.profiles set role = 'admin' where id = $1`, [id]);

type Perfil = { role: string; updated_at: Date };
const leerPerfil = async (db: PGlite, id: string): Promise<Perfil> => {
  const { rows } = await db.query<Perfil>(
    `select role::text as role, updated_at from public.profiles where id = $1`,
    [id],
  );
  assert.equal(rows.length, 1, `no se ve el perfil ${id}`);
  return rows[0];
};

function esProhibido(err: unknown): true {
  assert.ok(err instanceof Error, `no es un Error: ${String(err)}`);
  assert.match(err.message, /ROLE_CHANGE_FORBIDDEN/);
  assert.equal((err as { code?: string }).code, '42501');
  return true;
}

/** Bloques ```sql de la seccion 3 de SETUP.md, tal cual los copiaria el duenio. */
function bloquesSqlSeccion3(): string[] {
  const seccion = /## 3\.[\s\S]*?(?=\n## 4\.)/.exec(setup);
  assert.ok(seccion, 'SETUP.md sin seccion 3');
  return [...seccion[0].matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
}

function updateDeLaDoc(email: string): string {
  const bloque = bloquesSqlSeccion3().find((b) => /set role = 'admin'/.test(b) && !/begin;/.test(b));
  assert.ok(bloque, 'SETUP.md ya no trae el update simple para ascender');
  return bloque.replaceAll('tu@correo.com', email);
}

async function triggerActivo(db: PGlite): Promise<{ enabled: string; funcion: string }> {
  const { rows } = await db.query<{ enabled: string; funcion: string }>(`
    select t.tgenabled as enabled, t.tgfoid::regproc::text as funcion
      from pg_trigger t
     where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'on_profile_update'
  `);
  assert.equal(rows.length, 1, 'el trigger on_profile_update ha desaparecido');
  return rows[0];
}

describe('0002_guard_role_sql_editor.sql: forma', async () => {
  const pg = await init();
  const sinComentarios = m0002.replace(/--.*$/gm, '');

  it('parsea y solo contiene la funcion: no borra ni apaga el trigger', () => {
    const resultado = pg.parse(m0002);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const stmts = resultado.parse_tree?.stmts ?? [];
    assert.equal(stmts.length, 1, 'la 0002 debe ser una sola sentencia');
    const stmt = JSON.stringify(stmts[0]);
    assert.match(stmt, /"CreateFunctionStmt"/);
    assert.match(stmt, /"replace":true/, 'sin OR REPLACE la 0002 no es re-ejecutable');
    assert.match(stmt, /"guard_profile_role"/);
    assert.match(stmt, /"defname":"security","arg":\{"Boolean":\{"boolval":true\}\}/, 'sin security definer');
    assert.match(stmt, /"name":"search_path"/, 'sin set search_path');
  });

  it('el cuerpo plpgsql compila', () => {
    const resultado = pg.parsePlpgsql(m0002);
    assert.ok(!resultado.error, `error en plpgsql: ${JSON.stringify(resultado.error)}`);
    assert.equal(resultado.plpgsql_funcs?.length, 1);
  });

  it('conserva la guarda y la via de admin, y anade la de backend', () => {
    assert.match(sinComentarios, /raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501'/);
    assert.match(sinComentarios, /not public\.is_admin\(\)/);
    assert.match(sinComentarios, /current_setting\('role'\)/);
    assert.match(sinComentarios, /= 'service_role'/);
    assert.match(sinComentarios, /session_user in \('postgres', 'supabase_admin'\)/);
    assert.match(sinComentarios, /auth\.uid\(\) is null/);
    assert.match(sinComentarios, /new\.updated_at := now\(\)/);
  });

  it('no confia en request.jwt.claims, que cualquiera escribe con set_config', () => {
    assert.ok(!/request\.jwt/.test(sinComentarios), 'la guarda lee request.jwt.*');
  });
});

describe('guard_profile_role con 0001 + 0002 sobre Postgres real', async () => {
  const db = await crearBase([m0001, m0002]);
  // El admin de los escenarios se crea como lo haria el duenio: con el update
  // de la doc en el SQL Editor. Si esto falla, el bug ha vuelto.
  await db.exec(updateDeLaDoc('admin@example.com'));

  it('el SQL Editor asciende con el update de SETUP.md y updated_at sube', async () => {
    await enSesion(db, SQL_EDITOR, async () => {
      const antes = await leerPerfil(db, NORMAL);
      const res = await db.query(updateDeLaDoc('normal@example.com'));
      assert.equal(res.affectedRows, 1);
      const despues = await leerPerfil(db, NORMAL);
      assert.equal(despues.role, 'admin');
      assert.ok(despues.updated_at > antes.updated_at, 'updated_at no se ha tocado');
    });
  });

  it('el SQL Editor tambien degrada (role = user)', async () => {
    await enSesion(db, SQL_EDITOR, async () => {
      await db.query(`update public.profiles set role = 'user' where id = $1`, [ADMIN]);
      assert.equal((await leerPerfil(db, ADMIN)).role, 'user');
    });
  });

  it('service_role por la API asciende y updated_at sube', async () => {
    await enSesion(db, api('service_role'), async () => {
      const antes = await leerPerfil(db, NORMAL);
      assert.equal((await ascender(db, NORMAL)).affectedRows, 1);
      const despues = await leerPerfil(db, NORMAL);
      assert.equal(despues.role, 'admin');
      assert.ok(despues.updated_at > antes.updated_at);
    });
  });

  it('un admin por la API sigue pudiendo ascender a otro', async () => {
    await enSesion(db, api('authenticated', ADMIN), async () => {
      assert.equal((await ascender(db, OTRO)).affectedRows, 1);
      assert.equal((await leerPerfil(db, OTRO)).role, 'admin');
    });
  });

  it('un usuario normal NO se asciende editando su propia fila', async () => {
    await assert.rejects(enSesion(db, api('authenticated', NORMAL), () => ascender(db, NORMAL)), esProhibido);
  });

  it('un usuario normal sigue pudiendo editar su nombre, y updated_at sube', async () => {
    await enSesion(db, api('authenticated', NORMAL), async () => {
      const antes = await leerPerfil(db, NORMAL);
      await db.query(`update public.profiles set display_name = 'Nuevo' where id = $1`, [NORMAL]);
      const despues = await leerPerfil(db, NORMAL);
      assert.equal(despues.role, 'user');
      assert.ok(despues.updated_at > antes.updated_at);
    });
  });

  it('un usuario normal NO se asciende falsificando role: service_role en los claims', async () => {
    const falso: Sesion = {
      sessionUser: 'authenticator',
      rol: 'authenticated',
      claims: { role: 'service_role', sub: NORMAL },
    };
    await assert.rejects(enSesion(db, falso, () => ascender(db, NORMAL)), esProhibido);
  });

  it('un usuario normal NO se asciende a traves de una RPC SECURITY DEFINER', async () => {
    // Una RPC futura que actualice profiles corre como su duenio (postgres),
    // pero session_user y el rol de la peticion siguen siendo los del usuario.
    const rpc = `
      create function public.rpc_trampa() returns void
      language sql security definer set search_path = public as $$
        update public.profiles set role = 'admin' where id = auth.uid();
      $$;
      grant execute on function public.rpc_trampa() to authenticated;
    `;
    await assert.rejects(
      enSesion(db, api('authenticated', NORMAL), () => db.query('select public.rpc_trampa()'), rpc),
      esProhibido,
    );
  });

  it('una RPC no puede fabricar el rol service_role: Postgres lo prohibe en SECURITY DEFINER', async () => {
    const rpc = `
      create function public.rpc_set_role() returns void
      language plpgsql security definer set search_path = public as $$
      begin
        perform set_config('role', 'service_role', true);
        update public.profiles set role = 'admin' where id = auth.uid();
      end;
      $$;
      grant execute on function public.rpc_set_role() to authenticated;
    `;
    await assert.rejects(
      enSesion(db, api('authenticated', NORMAL), () => db.query('select public.rpc_set_role()'), rpc),
      /cannot set parameter "role" within security-definer function/,
    );
  });

  it('anon no toca ninguna fila de profiles (sin policy para anon)', async () => {
    const res = await enSesion(db, api('anon'), () => ascender(db, NORMAL));
    assert.equal(res.affectedRows, 0);
  });

  it('anon tampoco asciende aunque alguien anada por error una policy abierta', async () => {
    // `for all` y no `for update`: un UPDATE con WHERE necesita ver la fila, y
    // anon no tiene policy de SELECT en profiles. Con solo `for update` el
    // UPDATE afecta 0 filas, el trigger ni se ejecuta y el test no probaba lo
    // que dice. Asi la fila es visible y la ultima barrera es la guarda.
    const policy = `create policy trampa on public.profiles for all to anon using (true) with check (true);`;
    await assert.rejects(enSesion(db, api('anon'), () => ascender(db, NORMAL), policy), esProhibido);
  });

  it('el SQL Editor suplantando a un usuario normal se comporta como la app', async () => {
    const suplantando: Sesion = { rol: 'authenticated', claims: { role: 'authenticated', sub: NORMAL } };
    await assert.rejects(enSesion(db, suplantando, () => ascender(db, NORMAL)), esProhibido);
  });

  it('una conexion postgres sin SET ROLE pero con el sub de un usuario normal no asciende', async () => {
    const conSub: Sesion = { claims: { sub: NORMAL } };
    await assert.rejects(enSesion(db, conSub, () => ascender(db, NORMAL)), esProhibido);
  });

  it('otro usuario interno de Supabase (supabase_auth_admin) no asciende', async () => {
    await assert.rejects(
      enSesion(db, { sessionUser: 'supabase_auth_admin' }, () => ascender(db, NORMAL)),
      esProhibido,
    );
  });

  it('el trigger sigue activo y apuntando a guard_profile_role, y 0002 se re-ejecuta', async () => {
    await db.exec(m0002);
    const trigger = await triggerActivo(db);
    assert.equal(trigger.enabled, 'O');
    assert.equal(trigger.funcion, 'guard_profile_role');
    await assert.rejects(enSesion(db, api('authenticated', NORMAL), () => ascender(db, NORMAL)), esProhibido);
  });
});

describe('proyecto con solo la 0001 (el bug y el apano de SETUP.md)', async () => {
  const db = await crearBase([m0001]);

  it('reproduce el bug: el update de la doc falla sin la 0002', async () => {
    await assert.rejects(enSesion(db, SQL_EDITOR, () => db.query(updateDeLaDoc('normal@example.com'))), esProhibido);
  });

  it('el bloque transaccional de la doc crea el perfil que falta, asciende y deja el trigger encendido', async () => {
    // Cuenta creada antes de la 0001: existe en auth.users pero no en profiles.
    await db.exec(`
      alter table auth.users disable trigger on_auth_user_created;
      insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000009', 'previo@example.com');
      alter table auth.users enable trigger on_auth_user_created;
    `);
    const bloque = bloquesSqlSeccion3().find((b) => /begin;/.test(b));
    assert.ok(bloque, 'SETUP.md ya no trae el bloque transaccional');
    await db.exec(bloque.replaceAll('tu@correo.com', 'previo@example.com'));

    assert.equal((await leerPerfil(db, '00000000-0000-4000-8000-000000000009')).role, 'admin');
    assert.equal((await triggerActivo(db)).enabled, 'O', 'el apano ha dejado el trigger apagado');
    await assert.rejects(enSesion(db, api('authenticated', NORMAL), () => ascender(db, NORMAL)), esProhibido);
  });
});
