import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0049: cierre de rutas, ganadora, temporadas e historico.
 *
 *  1. cerrar guarda la foto (puestos, ganadora o empate) y solo lo hace admin;
 *  2. el resultado sobrevive al borrado de la ruta; si no estaba cerrada, se cierra sola;
 *  3. "visto" una vez por persona, y al volver a cerrar se ve otra vez;
 *  4. historico: victorias, podios y puntos, por temporada;
 *  5. reiniciar anula todos los puntos con motivo y reabre;
 *  6. el palmares no ensena el nombre de rutas ajenas.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0049_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = (n: number) => `00000000-0000-4000-8000-0000000000f${n}`;
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CASA: Record<number, string> = { 1: 'mahou', 2: 'mahou', 3: 'alhambra', 4: 'cruzcampo' };

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA(1)}', 'Primera', true, '${ADMIN}', current_date),
    ('${RUTA(2)}', 'Segunda', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR(1)}', '${RUTA(1)}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(2)}', '${RUTA(1)}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(3)}', '${RUTA(2)}', 0, 'Tres', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3, 4]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              insert into public.user_houses (user_id, house) values ('${uid(n)}', '${CASA[n]}');
              insert into public.route_members (route_id, user_id) values ('${RUTA(1)}', '${uid(n)}');`,
    )
    .join('\n')}
  insert into public.route_members (route_id, user_id) values ('${RUTA(2)}', '${uid(3)}'), ('${RUTA(2)}', '${uid(4)}');
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

const sellar = (db: PGlite, a: Actor, n: number, bar: number) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m)
             values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5)`),
  );

type Resultado = { ganadoras: string[]; resultado: { house: string; puntos: number; puesto: number }[]; visto: boolean };
const cerrar = async (db: PGlite, a: Actor, ruta: number) => {
  await a.como(ADMIN);
  return (await db.query<{ r: Resultado }>('select public.casas_cerrar_ruta($1) as r', [RUTA(ruta)])).rows[0]!.r;
};
const resultado = async (db: PGlite, a: Actor, n: number, ruta = 1) => {
  await a.como(uid(n));
  return (await db.query<{ r: Resultado | null }>('select public.casas_resultado($1) as r', [RUTA(ruta)])).rows[0]!.r;
};

type Hist = { house: string; victorias: number; segundos: number; terceros: number; puntos: number; rutas: number };
const historico = async (db: PGlite, a: Actor, temporada: string | null = null) => {
  await a.como(uid(1));
  const { rows } = await db.query<Hist>('select * from public.casas_historico($1)', [temporada]);
  return Object.fromEntries(rows.map((r) => [r.house, r]));
};

describe('0049: cierre e historico', () => {
  it('cerrar guarda puestos y ganadora; solo admins', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 2, 1);
      await sellar(db, a, 3, 1);
      await a.como(uid(1));
      await a.falla(() => db.query('select public.casas_cerrar_ruta($1)', [RUTA(1)]), /FORBIDDEN/);
      assert.equal(await resultado(db, a, 1), null, 'abierta: sin resultado');
      const r = await cerrar(db, a, 1);
      assert.deepEqual(r.ganadoras, ['mahou']);
      assert.deepEqual(
        r.resultado.map((x) => [x.house, x.puntos, x.puesto]),
        [['mahou', 20, 1], ['alhambra', 10, 2], ['cruzcampo', 0, 3], ['estrella', 0, 3]],
      );
    });
  });

  it('empate arriba: dos ganadoras; sin puntos: ninguna', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 3, 3);
      await sellar(db, a, 4, 3);
      assert.deepEqual((await cerrar(db, a, 2)).ganadoras, ['alhambra', 'cruzcampo']);
      assert.deepEqual((await cerrar(db, a, 1)).ganadoras, []);
    });
  });

  it('la pantalla de ganadora se ve una vez, y otra si se vuelve a cerrar', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await cerrar(db, a, 1);
      assert.equal((await resultado(db, a, 1))?.visto, false);
      await db.query('select public.casas_resultado_visto($1)', [RUTA(1)]);
      assert.equal((await resultado(db, a, 1))?.visto, true);
      await cerrar(db, a, 1);
      assert.equal((await resultado(db, a, 1))?.visto, false);
      await a.como(uid(9));
      await a.falla(() => db.query('select public.casas_resultado($1)', [RUTA(1)]), /NOT_AUTHENTICATED|FORBIDDEN/);
    });
  });

  it('el resultado sobrevive al borrado; una ruta sin cerrar se cierra sola al borrarla', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 3, 3);
      await cerrar(db, a, 1);
      await a.comoPostgres(() => db.exec(`delete from public.routes`));
      const h = await historico(db, a);
      assert.equal(h.mahou?.victorias, 1);
      assert.equal(h.alhambra?.victorias, 1, 'la segunda se cerro sola');
      assert.equal(h.mahou?.rutas, 2);
      await a.comoPostgres(async () => {
        const { rows } = await db.query<{ automatica: boolean }>('select automatica from public.casas_resultados order by automatica');
        assert.deepEqual(rows.map((r) => r.automatica), [false, true]);
      });
    });
  });

  it('historico por temporada', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      const { rows } = await db.query<{ id: string }>(`insert into public.temporadas (nombre) values ('Otoño 2026') returning id`);
      const t = rows[0]!.id;
      await db.query('update public.routes set temporada_id = $1 where id = $2', [t, RUTA(1)]);
      await sellar(db, a, 1, 1);
      await sellar(db, a, 3, 3);
      await cerrar(db, a, 1);
      await cerrar(db, a, 2);
      const enTemporada = await historico(db, a, t);
      assert.equal(enTemporada.mahou?.victorias, 1);
      assert.equal(enTemporada.alhambra?.victorias, 0);
      assert.equal(enTemporada.alhambra?.segundos, 0, 'en la primera alhambra no puntuo');
      // Sacar la ruta de la temporada la saca tambien del historico de la temporada.
      await a.como(ADMIN);
      await db.query('update public.routes set temporada_id = null where id = $1', [RUTA(1)]);
      assert.equal((await historico(db, a, t)).mahou?.rutas, 0);
      await a.como(uid(1));
      await a.falla(() => db.query(`insert into public.temporadas (nombre) values ('Mia')`), /row-level security/);
    });
  });

  it('reiniciar anula todos los puntos con motivo y reabre', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1);
      await sellar(db, a, 1, 2);
      await cerrar(db, a, 1);
      await a.como(ADMIN);
      await a.falla(() => db.query('select public.casas_admin_anular_ruta($1, $2)', [RUTA(1), '']), /REASON_REQUIRED/);
      const { rows } = await db.query<{ n: number }>('select public.casas_admin_anular_ruta($1, $2) as n', [RUTA(1), 'Ruta de prueba']);
      assert.equal(rows[0]?.n, 3, 'dos sellos y la ruta completa');
      assert.equal(await resultado(db, a, 1), null, 'reabierta');
    });
  });

  it('el palmares no ensena el nombre de rutas ajenas', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 3, 3);
      await cerrar(db, a, 2);
      await a.como(uid(1));
      const { rows } = await db.query<{ ruta: string | null; ganadoras: string[] }>('select * from public.casas_palmares()');
      assert.deepEqual([rows[0]?.ruta, rows[0]?.ganadoras], [null, ['alhambra']]);
      await a.como(uid(3));
      assert.equal((await db.query<{ ruta: string }>('select * from public.casas_palmares()')).rows[0]?.ruta, 'Segunda');
    });
  });
});
