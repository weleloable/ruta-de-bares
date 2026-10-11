import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0040: La Cana se activa POR RUTA, y activarla tiene reglas.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. **es por ruta**: activada en una ruta no te ve nadie en otra, y
 *     desactivar en una no toca las demas;
 *  2. **las reglas solo al activar**: de 6 h antes del primer bar al cierre del
 *     ultimo (por el ORDEN de la ruta) y a 3 km del primer bar; quien ya esta
 *     dentro no se ve afectado; los admins no tienen reglas;
 *  3. **la moderacion sigue siendo por persona**: vetar o suspender saca de
 *     todas las rutas; salir de una ruta quita solo esa;
 *  4. quien ya la tenia activada la sigue teniendo en sus rutas, y pegar la
 *     migracion otra vez no reactiva a nadie;
 *  5. la app vieja no puede activar saltandose las reglas.
 */

const anteriores = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f < '0040');
const ANTES = anteriores.map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0040 = leerFichero('supabase/migrations/0040_cana_por_ruta.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const MARTA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA = '00000000-0000-4000-8000-0000000000f2';
const SIN_BARES = '00000000-0000-4000-8000-0000000000f3';
const CONSENTIMIENTO = '2026-09-18';

/** El primer bar de RUTA (sort_order 0) esta aqui. */
const BAR = { lat: 40.482, lng: -3.364 };
/** ~2,5 km al norte del primer bar: dentro. ~4 km: fuera. */
const CERCA = { lat: BAR.lat + 0.0225, lng: BAR.lng };
const LEJOS = { lat: BAR.lat + 0.036, lng: BAR.lng };

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'), ('${LUIS}', 'luis@example.com'),
    ('${MARTA}', 'marta@example.com'), ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date),
    ('${OTRA}', 'Otra ruta', true, '${ADMIN}', current_date),
    ('${SIN_BARES}', 'Ruta sin bares', true, '${ADMIN}', current_date);
  -- RUTA: abierta ahora (el primero abre en 5 h: la ventana empezo hace 1 h).
  insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${RUTA}', 0, 'Primero', ${BAR.lat}, ${BAR.lng}, now() + interval '5 hours', now() + interval '6 hours'),
    ('${RUTA}', 1, 'Ultimo', ${BAR.lat}, ${BAR.lng}, now() + interval '7 hours', now() + interval '9 hours');
  -- OTRA: tambien abierta, en el mismo sitio.
  insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${OTRA}', 0, 'Unico', ${BAR.lat}, ${BAR.lng}, now() - interval '1 hour', now() + interval '3 hours');
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'), ('${RUTA}', '${ADMIN}'),
    ('${OTRA}', '${ANA}'), ('${OTRA}', '${LUIS}'),
    ('${SIN_BARES}', '${ANA}'), ('${SIN_BARES}', '${ADMIN}');
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase([...ANTES, LA_0040]);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

/** Como activa la app nueva: en una ruta, con la ubicacion y, la primera vez, con todo. */
const activar = (db: PGlite, ruta: string, donde: { lat: number; lng: number } | null = CERCA) =>
  db.query('select public.match_activate_en_ruta($1, $2, $3, true, $4, $5, $6)', [
    ruta,
    donde?.lat ?? null,
    donde?.lng ?? null,
    'Vengo a por el pleno',
    [],
    CONSENTIMIENTO,
  ]);
const desactivar = (db: PGlite, ruta: string) => db.query('select public.match_deactivate_en_ruta($1)', [ruta]);
const activaEn = async (db: PGlite, a: Actor, ruta: string, quien: string) =>
  a.comoPostgres(async () =>
    (
      await db.query<{ si: boolean }>(
        'select exists (select 1 from public.match_route_activations where route_id = $1 and user_id = $2) as si',
        [ruta, quien],
      )
    ).rows[0]?.si,
  );
const grilla = async (db: PGlite, ruta: string) =>
  (await db.query<{ user_id: string }>('select user_id from public.match_grid($1)', [ruta])).rows.map((r) => r.user_id);
