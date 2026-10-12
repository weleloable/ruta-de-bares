import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/** 0063: aviso de politica nueva (version vista) y sacar a alguien del sorteo. */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0063_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = '00000000-0000-4000-8000-0000000000b1';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date, sorteo_activo, sorteo_premio)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date, true, 'una camiseta');
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at)
  values ('${BAR}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');
              insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m) values ('${uid(n)}', '${BAR}', 40.48, -3.36, 5);`,
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

describe('0063: aviso de politica', () => {
  it('cada uno marca la version que ha visto (solo la suya)', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      await db.query(`select public.politica_marcar_vista('2026-10-12')`);
      const { rows } = await db.query<{ politica_vista: string | null }>('select politica_vista from public.profiles where id = $1', [uid(1)]);
      assert.equal(rows[0]?.politica_vista, '2026-10-12');
      await a.comoPostgres(async () => {
        const { rows: otra } = await db.query<{ politica_vista: string | null }>('select politica_vista from public.profiles where id = $1', [uid(2)]);
        assert.equal(otra[0]?.politica_vista, null);
      });
    });
  });
});

describe('0063: salir del sorteo', () => {
  it('un admin saca a alguien: ya no entra, se le dice, y se le puede volver a meter', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await db.query(`select public.sorteo_excluir($1, $2, null)`, [RUTA, uid(1)]);
      const { rows: personas } = await db.query<{ nombre: string; completa: boolean; excluido: boolean; motivo: string | null }>(
        'select * from public.sorteo_personas($1)',
        [RUTA],
      );
      assert.deepEqual(personas.map((p) => [p.nombre, p.completa, p.excluido]), [['Persona1', true, true], ['Persona2', true, false]]);
      assert.equal(personas[0]?.motivo, 'Pidió no participar');

      await a.como(uid(1));
      const { rows: yo } = await db.query<{ r: { dentro: boolean; excluido: boolean; participantes: number } }>('select public.sorteo_estado($1) as r', [RUTA]);
      assert.deepEqual([yo[0]!.r.dentro, yo[0]!.r.excluido, yo[0]!.r.participantes], [false, true, 1]);

      await a.como(ADMIN);
      const { rows: tirada } = await db.query<{ r: { ganador: string } }>('select public.sorteo_realizar($1) as r', [RUTA]);
      assert.equal(tirada[0]!.r.ganador, 'Persona2', 'la unica que entra');

      await db.query(`select public.sorteo_incluir($1, $2)`, [RUTA, uid(1)]);
      await a.como(uid(1));
      const { rows: otra } = await db.query<{ r: { dentro: boolean } }>('select public.sorteo_estado($1) as r', [RUTA]);
      assert.equal(otra[0]!.r.dentro, true);
    });
  });

  it('solo admins, y solo gente de la ruta; queda en la descarga de datos', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(2));
      await a.falla(() => db.query(`select public.sorteo_excluir($1, $2)`, [RUTA, uid(1)]), /FORBIDDEN/);
      await a.como(ADMIN);
      await a.falla(() => db.query(`select public.sorteo_excluir($1, $2)`, [RUTA, uid(9)]), /NOT_FOUND/);
      await db.query(`select public.sorteo_excluir($1, $2, 'Lo pidió por correo')`, [RUTA, uid(1)]);
      await a.como(uid(1));
      const { rows } = await db.query<{ d: { sorteos_sin_participar: { motivo: string }[] } }>('select public.export_my_data() as d');
      assert.deepEqual(rows[0]!.d.sorteos_sin_participar.map((s) => s.motivo), ['Lo pidió por correo']);
    });
  });
});
