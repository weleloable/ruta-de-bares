import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import type { LevaduraId, MaltaId } from '../src/features/minijuegos/juegos/maestro/datos.ts';
import { calcularCerveza } from '../src/features/minijuegos/juegos/maestro/estilo.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0037: el paso 4 de Maestro Cervecero ("enfriar y sembrar") entra en la nota.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. **el servidor calcula lo mismo que la app** (`maestro_calcular_cerveza_v2`
 *     frente a `calcularCerveza` de estilo.ts) en un barrido de combinaciones;
 *  2. **la app vieja sigue funcionando**: `maestro_submit_beer` de 7 argumentos
 *     guarda la cerveza con la nota de antes y sin siembra (NULL, no inventada);
 *  3. la v2 valida la siembra y la guarda; el calculo interno no se llama desde la API;
 *  4. la siembra sale en "descargar mis datos";
 *  5. se puede pegar dos veces.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0037_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ANA = '00000000-0000-4000-8000-00000000000a';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values ('${ANA}', 'ana@example.com'), ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date + 10);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}');
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

type Fila = { score: number; estilo: string };

const v2 = (db: PGlite, receta: [string, string, number, number, number, number | null], nombre = 'Mi lager') =>
  db.query<{ r: Fila }>(`select public.maestro_submit_beer_v2($1, $2, $3, $4, $5, $6, $7, $8) as r`, [RUTA, nombre, ...receta]);

const v1 = (db: PGlite, receta: [string, string, number, number, number], nombre = 'De la app vieja') =>
  db.query<{ r: Fila }>(`select public.maestro_submit_beer($1, $2, $3, $4, $5, $6, $7) as r`, [RUTA, nombre, ...receta]);

/** El envio esta espaciado (25 s): para el siguiente se "pasa el tiempo". */
async function pasarElTiempo(db: PGlite, a: Actor) {
  await a.comoPostgres(async () => {
    await db.exec(`update public.maestro_beers set created_at = created_at - interval '1 hour'`);
  });
}