const moverBares = (db: PGlite, a: Actor, sql: string) => a.comoPostgres(() => db.exec(sql));

describe('0040: activar es por ruta', () => {
  it('activada en una ruta no se ve en otra, y desactivar solo toca esa', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await activar(db, RUTA);
      await a.como(LUIS);
      await activar(db, RUTA);
      await activar(db, OTRA);

      assert.deepEqual(await grilla(db, RUTA), [ANA], 'Luis ve a Ana en la ruta donde los dos estan');
      assert.deepEqual(await grilla(db, OTRA), [], 'Ana no la activo en OTRA: alli no sale');

      await a.como(ANA);
      await a.falla(() => grilla(db, OTRA), /MATCH_NOT_ACTIVE/);
      await desactivar(db, RUTA);
      assert.equal(await activaEn(db, a, RUTA, ANA), false);

      await a.como(LUIS);
      assert.deepEqual(await grilla(db, RUTA), [], 'Ana ha pausado en RUTA');
      assert.equal(await activaEn(db, a, OTRA, LUIS), true);
    });
  });

  it('el perfil es uno: la frase de la primera ruta vale en la segunda sin volver a escribirla', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, RUTA);
      await db.query('select public.match_activate_en_ruta($1, $2, $3)', [OTRA, CERCA.lat, CERCA.lng]);
      const { rows } = await db.query<{ bio: string; is_active: boolean }>(
        'select bio, is_active from public.match_get_profile_en_ruta($1)',
        [OTRA],
      );
      assert.deepEqual(rows[0], { bio: 'Vengo a por el pleno', is_active: true });
    });
  });

  it('is_active queda como "activada en alguna ruta"', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, RUTA);
      await activar(db, OTRA);
      const activa = async () =>
        a.comoPostgres(
          async () =>
            (await db.query<{ v: boolean }>('select is_active as v from public.match_profiles where user_id = $1', [LUIS]))
              .rows[0]?.v,
        );
      await desactivar(db, RUTA);
      assert.equal(await activa(), true);
      await desactivar(db, OTRA);
      assert.equal(await activa(), false);
    });
  });
});

