import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * 0004 cambia QUIEN VE QUE: hasta 0003 toda cuenta veia todas las rutas
 * publicadas; a partir de aqui solo ves las rutas de las que eres miembro, y
 * solo se entra canjeando una invitacion.
 *
 * Se prueba contra Postgres real (PGlite) y no parseando el SQL porque lo que
 * hay que demostrar es de comportamiento: que una policy filtra de verdad, que
 * el tope de plazas no se pasa por uno, y que claim_stamp rechaza a un extrano
 * aunque la pantalla nunca se lo hubiera ofrecido.
 *
 * Lo que este fichero NO puede probar: la carrera de dos canjes SIMULTANEOS del
 * mismo enlace. PGlite es de una sola conexion, asi que no hay forma de abrir
 * dos transacciones a la vez. Lo que protege ese caso es el FOR UPDATE de
 * redeem_route_invite; aqui se comprueba el tope en secuencia, que es lo que
 * esta herramienta alcanza. Queda anotado como no verificado, no como probado.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const m0001 = leer('supabase/migrations/0001_init.sql');
const m0002 = leer('supabase/migrations/0002_guard_role_sql_editor.sql');
const m0003 = leer('supabase/migrations/0003_nombre_unico.sql');
const m0004 = leer('supabase/migrations/0004_invitaciones_por_ruta.sql');

// Lo justo de un proyecto Supabase para que las migraciones se ejecuten.
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

/** Proyecto al dia: 0001 + 0002 + 0003 + 0004. */
async function crearBase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_MINIMO);
  await db.exec(m0001);
  await db.exec(m0002);
  await db.exec(m0003);
  await db.exec(m0004);
  return db;
}

/** Proyecto como estaba ANTES de 0004, para probar el backfill. */
async function crearBaseLegado(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_MINIMO);
  await db.exec(m0001);
  await db.exec(m0002);
  await db.exec(m0003);
  return db;
}

/** Alta como la haria auth.users: dispara el trigger real handle_new_user. */
async function altaUsuario(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id::text as id`,
    [email],
  );
  return rows[0].id;
}

const ascender = (db: PGlite, id: string) =>
  db.query(`update public.profiles set role = 'admin' where id = $1`, [id]);

async function crearRuta(
  db: PGlite,
  creador: string,
  opciones: { nombre?: string; publicada?: boolean } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.routes (name, created_by, is_published)
     values ($1, $2, $3) returning id::text as id`,
    [opciones.nombre ?? 'Ruta de prueba', creador, opciones.publicada ?? true],
  );
  return rows[0].id;
}

/**
 * Bar abierto ahora mismo y en el sitio exacto donde luego se sella, para que
 * lo unico que pueda fallar en los tests de claim_stamp sea la membresia.
 */