describe('0037: la nota con siembra', () => {
  it('maestro_calcular_cerveza_v2 y estilo.ts dan LO MISMO en un barrido de combinaciones', async () => {
    const db = await crearBase(migraciones);
    try {
      // Valores que caen en los bordes de redondeo (x,5) y de tramo (IPA, cuerpo).
      const valores = [0, 1, 13, 33, 49, 50, 51, 67, 83, 99, 100];
      const { rows } = await db.query<{
        malta: MaltaId; levadura: LevaduraId; m: number; am: number; ar: number; s: number;
        estilo: string; abv: string; ibu: number; cuerpo: string; score: number;
      }>(`
        select t.malta, l.levadura, m, am, ar, s, c.estilo, c.abv::text as abv, c.ibu, c.cuerpo, c.score
          from (values ('palida'), ('caramelo'), ('tostada'), ('negra')) t(malta)
          cross join (values ('ale'), ('lager')) l(levadura)
          cross join unnest($1::int[]) m
          cross join unnest($1::int[]) am
          cross join unnest($1::int[]) ar
          cross join unnest($1::int[]) s
          cross join lateral public.maestro_calcular_cerveza_v2(t.malta, l.levadura, m, am, ar, s) c
      `, [valores]);
      assert.equal(rows.length, 4 * 2 * valores.length ** 4, 'no salieron todas las filas');

      const distintos: string[] = [];
      for (const r of rows) {
        const ts = calcularCerveza({
          malta: r.malta, levadura: r.levadura, maceracion: r.m / 100,
          lupulo: { amargor: r.am / 100, aroma: r.ar / 100 }, siembra: r.s / 100,
        });
        const sql = { estilo: r.estilo, abv: Number(r.abv), ibu: r.ibu, cuerpo: r.cuerpo, puntuacion: r.score };
        if (JSON.stringify(ts) !== JSON.stringify(sql)) {
          distintos.push(`${r.malta}/${r.levadura} ${r.m}/${r.am}/${r.ar}/${r.s}: ts=${JSON.stringify(ts)} sql=${JSON.stringify(sql)}`);
          if (distintos.length >= 5) break;
        }
      }
      assert.deepEqual(distintos, [], distintos.join('\n'));
    } finally {
      await db.close();
    }
  });

  it('la v2 guarda la siembra y puntua con ella', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      const { rows } = await v2(db, ['palida', 'lager', 100, 100, 100, 0]);
      assert.equal(rows[0]?.r.score, 80, 'levadura muerta: pierde los 20 de la siembra');
      await a.comoPostgres(async () => {
        const fila = await db.query<{ siembra: number }>(`select siembra from public.maestro_beers`);
        assert.deepEqual(fila.rows, [{ siembra: 0 }]);
      });
    });
  });

  it('la v2 rechaza una siembra que falta o se sale de 0..100', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(() => v2(db, ['palida', 'ale', 50, 50, 50, null]), /INVALID_RECIPE/);
      await a.falla(() => v2(db, ['palida', 'ale', 50, 50, 50, 101]), /INVALID_RECIPE/);
      await a.falla(() => v2(db, ['palida', 'ale', 50, 50, 50, -1]), /INVALID_RECIPE/);
      // Y lo de siempre lo sigue validando (por la funcion de la 0034).
      await a.falla(() => v2(db, ['vino', 'ale', 50, 50, 50, 50]), /INVALID_RECIPE|check/);
    });
  });

  it('la app VIEJA sigue guardando, con la nota de antes y sin inventarse la siembra', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      const { rows } = await v1(db, ['palida', 'ale', 100, 0, 0]);
      assert.equal(rows[0]?.r.score, 40, 'sigue siendo 40 / 30 / 30');
      await a.comoPostgres(async () => {
        const fila = await db.query<{ siembra: number | null }>(`select siembra from public.maestro_beers`);
        assert.deepEqual(fila.rows, [{ siembra: null }]);
      });
    });
  });

  it('las dos vias comparten el ritmo y el tope: no se esquiva el TOO_FAST cambiando de version', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await v1(db, ['palida', 'ale', 50, 50, 50]);
      await a.falla(() => v2(db, ['palida', 'ale', 50, 50, 50, 50]), /TOO_FAST/);
      await pasarElTiempo(db, a);
      await v2(db, ['palida', 'ale', 50, 50, 50, 50]);
    });
  });

  it('el calculo interno no se llama desde la API, y sin estar en la ruta no se guarda', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await a.falla(
        () => db.query(`select * from public.maestro_calcular_cerveza_v2('palida', 'ale', 1, 1, 1, 1)`),
        /permission denied/,
      );
      await a.anonimo();
      await a.falla(() => v2(db, ['palida', 'ale', 50, 50, 50, 50]), /permission denied|NOT_AUTHENTICATED/);
    });
  });

  it('la siembra sale en "descargar mis datos" (y la de una cerveza vieja, como null)', async () => {
    await conBase(async (db, a) => {
      await a.como(ANA);
      await v1(db, ['palida', 'ale', 50, 50, 50]);
      await pasarElTiempo(db, a);
      await v2(db, ['negra', 'ale', 50, 50, 50, 77]);
      const { rows } = await db.query<{ d: { minijuegos: { cervezas: { siembra: number | null }[] }; cuenta: unknown } }>(
        `select public.export_my_data() as d`,
      );
      const siembras = rows[0]?.d.minijuegos.cervezas.map((c) => c.siembra);
      assert.deepEqual(siembras, [null, 77]);
      assert.ok(rows[0]?.d.cuenta, 'sigue saliendo el resto de la exportacion');
    });
  });

  it('pegarla dos veces no rompe nada', async () => {
    const db = await crearBase([...migraciones, migraciones.at(-1) as string]);
    try {
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::text as n from information_schema.columns where table_name = 'maestro_beers' and column_name = 'siembra'`,
      );
      assert.equal(rows[0]?.n, '1');
    } finally {
      await db.close();
    }
  });
});