describe('0040: las reglas al activar', () => {
  it('a 3 km del primer bar si; a 4 km o sin ubicacion, no', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => activar(db, RUTA, LEJOS), /CANA_TOO_FAR/);
      await a.falla(() => activar(db, RUTA, null), /LOCATION_REQUIRED/);
      await activar(db, RUTA, CERCA);
      assert.equal(await activaEn(db, a, RUTA, ANA), true);
    });
  });

  it('se abre 6 h antes del PRIMER bar, por el orden de la ruta', async () => {
    await conBase(async (db, a) => {
      // El primero (sort_order 0) abre en 7 h: aun no. Aunque el segundo abra antes.
      await moverBares(
        db,
        a,
        `update public.route_bars set opens_at = now() + interval '7 hours', closes_at = now() + interval '8 hours'
          where route_id = '${RUTA}' and sort_order = 0;
         update public.route_bars set opens_at = now() - interval '1 hour'
          where route_id = '${RUTA}' and sort_order = 1;`,
      );
      await a.como(ANA);
      await a.falla(() => activar(db, RUTA), /CANA_NOT_OPEN_YET/);
    });
  });

  it('se cierra con el ULTIMO bar por orden, no con el que cierre mas tarde', async () => {
    await conBase(async (db, a) => {
      await moverBares(
        db,
        a,
        `update public.route_bars set opens_at = now() - interval '3 hours', closes_at = now() + interval '5 hours'
          where route_id = '${RUTA}' and sort_order = 0;
         update public.route_bars set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 minute'
          where route_id = '${RUTA}' and sort_order = 1;`,
      );
      await a.como(ANA);
      await a.falla(() => activar(db, RUTA), /CANA_CLOSED/);
    });
  });

  it('una ruta sin bares no se puede activar', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => activar(db, SIN_BARES), /CANA_ROUTE_WITHOUT_BARS/);
    });
  });

  it('solo al activar: quien ya esta dentro sigue aunque cierre la ruta o se aleje', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await activar(db, RUTA);
      await moverBares(db, a, `update public.route_bars set opens_at = now() - interval '5 hours', closes_at = now() - interval '1 minute' where route_id = '${RUTA}'`);
      // Volver a pulsar (o la app al cambiar la frase) no es activar de nuevo.
      await activar(db, RUTA, LEJOS);
      await activar(db, RUTA, null);
      assert.equal(await activaEn(db, a, RUTA, ANA), true);
      await a.como(LUIS);
      await a.falla(() => activar(db, RUTA), /CANA_CLOSED/);
    });
  });

  it('un admin la activa cuando quiera y desde donde quiera, incluso sin bares', async () => {
    await conBase(async (db, a) => {
      await moverBares(db, a, `update public.route_bars set opens_at = now() - interval '5 hours', closes_at = now() - interval '1 minute' where route_id = '${RUTA}'`);
      await a.como(ADMIN);
      await activar(db, RUTA, null);
      await activar(db, SIN_BARES, LEJOS);
      assert.equal(await activaEn(db, a, RUTA, ADMIN), true);
      assert.equal(await activaEn(db, a, SIN_BARES, ADMIN), true);
    });
  });

  it('hay que estar en la ruta, tambien siendo admin', async () => {
    await conBase(async (db, a) => {
      await a.como(MARTA);
      await a.falla(() => activar(db, RUTA), /NOT_PARTICIPANT/);
      await a.como(ADMIN);
      await a.falla(() => activar(db, OTRA), /NOT_PARTICIPANT/);
    });
  });

  it('el perfil en una ruta dice cuando se abre, cuando se cierra y si a ti no te aplica', async () => {
    await conBase(async (db, a) => {
      type Fila = { cana_abre: Date | null; cana_cierra: Date | null; sin_reglas: boolean; is_active: boolean };
      const leer = async (ruta: string) =>
        (await db.query<Fila>('select * from public.match_get_profile_en_ruta($1)', [ruta])).rows[0];
      await a.como(ANA);
      const fila = await leer(RUTA);
      const { rows } = await a.comoPostgres(() =>
        db.query<{ abre: Date; cierra: Date }>(
          `select (select opens_at from public.route_bars where route_id = $1 and sort_order = 0) - interval '6 hours' as abre,
                  (select closes_at from public.route_bars where route_id = $1 and sort_order = 1) as cierra`,
          [RUTA],
        ),
      );
      assert.equal(fila?.cana_abre?.getTime(), rows[0]?.abre.getTime());
      assert.equal(fila?.cana_cierra?.getTime(), rows[0]?.cierra.getTime());
      assert.equal(fila?.sin_reglas, false);
      assert.equal(fila?.is_active, false);
      assert.equal((await leer(SIN_BARES))?.cana_abre, null);
      await a.como(ADMIN);
      assert.equal((await leer(RUTA))?.sin_reglas, true);
    });
  });
});

