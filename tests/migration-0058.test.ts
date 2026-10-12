import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0058: estadisticas de actividad de una ruta (solo admins, solo totales).
 *
 *  1. participacion, bares, horas, consumiciones, juegos, retos y QR cuadran con lo que hay;
 *  2. una ruta vacia devuelve ceros y listas vacias, no nulos;
 *  3. solo admins, y nada por persona.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0058_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const VACIA = '00000000-0000-4000-8000-0000000000f2';
const BAR = (n: number) => `00000000-0000-4000-8000-0000000000b${n}`;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date),
    ('${VACIA}', 'Vacia', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR(1)}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR(2)}', '${RUTA}', 1, 'Dos', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3, 4]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              insert into public.user_houses (user_id, house) values ('${uid(n)}', 'mahou');
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
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

const sellar = (db: PGlite, a: Actor, n: number, bar: number, minutos: number) =>
  a.comoPostgres(() =>
    db.exec(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m, stamped_at)
             values ('${uid(n)}', '${BAR(bar)}', 40.48, -3.36, 5, now() - interval '${minutos} minutes')`),
  );

type Stats = {
  participacion: Record<string, number>;
  bares: { nombre: string; sellos: number }[];
  horas: { hora: string; sellos: number }[];
  consumiciones: { total: number; puntuan: number; personas: number; por_categoria: Record<string, number> };
  juegos: { juego: string; jugadores: number; mejor: number | null }[];
  retos: { nombre: string; activo: boolean; plazas: number | null; conseguidos: number }[];
  qr: { encuentros: number; puntuan: number };
};
const leer = async (db: PGlite, a: Actor, ruta = RUTA) => {
  await a.como(ADMIN);
  return (await db.query<{ r: Stats }>('select public.admin_estadisticas_actividad($1) as r', [ruta])).rows[0]!.r;
};

describe('0058: estadisticas de actividad', () => {
  it('todo cuadra con lo que hay en la ruta', async () => {
    await conBase(async (db, a) => {
      await sellar(db, a, 1, 1, 200);
      await sellar(db, a, 2, 1, 5);
      await sellar(db, a, 2, 2, 2);
      await a.comoPostgres(() =>
        db.exec(`insert into public.consumiciones (route_id, route_bar_id, user_id, categoria, puntua) values
                   ('${RUTA}', '${BAR(2)}', '${uid(2)}', 'tercio', true),
                   ('${RUTA}', '${BAR(2)}', '${uid(2)}', 'tercio', false),
                   ('${RUTA}', '${BAR(2)}', '${uid(3)}', 'sin_alcohol', true);
                 insert into public.encuentros (route_id, usuarios, house, puntua) values
                   ('${RUTA}', array['${uid(1)}', '${uid(2)}']::uuid[], 'mahou', true),
                   ('${RUTA}', array['${uid(1)}', '${uid(3)}']::uuid[], 'mahou', false);
                 insert into public.minigame_scores (route_id, user_id, game, best_score, best_at) values
                   ('${RUTA}', '${uid(1)}', 'cana-perfecta', 80, now()), ('${RUTA}', '${uid(2)}', 'cana-perfecta', 95, now());
                 insert into public.retos (route_id, nombre, tipo, objetivo, puntos, max_personas) values
                   ('${RUTA}', 'Peregrino', 'bares', 2, 15, 3);
                 select public.retos_evaluar('${RUTA}', '${uid(2)}');`),
      );
      const s = await leer(db, a);
      assert.equal(s.participacion.personas, 4);
      assert.equal(s.participacion.sellaron, 2);
      assert.equal(s.participacion.consumieron, 2);
      assert.equal(s.participacion.qr, 3);
      assert.equal(s.participacion.jugaron, 2);
      assert.equal(s.participacion.retos, 1, 'uid 2 sello los dos bares: reto conseguido');
      assert.equal(s.participacion.activos_30min >= 3, true, 'dos sellos recientes y los encuentros');
      assert.deepEqual(s.bares.map((b) => [b.nombre, b.sellos]), [['Uno', 2], ['Dos', 1]]);
      assert.equal(s.horas.reduce((n, h) => n + h.sellos, 0), 3);
      assert.equal(s.consumiciones.por_categoria.tercio, 2);
      assert.equal(s.consumiciones.por_categoria.sin_alcohol, 1);
      assert.deepEqual([s.consumiciones.total, s.consumiciones.puntuan, s.consumiciones.personas], [3, 2, 2]);
      assert.equal(s.consumiciones.por_categoria.vino, 0, 'todas las categorias salen, aunque sea con 0');
      assert.deepEqual(s.juegos, [{ juego: 'cana-perfecta', jugadores: 2, mejor: 95 }]);
      assert.deepEqual(s.retos.map((r) => [r.nombre, r.conseguidos, r.plazas]), [['Peregrino', 1, 3]]);
      assert.deepEqual(s.qr, { encuentros: 2, puntuan: 1 });
    });
  });

  it('una ruta vacia devuelve ceros y listas vacias', async () => {
    await conBase(async (db, a) => {
      const s = await leer(db, a, VACIA);
      assert.equal(s.participacion.personas, 0);
      assert.equal(s.participacion.jugaron, 0);
      assert.deepEqual([s.bares, s.horas, s.juegos, s.retos], [[], [], [], []]);
      assert.equal(s.consumiciones.total, 0);
      assert.equal(s.consumiciones.por_categoria.tercio, 0);
      assert.deepEqual(s.qr, { encuentros: 0, puntuan: 0 });
    });
  });

  it('solo admins, y la ruta tiene que existir', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await a.falla(() => db.query('select public.admin_estadisticas_actividad($1)', [RUTA]), /./);
      await a.como(ADMIN);
      await a.falla(() => db.query('select public.admin_estadisticas_actividad($1)', [uid(99)]), /ROUTE_NOT_FOUND/);
    });
  });
});
