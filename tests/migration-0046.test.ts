import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0046: QR social.
 *
 *  1. el QR caduca y se renueva: una captura vieja no vale;
 *  2. misma casa, misma ruta, no a uno mismo, una vez por pareja;
 *  3. tope de encuentros que puntuan por persona;
 *  4. solo durante la ruta (quien administra, siempre);
 *  5. nadie lee los codigos ni apunta encuentros por su cuenta.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0046_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA = '00000000-0000-4000-8000-0000000000f2';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CASA: Record<number, string> = { 1: 'mahou', 2: 'mahou', 3: 'mahou', 4: 'cruzcampo', 5: 'mahou', 6: 'mahou' };

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date),
    ('${OTRA}', 'Otra ruta', true, '${ADMIN}', current_date);
  insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${OTRA}', 0, 'Uno', 40.48, -3.36, now() + interval '3 days', now() + interval '3 days 5 hours');
  ${[1, 2, 3, 4, 5, 6]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              insert into public.user_houses (user_id, house) values ('${uid(n)}', '${CASA[n]}');
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');
              insert into public.route_members (route_id, user_id) values ('${OTRA}', '${uid(n)}');`,
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

type Codigo = { codigo: string; caduca: string; ultimo: { con: string; puntos: number } | null };
const miCodigo = async (db: PGlite, a: Actor, n: number) => {
  await a.como(uid(n));
  return (await db.query<{ r: Codigo }>('select public.qr_mi_codigo() as r')).rows[0]!.r;
};

type Escaneo = { puntos: number; puntua: boolean; casa: string };
const escanear = async (db: PGlite, a: Actor, quien: number, codigo: string, ruta = RUTA) => {
  await a.como(quien === 0 ? ADMIN : uid(quien));
  return (await db.query<{ r: Escaneo }>('select public.qr_escanear($1, $2) as r', [ruta, codigo])).rows[0]!.r;
};

/** Escanea el QR de `b` desde `a`. */
const encuentro = async (db: PGlite, a: Actor, quien: number, de: number) =>
  escanear(db, a, quien, (await miCodigo(db, a, de)).codigo);

const puntosQr = (db: PGlite, a: Actor) =>
  a.comoPostgres(async () => {
    const { rows } = await db.query<{ p: number }>(
      `select coalesce(sum(points), 0)::int as p from public.point_movements where action = 'qr' and annulled_at is null`,
    );
    return rows[0]?.p ?? 0;
  });

describe('0046: QR social', () => {
  it('el codigo se mantiene mientras le quede tiempo y luego cambia', async () => {
    await conBase(async (db, a) => {
      const primero = await miCodigo(db, a, 1);
      assert.match(primero.codigo, /^[0-9a-f]{32}$/);
      assert.equal((await miCodigo(db, a, 1)).codigo, primero.codigo);
      await a.comoPostgres(() => db.exec(`update public.qr_codigos set expires_at = now() + interval '10 seconds'`));
      assert.notEqual((await miCodigo(db, a, 1)).codigo, primero.codigo, 'con menos de 20 s, uno nuevo');
    });
  });

  it('misma casa: puntos para la casa una sola vez por pareja, y ambos lo ven', async () => {
    await conBase(async (db, a) => {
      const r = await encuentro(db, a, 2, 1);
      assert.deepEqual({ puntos: r.puntos, casa: r.casa }, { puntos: 5, casa: 'mahou' });
      assert.equal(await puntosQr(db, a), 5);
      // Al reves tambien es la misma pareja.
      await a.falla(() => encuentro(db, a, 1, 2), /QR_REPEATED/);
      const enseña = await miCodigo(db, a, 1);
      assert.equal(enseña.ultimo?.puntos, 5, 'quien ensena el QR ve el encuentro');
      await a.como(uid(2));
      assert.equal((await db.query('select * from public.encuentros')).rows.length, 1);
      await a.como(uid(3));
      assert.equal((await db.query('select * from public.encuentros')).rows.length, 0, 'no ve los de otros');
    });
  });

  it('no vale uno mismo, otra casa, un codigo caducado ni uno inventado', async () => {
    await conBase(async (db, a) => {
      await a.falla(() => encuentro(db, a, 1, 1), /QR_SELF/);
      await a.falla(() => encuentro(db, a, 4, 1), /QR_OTHER_HOUSE/);
      await a.falla(() => escanear(db, a, 2, 'inventado'), /QR_INVALID/);
      const viejo = (await miCodigo(db, a, 1)).codigo;
      await a.comoPostgres(() => db.exec(`update public.qr_codigos set expires_at = now() - interval '1 second'`));
      await a.falla(() => escanear(db, a, 2, viejo), /QR_INVALID/);
      assert.equal(await puntosQr(db, a), 0);
    });
  });

  it('cada persona tiene un tope de encuentros que puntuan', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.exec(`update public.routes set qr_max = 2 where id = '${RUTA}'`));
      const puntuan = [];
      for (const otro of [2, 3, 5, 6]) puntuan.push((await encuentro(db, a, otro, 1)).puntua);
      assert.deepEqual(puntuan, [true, true, false, false]);
      assert.equal(await puntosQr(db, a), 10);
      // Los demas siguen pudiendo entre ellos.
      assert.equal((await encuentro(db, a, 6, 5)).puntua, true);
    });
  });

  it('fuera de la ruta no puntua, salvo quien administra; y hay que estar en ella', async () => {
    await conBase(async (db, a) => {
      await a.falla(async () => escanear(db, a, 2, (await miCodigo(db, a, 1)).codigo, OTRA), /QR_OUT_OF_TIME/);
      await a.comoPostgres(() => db.exec(`insert into public.user_houses (user_id, house) values ('${ADMIN}', 'mahou')
                                          on conflict (user_id) do update set house = 'mahou';
                                          insert into public.route_members (route_id, user_id) values ('${OTRA}', '${ADMIN}')`));
      assert.equal((await escanear(db, a, 0, (await miCodigo(db, a, 1)).codigo, OTRA)).puntua, true);
      await a.comoPostgres(() => db.exec(`delete from public.route_members where user_id = '${uid(3)}' and route_id = '${RUTA}'`));
      await a.falla(() => encuentro(db, a, 2, 3), /QR_NOT_IN_ROUTE/);
    });
  });

  it('nadie lee codigos ni apunta encuentros por su cuenta; los puntos guardan la pareja', async () => {
    await conBase(async (db, a) => {
      await miCodigo(db, a, 1);
      await a.como(uid(2));
      await a.falla(() => db.query('select * from public.qr_codigos'), /permission denied/);
      await a.falla(
        () => db.query(`insert into public.encuentros (route_id, usuarios, house, puntua) values ($1, $2, 'mahou', true)`, [RUTA, [uid(1), uid(2)]]),
        /permission denied/,
      );
      await encuentro(db, a, 2, 1);
      await a.comoPostgres(async () => {
        const { rows } = await db.query<{ user_id: string | null; detail: { usuarios: string[] } }>(
          `select user_id, detail from public.point_movements where action = 'qr'`,
        );
        assert.equal(rows[0]?.user_id, null);
        assert.deepEqual(rows[0]?.detail.usuarios.sort(), [uid(1), uid(2)]);
      });
    });
  });
});