describe('0040: moderar sigue siendo por persona', () => {
  it('desactivar la cana desde una denuncia la quita de todas sus rutas', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, RUTA);
      await activar(db, OTRA);
      await a.como(ADMIN);
      await db.query(`select public.match_admin_deactivate($1, 'Molesta a la gente en la ruta')`, [LUIS]);
      assert.equal(await activaEn(db, a, RUTA, LUIS), false);
      assert.equal(await activaEn(db, a, OTRA, LUIS), false);
      await a.como(LUIS);
      await a.falla(() => activar(db, RUTA), /CANA_BLOCKED/);
    });
  });

  it('salir de una ruta quita la activacion de esa ruta y no de las demas', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, RUTA);
      await activar(db, OTRA);
      await a.comoPostgres(() => db.query('delete from public.route_members where route_id = $1 and user_id = $2', [RUTA, LUIS]));
      assert.equal(await activaEn(db, a, RUTA, LUIS), false);
      assert.equal(await activaEn(db, a, OTRA, LUIS), true);
    });
  });

  it('borrar tus datos de la cana te quita de todas', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, RUTA);
      await db.query('select public.match_delete_my_data()');
      assert.equal(await activaEn(db, a, RUTA, LUIS), false);
    });
  });

  it('la ficha de una denuncia dice si esta activa EN LA RUTA de la denuncia', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, OTRA);
      await a.como(ANA);
      await activar(db, OTRA);
      await activar(db, RUTA);
      const { rows } = await db.query<{ id: string }>(
        `select public.match_report($1, $2, 'acoso', 'Me ha escrito cosas feas') as id`,
        [OTRA, LUIS],
      );
      await a.como(ADMIN);
      const ficha = await db.query<{ reported_active: boolean }>('select reported_active from public.match_admin_report($1)', [
        rows[0]?.id,
      ]);
      assert.equal(ficha.rows[0]?.reported_active, true);
    });
  });
});

describe('0040: estadisticas y datos', () => {
  it('las estadisticas cuentan a quien la tiene activada EN ESA ruta', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await activar(db, OTRA);
      await a.como(LUIS);
      await activar(db, RUTA);
      await a.como(ADMIN);
      const cuenta = async (ruta: string) =>
        (await db.query<{ e: { cana: { activada: number } } }>('select public.admin_estadisticas_ruta($1) as e', [ruta])).rows[0]
          ?.e.cana.activada;
      assert.equal(await cuenta(RUTA), 1);
      assert.equal(await cuenta(OTRA), 1);
    });
  });

  it('descargar mis datos dice en que rutas la tienes activada', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, OTRA);
      const { rows } = await db.query<{ d: { activada_en_las_rutas: { ruta: string }[] } }>(
        'select public.match_export_my_data() as d',
      );
      assert.deepEqual(rows[0]?.d.activada_en_las_rutas.map((r) => r.ruta), ['Otra ruta']);
    });
  });
});

describe('0040: la app vieja y el paso de una version a otra', () => {
  it('la app vieja no puede activar (se saltaria las reglas), pero desactivar le sigue valiendo', async () => {
    await conBase(async (db, a) => {
      await a.como(LUIS);
      await activar(db, RUTA);
      await activar(db, OTRA);
      await a.falla(() => db.query('select public.match_activate()'), /APP_UPDATE_REQUIRED/);
      await db.query('select public.match_deactivate()');
      assert.equal(await activaEn(db, a, RUTA, LUIS), false);
      assert.equal(await activaEn(db, a, OTRA, LUIS), false);
    });
  });

  it('quien la tenia activada la sigue teniendo en todas sus rutas, y pegarla otra vez no reactiva a nadie', async () => {
    const db = await crearBase(ANTES);
    try {
      await db.exec(DATOS);
      await escenario(db, async (a) => {
        // Antes de la 0040: Luis la activa como siempre (es por persona).
        await a.como(LUIS);
        await db.query('select public.match_activate(true, $1, $2, $3)', ['Vengo a por el pleno', [], CONSENTIMIENTO]);
        await a.comoPostgres(() => db.exec(LA_0040));
        assert.equal(await activaEn(db, a, RUTA, LUIS), true);
        assert.equal(await activaEn(db, a, OTRA, LUIS), true);
        assert.equal(await activaEn(db, a, RUTA, ANA), false, 'Ana no la tenia activada');

        // La desactiva en una y se vuelve a pegar la migracion: sigue desactivada ahi.
        await desactivar(db, RUTA);
        await a.comoPostgres(() => db.exec(LA_0040));
        assert.equal(await activaEn(db, a, RUTA, LUIS), false);
        assert.equal(await activaEn(db, a, OTRA, LUIS), true);
      });
    } finally {
      await db.close();
    }
  });
});
