import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0041: el ranking de "¿Conduces tú?", por ruta y POR NIVEL de cañas.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. solo se comparan partidas del mismo nivel, y cada ruta va aparte;
 *  2. se guarda la mejor distancia y se devuelve el puesto y cuantos hay;
 *  3. el nivel tiene que existir en la ruta (1..numero de bares);
 *  4. lo de siempre de la 0034: solo quien esta dentro, ritmo minimo;
 *  5. sale en "descargar mis datos", y se puede pegar dos veces.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0041_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const LA_0041 = leerFichero('supabase/migrations/0041_ranking_conduces.sql');

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const FUERA = '00000000-0000-4000-8000-00000000000e';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA = '00000000-0000-4000-8000-0000000000f2';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'), ('${LUIS}', 'luis@example.com'),
    ('${FUERA}', 'fuera@example.com'), ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date),
    ('${OTRA}', 'Otra ruta', true, '${ADMIN}', current_date);
  -- RUTA tiene 3 bares (niveles 1..3); OTRA no tiene (solo el nivel 1).
  insert into public.route_bars (route_id, sort_order, name, lat, lng, opens_at, closes_at)
  select '${RUTA}', n, 'Bar ' || n, 40.48, -3.36, now(), now() + interval '2 hours' from generate_series(0, 2) n;
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'), ('${OTRA}', '${ANA}');
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>, extra: string[] = []) {
  const db = await crearBase([...migraciones, ...extra]);
  await db.exec(DATOS);
  try {
    await escenario(db, (a) => fn(db, a));
  } finally {
    await db.close();
  }
}

type Envio = { best: number; is_record: boolean; position: number; total: number };
const enviar = async (db: PGlite, ruta: string, nivel: number, metros: number) =>
  (await db.query<{ r: Envio }>('select public.conduces_submit_score($1, $2, $3) as r', [ruta, nivel, metros])).rows[0]?.r;
const ranking = async (db: PGlite, ruta: string, nivel: number) =>
  (await db.query<{ distance: number; is_me: boolean }>('select * from public.conduces_ranking($1, $2)', [ruta, nivel])).rows.map(
    (r) => [r.distance, r.is_me],
  );
const pasarElTiempo = (db: PGlite, a: Actor) =>
  a.comoPostgres(() => db.exec(`update public.conduces_scores set last_submit_at = last_submit_at - interval '1 hour'`));

describe('0041: ranking de ¿Conduces tú?', () => {
  it('guarda la mejor por nivel y devuelve el puesto y cuantos hay', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      assert.deepEqual(await enviar(db, RUTA, 2, 800), { best: 800, is_record: true, position: 1, total: 1 });
      await pasarElTiempo(db, a);
      assert.deepEqual(await enviar(db, RUTA, 2, 300), { best: 800, is_record: false, position: 1, total: 1 });
      await a.como(LUIS);
      assert.deepEqual(await enviar(db, RUTA, 2, 1200), { best: 1200, is_record: true, position: 1, total: 2 });
      await a.como(ANA);
      assert.deepEqual(await ranking(db, RUTA, 2), [
        [1200, false],
        [800, true],
      ]);
    });
  });

  it('solo se comparan partidas del mismo nivel', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await enviar(db, RUTA, 1, 5000);
      await a.como(LUIS);
      const r = await enviar(db, RUTA, 3, 90);
      assert.equal(r?.position, 1, 'en el nivel 3 es el primero aunque Ana fuera mas lejos en el 1');
      assert.deepEqual(await ranking(db, RUTA, 3), [[90, true]]);
      assert.deepEqual(await ranking(db, RUTA, 1), [[5000, false]]);
    });
  });

  it('cada ruta va aparte', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await enviar(db, RUTA, 1, 700);
      await enviar(db, OTRA, 1, 50);
      assert.deepEqual(await ranking(db, OTRA, 1), [[50, true]]);
    });
  });

  it('el nivel tiene que existir en la ruta: de 1 al numero de bares (sin bares, solo el 1)', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => enviar(db, RUTA, 4, 100), /INVALID_LEVEL/);
      await a.falla(() => enviar(db, RUTA, 0, 100), /INVALID_LEVEL/);
      await a.falla(() => enviar(db, OTRA, 2, 100), /INVALID_LEVEL/);
      await a.falla(() => enviar(db, RUTA, 1, -5), /INVALID_SCORE/);
      await a.falla(() => enviar(db, RUTA, 1, 2_000_000), /INVALID_SCORE/);
      await enviar(db, OTRA, 1, 100);
    });
  });

  it('solo quien esta dentro, y no a ritmo de script', async () => {
    await conBase(async (db, a) => {
      await a.como(FUERA);
      await a.falla(() => enviar(db, RUTA, 1, 100), /FORBIDDEN/);
      await a.falla(() => ranking(db, RUTA, 1), /FORBIDDEN/);
      await a.como(ANA);
      await enviar(db, RUTA, 1, 100);
      await a.falla(() => enviar(db, RUTA, 1, 200), /TOO_FAST/);
      // Otro nivel es otra fila: no espera.
      await enviar(db, RUTA, 2, 100);
      // Un admin puede leer sin estar dentro.
      await a.como(ADMIN);
      assert.equal((await ranking(db, RUTA, 1)).length, 1);
    });
  });

  it('la tabla no se toca por la API', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => db.query('select * from public.conduces_scores'), /permission denied/);
    });
  });

  it('sale en descargar mis datos, sin perder lo de antes', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await enviar(db, RUTA, 2, 640);
      const { rows } = await db.query<{ d: { minijuegos: { conduces: { nivel_de_canas: number; mejor_distancia_m: number }[]; records: unknown[] }; cana: unknown; sellos: unknown } }>(
        'select public.export_my_data() as d',
      );
      const d = rows[0]?.d;
      assert.deepEqual(d?.minijuegos.conduces.map((c) => [c.nivel_de_canas, c.mejor_distancia_m]), [[2, 640]]);
      assert.ok(Array.isArray(d?.minijuegos.records), 'sigue lo de la 0034');
      assert.ok(d?.cana !== undefined && d?.sellos !== undefined);
    });
  });

  it('pegarla dos veces no rompe ni borra nada', async () => {
    await conBase(
      async (db, a) => {
        await a.como(ANA);
        await enviar(db, RUTA, 1, 333);
        assert.deepEqual(await ranking(db, RUTA, 1), [[333, true]]);
      },
      [LA_0041],
    );
  });
});
