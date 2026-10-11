import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0042: las horas antes y la distancia para activar La Cana son de cada ruta.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. las rutas que ya habia siguen con 6 h y 3 km;
 *  2. las horas de la ruta mueven la apertura (0 = desde que abre el primer bar);
 *  3. el radio de la ruta manda, y sin radio (NULL) no se pide ubicacion;
 *  4. los limites (0..24 h, 0,5..20 km) los pone la tabla;
 *  5. el perfil en la ruta devuelve el radio, y se puede pegar dos veces.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0042_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0042 = leerFichero('supabase/migrations/0042_cana_ajustes_por_ruta.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = { lat: 40.482, lng: -3.364 };
/** ~4 km al norte del primer bar. */
const A_4KM = { lat: BAR.lat + 0.036, lng: BAR.lng };
const CERCA = { lat: BAR.lat + 0.005, lng: BAR.lng };

/** El primer bar abre dentro de `horas` horas (y cierra 3 h despues). */
const datos = (horas: number) => `
  insert into auth.users (id, email) values ('${ANA}', 'ana@example.com'), ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at)
  values ('${RUTA}', 0, 'Primero', ${BAR.lat}, ${BAR.lng}, now() + interval '${horas} hours', now() + interval '${horas + 3} hours');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}');
`;

async function conBase(horas: number, fn: (db: PGlite, a: Actor) => Promise<void>, extra: string[] = []) {
  const db = await crearBase([...migraciones, ...extra]);
  await db.exec(datos(horas));
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

const activar = (db: PGlite, donde: { lat: number; lng: number } | null) =>
  db.query('select public.match_activate_en_ruta($1, $2, $3, true, $4, $5, $6)', [
    RUTA,
    donde?.lat ?? null,
    donde?.lng ?? null,
    'Vengo a por el pleno',
    [],
    '2026-09-18',
  ]);
const ajustar = (db: PGlite, a: Actor, sql: string) =>
  a.comoPostgres(() => db.exec(`update public.routes set ${sql} where id = '${RUTA}'`));

describe('0042: horas y distancia de La Cana por ruta', () => {
  it('por defecto 6 h y 3 km, como antes', async () => {
    await conBase(5, async (db, a) => {
      const { rows } = await a.comoPostgres(() =>
        db.query<{ h: number; km: string }>(`select cana_horas_antes as h, cana_radio_km as km from public.routes where id = $1`, [RUTA]),
      );
      assert.deepEqual(rows[0], { h: 6, km: '3.0' });
      await a.como(ANA);
      await a.falla(() => activar(db, A_4KM), /CANA_TOO_FAR/);
      await activar(db, CERCA);
    });
  });

  it('las horas de la ruta mueven la apertura; 0 = desde que abre el primer bar', async () => {
    await conBase(5, async (db, a) => {
      await ajustar(db, a, 'cana_horas_antes = 4');
      await a.como(ANA);
      await a.falla(() => activar(db, CERCA), /CANA_NOT_OPEN_YET/);
      await ajustar(db, a, 'cana_horas_antes = 0');
      await a.falla(() => activar(db, CERCA), /CANA_NOT_OPEN_YET/);
      await ajustar(db, a, 'cana_horas_antes = 24');
      await activar(db, CERCA);
    });
  });

  it('el radio de la ruta manda, y sin limite no hace falta ubicacion', async () => {
    await conBase(1, async (db, a) => {
      await ajustar(db, a, 'cana_radio_km = 5');
      await a.como(ANA);
      await activar(db, A_4KM);
    });
    await conBase(1, async (db, a) => {
      await ajustar(db, a, 'cana_radio_km = null');
      await a.como(ANA);
      await activar(db, null);
    });
  });

  it('el perfil en la ruta devuelve el radio (null = sin limite) y la apertura con las horas de la ruta', async () => {
    await conBase(10, async (db, a) => {
      await ajustar(db, a, 'cana_radio_km = 7.5, cana_horas_antes = 2');
      await a.como(ANA);
      const { rows } = await db.query<{ cana_radio_km: string; cana_abre: Date }>(
        'select cana_radio_km, cana_abre from public.match_get_profile_en_ruta($1)',
        [RUTA],
      );
      assert.equal(rows[0]?.cana_radio_km, '7.5');
      const { rows: bar } = await a.comoPostgres(() =>
        db.query<{ abre: Date }>(`select opens_at - interval '2 hours' as abre from public.route_bars where route_id = $1`, [RUTA]),
      );
      assert.equal(rows[0]?.cana_abre.getTime(), bar[0]?.abre.getTime());
      await ajustar(db, a, 'cana_radio_km = null');
      const sin = await db.query<{ cana_radio_km: string | null }>('select cana_radio_km from public.match_get_profile_en_ruta($1)', [RUTA]);
      assert.equal(sin.rows[0]?.cana_radio_km, null);
    });
  });

  it('la tabla pone los limites', async () => {
    await conBase(1, async (db, a) => {
      await a.comoPostgres(async () => {
        await a.falla(() => db.exec(`update public.routes set cana_horas_antes = 25 where id = '${RUTA}'`), /routes_cana_horas_antes_check/);
        await a.falla(() => db.exec(`update public.routes set cana_horas_antes = -1 where id = '${RUTA}'`), /routes_cana_horas_antes_check/);
        await a.falla(() => db.exec(`update public.routes set cana_radio_km = 0.2 where id = '${RUTA}'`), /routes_cana_radio_km_check/);
        await a.falla(() => db.exec(`update public.routes set cana_radio_km = 21 where id = '${RUTA}'`), /routes_cana_radio_km_check/);
      });
    });
  });

  it('un admin puede cambiarlo desde la app; alguien de la ruta, no', async () => {
    await conBase(1, async (db, a) => {
      await a.como(ADMIN);
      await db.query(`update public.routes set cana_radio_km = 10, cana_horas_antes = 3 where id = $1`, [RUTA]);
      await a.como(ANA);
      const r = await db.query(`update public.routes set cana_radio_km = 20 where id = $1 returning id`, [RUTA]);
      assert.equal(r.rows.length, 0, 'la politica no le deja tocar la ruta');
      const { rows } = await a.comoPostgres(() =>
        db.query<{ km: string; h: number }>(`select cana_radio_km as km, cana_horas_antes as h from public.routes where id = $1`, [RUTA]),
      );
      assert.deepEqual(rows[0], { km: '10.0', h: 3 });
    });
  });

  it('pegarla dos veces no cambia lo que ya se ajusto', async () => {
    await conBase(
      1,
      async (db, a) => {
        await ajustar(db, a, 'cana_radio_km = 12');
        await a.comoPostgres(() => db.exec(LA_0042));
        const { rows } = await a.comoPostgres(() =>
          db.query<{ km: string }>(`select cana_radio_km as km from public.routes where id = $1`, [RUTA]),
        );
        assert.equal(rows[0]?.km, '12.0');
        await a.como(ANA);
        await activar(db, CERCA);
      },
      [LA_0042],
    );
  });
});