async function crearBar(db: PGlite, rutaId: string, orden = 0): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.route_bars
       (route_id, sort_order, name, lat, lng, opens_at, closes_at)
     values ($1, $2, $3, 40.4, -3.7, now() - interval '1 hour', now() + interval '1 hour')
     returning id::text as id`,
    [rutaId, orden, `Bar ${orden}`],
  );
  return rows[0].id;
}

/**
 * Corre `fn` con la identidad de un usuario de la API (rol `authenticated` +
 * claims del JWT), que es lo que ven las policies y auth.uid().
 *
 * Sin transaccion a proposito, al contrario que el arnes de 0002: aqui los
 * escenarios encadenan efectos (crear invitacion -> canjear -> volver a leer),
 * y un rollback por escenario los borraria. `sub` a null = sin sesion.
 */
async function comoUsuario<T>(db: PGlite, sub: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    sub === null ? '' : JSON.stringify({ role: 'authenticated', sub }),
  ]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('set role none; reset request.jwt.claims;');
  }
}

type Invitacion = { invite_id: string; invite_token: string; invite_expires_at: Date };

const crearInvitacion = (db: PGlite, rutaId: string, plazas = 10, horas = 4) =>
  db
    .query<Invitacion>(`select * from public.create_route_invite($1, $2, $3)`, [
      rutaId,
      plazas,
      horas,
    ])
    .then((r) => r.rows[0]);

const canjear = (db: PGlite, token: string) =>
  db.query<{ route_id: string }>(`select public.redeem_route_invite($1)::text as route_id`, [token]);

const rutasVisibles = (db: PGlite) =>
  db.query<{ id: string }>(`select id::text as id from public.routes order by name`);

const sellar = (db: PGlite, barId: string) =>
  db.query(`select public.claim_stamp($1, 40.4, -3.7)`, [barId]);

// ---------------------------------------------------------------------------

describe('0004: solo se ven las rutas de las que eres miembro', () => {
  it('un usuario normal NO ve una ruta publicada si nadie le invito', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const extrano = await altaUsuario(db, 'extrano@x.com');
    await crearRuta(db, admin);

    const { rows } = await comoUsuario(db, extrano, () => rutasVisibles(db));
    assert.deepEqual(rows, [], 'un extrano esta viendo una ruta a la que no pertenece');
  });

  it('la ve en cuanto es miembro', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const invitado = await altaUsuario(db, 'invitado@x.com');
    const ruta = await crearRuta(db, admin);

    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    await comoUsuario(db, invitado, () => canjear(db, invitacion.invite_token));

    const { rows } = await comoUsuario(db, invitado, () => rutasVisibles(db));
    assert.deepEqual(rows.map((r) => r.id), [ruta]);
  });

  it('el admin las ve todas sin ser miembro de ninguna', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    await crearRuta(db, admin, { nombre: 'A' });
    await crearRuta(db, admin, { nombre: 'B', publicada: false });

    const { rows } = await comoUsuario(db, admin, () => rutasVisibles(db));
    assert.equal(rows.length, 2);
  });

  it('ser miembro no basta si la ruta no esta publicada', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const invitado = await altaUsuario(db, 'invitado@x.com');
    const ruta = await crearRuta(db, admin, { publicada: false });

    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    await comoUsuario(db, invitado, () => canjear(db, invitacion.invite_token));

    const { rows } = await comoUsuario(db, invitado, () => rutasVisibles(db));
    assert.deepEqual(rows, [], 'se ve una ruta en borrador');
  });

  it('los bares siguen la misma regla que su ruta', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const invitado = await altaUsuario(db, 'invitado@x.com');
    const extrano = await altaUsuario(db, 'extrano@x.com');
    const ruta = await crearRuta(db, admin);
    await crearBar(db, ruta);

    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    await comoUsuario(db, invitado, () => canjear(db, invitacion.invite_token));

    const bares = (id: string) =>
      comoUsuario(db, id, () => db.query(`select id from public.route_bars`)).then(
        (r) => r.rows.length,
      );

    assert.equal(await bares(invitado), 1, 'un miembro no ve los bares de su ruta');
    assert.equal(await bares(extrano), 0, 'un extrano ve los bares de una ruta ajena');
  });
});

describe('0004: crear una invitacion', () => {
  it('un admin la crea y el token queda guardado en claro, para poder repescarlo', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);

    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta, 20, 8));
    assert.match(invitacion.invite_token, /^[A-Za-z0-9_-]{43}$/);

    const { rows } = await db.query<{ token: string; max_uses: number }>(
      `select token, max_uses from public.route_invites where id = $1`,
      [invitacion.invite_id],
    );
    assert.equal(rows[0].max_uses, 20);
    assert.equal(
      rows[0].token,
      invitacion.invite_token,
      'el historial no podra reconstruir el enlace si lo guardado no es el token',
    );
  });

  it('dos invitaciones no comparten token', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);

    const una = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    const otra = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    assert.notEqual(una.invite_token, otra.invite_token);
  });

  it('el CHECK rechaza un token con una forma que link.ts no sabria leer', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);

    await assert.rejects(
      () =>
        db.query(
          `insert into public.route_invites (route_id, token, max_uses, created_by, expires_at)
           values ($1, 'corto', 10, $2, now() + interval '1 hour')`,
          [ruta, admin],
        ),
      /route_invites_token_check|violates check/i,
    );
  });

  it('caduca a las horas pedidas', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);

    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta, 10, 2));
    const horas = (new Date(invitacion.invite_expires_at).getTime() - Date.now()) / 3_600_000;
    assert.ok(horas > 1.9 && horas < 2.1, `caduca en ${horas} horas, se pidieron 2`);
  });

  it('un usuario normal NO puede crear invitaciones', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const normal = await altaUsuario(db, 'normal@x.com');
    const ruta = await crearRuta(db, admin);

    await assert.rejects(
      () => comoUsuario(db, normal, () => crearInvitacion(db, ruta)),
      /FORBIDDEN/,
    );
  });

  it('rechaza una caducidad absurda y una ruta que no existe', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);

    await assert.rejects(
      () => comoUsuario(db, admin, () => crearInvitacion(db, ruta, 10, 0)),
      /BAD_EXPIRY/,
    );
    await assert.rejects(
      () => comoUsuario(db, admin, () => crearInvitacion(db, ruta, 10, 999)),
      /BAD_EXPIRY/,
    );
    await assert.rejects(
      () =>
        comoUsuario(db, admin, () =>
          crearInvitacion(db, '00000000-0000-0000-0000-000000000000'),
        ),
      /ROUTE_NOT_FOUND/,
    );
  });

  it('rechaza un tope de plazas fuera del CHECK', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);

    await assert.rejects(() => comoUsuario(db, admin, () => crearInvitacion(db, ruta, 0)));
    await assert.rejects(() => comoUsuario(db, admin, () => crearInvitacion(db, ruta, 501)));
  });
});

describe('0004: canjear una invitacion', () => {
  it('el mismo enlace sirve para varias personas (multiuso)', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta, 3));

    for (const email of ['a@x.com', 'b@x.com', 'c@x.com']) {
      const id = await altaUsuario(db, email);
      await comoUsuario(db, id, () => canjear(db, invitacion.invite_token));
    }

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.route_members where route_id = $1`,
      [ruta],
    );
    assert.equal(rows[0].n, 3);
  });

  it('la plaza que pasa del tope se rechaza', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta, 2));

    for (const email of ['a@x.com', 'b@x.com']) {
      const id = await altaUsuario(db, email);
      await comoUsuario(db, id, () => canjear(db, invitacion.invite_token));
    }

    const tercero = await altaUsuario(db, 'c@x.com');
    await assert.rejects(
      () => comoUsuario(db, tercero, () => canjear(db, invitacion.invite_token)),
      /INVITE_FULL/,
    );
  });

  it('canjear dos veces no gasta dos plazas', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta, 1));

    const uno = await altaUsuario(db, 'uno@x.com');
    await comoUsuario(db, uno, () => canjear(db, invitacion.invite_token));
    await comoUsuario(db, uno, () => canjear(db, invitacion.invite_token));

    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.route_members where invite_id = $1`,
      [invitacion.invite_id],
    );
    assert.equal(rows[0].n, 1, 'el segundo canje del mismo usuario gasto otra plaza');
  });

  it('un token que no existe no dice por que (no es un oraculo)', async () => {
    const db = await crearBase();
    const alguien = await altaUsuario(db, 'alguien@x.com');
    await assert.rejects(
      () => comoUsuario(db, alguien, () => canjear(db, 'a'.repeat(43))),
      /INVITE_UNUSABLE/,
    );
  });

  it('sin sesion no se canjea', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));

    await assert.rejects(
      () => comoUsuario(db, null, () => canjear(db, invitacion.invite_token)),
      /NOT_AUTHENTICATED/,
    );
  });

  it('una invitacion caducada ya no sirve', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));

    await db.query(`update public.route_invites set expires_at = now() - interval '1 minute' where id = $1`, [
      invitacion.invite_id,
    ]);

    const tarde = await altaUsuario(db, 'tarde@x.com');
    await assert.rejects(
      () => comoUsuario(db, tarde, () => canjear(db, invitacion.invite_token)),
      /INVITE_UNUSABLE/,
    );
  });

  it('una invitacion anulada ya no sirve', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));

    await comoUsuario(db, admin, () =>
      db.query(`update public.route_invites set revoked_at = now() where id = $1`, [
        invitacion.invite_id,
      ]),
    );

    const tarde = await altaUsuario(db, 'tarde@x.com');
    await assert.rejects(
      () => comoUsuario(db, tarde, () => canjear(db, invitacion.invite_token)),
      /INVITE_UNUSABLE/,
    );
  });

  it('anular no echa a quien ya habia entrado', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));

    const dentro = await altaUsuario(db, 'dentro@x.com');
    await comoUsuario(db, dentro, () => canjear(db, invitacion.invite_token));
    await db.query(`update public.route_invites set revoked_at = now() where id = $1`, [
      invitacion.invite_id,
    ]);

    const { rows } = await comoUsuario(db, dentro, () => rutasVisibles(db));
    assert.deepEqual(rows.map((r) => r.id), [ruta], 'anular el enlace ha echado a un miembro');
  });

  it('quien ya es miembro sobrevive a que el enlace caduque', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));

    const dentro = await altaUsuario(db, 'dentro@x.com');
    await comoUsuario(db, dentro, () => canjear(db, invitacion.invite_token));
    await db.query(`update public.route_invites set expires_at = now() - interval '1 day' where id = $1`, [
      invitacion.invite_id,
    ]);

    // Vuelve a abrir el enlace muerto: no falla, ya estaba dentro.
    const { rows } = await comoUsuario(db, dentro, () => canjear(db, invitacion.invite_token));
    assert.equal(rows[0].route_id, ruta);
  });
});

describe('0004: sellar exige membresia (el servidor manda)', () => {
  it('un extrano NO puede sellar aunque este en el sitio y en hora', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const extrano = await altaUsuario(db, 'extrano@x.com');
    const ruta = await crearRuta(db, admin);
    const bar = await crearBar(db, ruta);

    await assert.rejects(() => comoUsuario(db, extrano, () => sellar(db, bar)), /NOT_A_MEMBER/);
  });

  it('un miembro si puede', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const invitado = await altaUsuario(db, 'invitado@x.com');
    const ruta = await crearRuta(db, admin);
    const bar = await crearBar(db, ruta);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    await comoUsuario(db, invitado, () => canjear(db, invitacion.invite_token));

    await comoUsuario(db, invitado, () => sellar(db, bar));
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.stamps where user_id = $1`,
      [invitado],
    );
    assert.equal(rows[0].n, 1);
  });

  it('un admin puede sellar sin ser miembro', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const bar = await crearBar(db, ruta);

    await comoUsuario(db, admin, () => sellar(db, bar));
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.stamps where user_id = $1`,
      [admin],
    );
    assert.equal(rows[0].n, 1);
  });
});

describe('0004: route_members solo se escribe por la funcion', () => {
  it('un usuario no puede apuntarse a si mismo a una ruta', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const listo = await altaUsuario(db, 'listo@x.com');
    const ruta = await crearRuta(db, admin);

    await assert.rejects(() =>
      comoUsuario(db, listo, () =>
        db.query(`insert into public.route_members (route_id, user_id) values ($1, $2)`, [
          ruta,
          listo,
        ]),
      ),
    );
  });

  it('un usuario no ve a que rutas pertenecen los demas', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const uno = await altaUsuario(db, 'uno@x.com');
    const dos = await altaUsuario(db, 'dos@x.com');
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    await comoUsuario(db, uno, () => canjear(db, invitacion.invite_token));
    await comoUsuario(db, dos, () => canjear(db, invitacion.invite_token));

    const { rows } = await comoUsuario(db, uno, () =>
      db.query<{ user_id: string }>(`select user_id::text as user_id from public.route_members`),
    );
    assert.deepEqual(rows.map((r) => r.user_id), [uno]);
  });

  // CRITICO: desde que el token se guarda en claro, esta policy es lo UNICO que
  // impide que cualquiera con cuenta se lea los enlaces vivos y se cuele en
  // todas las rutas. Antes era una capa mas; ahora es la barrera.
  // El historial cuenta "3 de 20 plazas" contando filas de route_members. Si la
  // policy no dejara al admin ver las de los demas, ese numero seria siempre 0
  // y nadie lo notaria hasta que un enlace se llenase sin avisar.
  it('un admin SI ve las pertenencias de todos: de ahi salen las plazas del historial', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta, 10));

    for (const email of ['a@x.com', 'b@x.com']) {
      const id = await altaUsuario(db, email);
      await comoUsuario(db, id, () => canjear(db, invitacion.invite_token));
    }

    const { rows } = await comoUsuario(db, admin, () =>
      db.query<{ invite_id: string | null }>(`select invite_id::text from public.route_members`),
    );
    assert.equal(rows.length, 2, 'el admin no ve las plazas gastadas: el historial diria 0');
    assert.ok(rows.every((r) => r.invite_id === invitacion.invite_id));
  });

  it('un usuario normal no lee NADA de route_invites: es lo unico que protege los tokens', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const normal = await altaUsuario(db, 'normal@x.com');
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));

    const { rows } = await comoUsuario(db, normal, () =>
      db.query(`select * from public.route_invites`),
    );
    assert.deepEqual(rows, [], 'un usuario normal esta viendo invitaciones');

    // Y tampoco por la puerta de atras: preguntando por el token que ya conoce.
    const { rows: apuntando } = await comoUsuario(db, normal, () =>
      db.query(`select token from public.route_invites where token = $1`, [
        invitacion.invite_token,
      ]),
    );
    assert.deepEqual(apuntando, [], 'la policy deja leer una fila si se acierta el token');
  });

  it('un usuario normal tampoco puede anular una invitacion ajena', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const normal = await altaUsuario(db, 'normal@x.com');
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));

    await comoUsuario(db, normal, () =>
      db.query(`update public.route_invites set revoked_at = now() where id = $1`, [
        invitacion.invite_id,
      ]),
    );

    const { rows } = await db.query<{ revoked_at: Date | null }>(
      `select revoked_at from public.route_invites where id = $1`,
      [invitacion.invite_id],
    );
    assert.equal(rows[0].revoked_at, null, 'un usuario normal ha anulado una invitacion');
  });
});

/**
 * Red rapida y PARCIAL, del estilo de tests/encuadre-cableado.test.ts: lee el
 * SQL en vez de ejecutarlo.
 *
 * Existe porque lo que protege el tope de plazas contra dos canjes SIMULTANEOS
 * es el FOR UPDATE, y eso no se puede ejecutar aqui: PGlite tiene una sola
 * conexion y no abre dos transacciones a la vez. Leer el codigo no demuestra el
 * comportamiento, pero si caza el unico modo de fallo realista: que alguien
 * borre esa linea en un refactor y nadie se entere hasta que un enlace admita
 * una persona de mas en una noche con todo el grupo pulsando a la vez.
 */
describe('0004: el cerrojo del tope sigue puesto (lectura del SQL, no ejecucion)', () => {
  const sql = m0004.replace(/--.*$/gm, '');
  const redeem = /create or replace function public\.redeem_route_invite[\s\S]*?\n\$\$;/.exec(sql);

  it('redeem_route_invite existe y se puede aislar', () => {
    assert.ok(redeem, 'no se encuentra redeem_route_invite');
  });

  it('el select de la invitacion lleva FOR UPDATE', () => {
    assert.match(
      redeem![0],
      /select\s+\*\s+into\s+v_inv[\s\S]*?for update\s*;/i,
      'sin FOR UPDATE dos canjes simultaneos leen el mismo recuento y se pasan del tope',
    );
  });

  it('el recuento de plazas se hace DESPUES de bloquear, no antes', () => {
    const posicionBloqueo = redeem![0].search(/for update\s*;/i);
    const posicionRecuento = redeem![0].search(/select\s+count\(\*\)\s+into\s+v_usos/i);
    assert.ok(posicionBloqueo > 0 && posicionRecuento > 0);
    assert.ok(
      posicionBloqueo < posicionRecuento,
      'contar antes de bloquear deja la carrera abierta igual que no bloquear',
    );
  });

  it('claim_stamp sigue exigiendo membresia', () => {
    const claim = /create or replace function public\.claim_stamp[\s\S]*?\n\$\$;/.exec(sql);
    assert.ok(claim, 'no se encuentra claim_stamp en la 0004');
    assert.match(claim[0], /NOT_A_MEMBER/);
  });
});

describe('0004: el paso desde un proyecto que ya estaba en marcha', () => {
  it('quien ya tenia un sello entra como miembro al aplicar la migracion', async () => {
    const db = await crearBaseLegado();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const veterano = await altaUsuario(db, 'veterano@x.com');
    const ruta = await crearRuta(db, admin);
    const bar = await crearBar(db, ruta);

    // Sello puesto con las reglas viejas, cuando no hacia falta invitacion.
    await db.query(
      `insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m)
       values ($1, $2, 40.4, -3.7, 0)`,
      [veterano, bar],
    );

    await db.exec(m0004);

    const { rows } = await comoUsuario(db, veterano, () => rutasVisibles(db));
    assert.deepEqual(
      rows.map((r) => r.id),
      [ruta],
      'un usuario con sellos se ha quedado sin ver su ruta tras la migracion',
    );
  });

  it('la tabla invites de 0001 desaparece', async () => {
    const db = await crearBase();
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = 'invites'`,
    );
    assert.equal(rows[0].n, 0);
  });

  it('re-ejecutar la 0004 no rompe nada (idempotente)', async () => {
    const db = await crearBase();
    const admin = await altaUsuario(db, 'admin@x.com');
    await ascender(db, admin);
    const invitado = await altaUsuario(db, 'invitado@x.com');
    const ruta = await crearRuta(db, admin);
    const invitacion = await comoUsuario(db, admin, () => crearInvitacion(db, ruta));
    await comoUsuario(db, invitado, () => canjear(db, invitacion.invite_token));

    await db.exec(m0004);

    const { rows } = await comoUsuario(db, invitado, () => rutasVisibles(db));
    assert.deepEqual(rows.map((r) => r.id), [ruta], 're-ejecutar la migracion echo a un miembro');
  });
});
