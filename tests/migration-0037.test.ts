import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { crearBase, escenario, leerFichero } from './pglite-supabase.ts';

/**
 * 0037: estadisticas de una ruta para los admins.
 *
 * Lo que se asegura sobre Postgres real:
 *  1. cada cifra cuenta lo que dice, y SOLO de esa ruta (otra ruta con datos
 *     al lado no se cuela);
 *  2. solo admins; una ruta que no existe se dice;
 *  3. y lo que mas importa: la respuesta no lleva NADA por persona. Ni un id de
 *     usuario: la politica promete que a quien das Me gusta no lo ve nadie,
 *     tampoco quien organiza.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const migraciones = readdirSync(join(raiz, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && f < '0038')
  .sort()
  .map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-00000000000d';
const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const EVA = '00000000-0000-4000-8000-00000000000c';
const FUERA = '00000000-0000-4000-8000-00000000000f';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA = '00000000-0000-4000-8000-0000000000f2';
const BAR1 = '00000000-0000-4000-8000-0000000000b1';
const BAR2 = '00000000-0000-4000-8000-0000000000b2';
const BAR_OTRA = '00000000-0000-4000-8000-0000000000b3';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ADMIN}', 'admin@example.com'), ('${ANA}', 'ana@example.com'), ('${LUIS}', 'luis@example.com'),
    ('${EVA}', 'eva@example.com'), ('${FUERA}', 'fuera@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date) values
    ('${RUTA}', 'La ruta', true, '${ADMIN}', current_date),
    ('${OTRA}', 'Otra', true, '${ADMIN}', current_date);
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'), ('${RUTA}', '${EVA}'),
    ('${OTRA}', '${ANA}'), ('${OTRA}', '${FUERA}');
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR1}', '${RUTA}', 1, 'Bar 1', 40, -3, now() - interval '1 hour', now() + interval '1 hour'),
    ('${BAR2}', '${RUTA}', 2, 'Bar 2', 40, -3, now() - interval '1 hour', now() + interval '1 hour'),
    ('${BAR_OTRA}', '${OTRA}', 1, 'Bar de otra', 40, -3, now() - interval '1 hour', now() + interval '1 hour');
  -- Ana completa la ruta; Luis sella uno; Eva nada. En la otra ruta, uno mas.
  insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m) values
    ('${ANA}', '${BAR1}', 40, -3, 5), ('${ANA}', '${BAR2}', 40, -3, 5), ('${LUIS}', '${BAR1}', 40, -3, 5),
    ('${FUERA}', '${BAR_OTRA}', 40, -3, 5);

  -- La Cana: Ana y Luis la tienen activada, Eva no. Fuera (otra ruta) tambien.
  -- Eva la tiene APAGADA ahora: no cuenta en activada, aunque la activase en su dia.
  insert into public.match_profiles (user_id, is_active, first_activated_at) values
    ('${ANA}', true, now()), ('${LUIS}', true, now()), ('${EVA}', false, now()), ('${FUERA}', true, now());
  insert into public.match_votes (route_id, voter_id, target_id, value) values
    ('${RUTA}', '${ANA}', '${LUIS}', 'like'), ('${RUTA}', '${LUIS}', '${ANA}', 'like'),
    ('${RUTA}', '${ANA}', '${EVA}', 'like'), ('${RUTA}', '${LUIS}', '${EVA}', 'seen'),
    ('${OTRA}', '${FUERA}', '${ANA}', 'like');
  insert into public.match_connections (route_id, user_a, user_b, is_open, question_state, question_asked_by) values
    ('${RUTA}', '${ANA}', '${LUIS}', true, 'accepted', '${ANA}'),
    ('${RUTA}', '${ANA}', '${EVA}', false, 'none', null),
    ('${RUTA}', '${LUIS}', '${EVA}', true, 'postponed', '${LUIS}'),
    ('${OTRA}', '${ANA}', '${FUERA}', true, 'accepted', '${FUERA}');
  insert into public.match_profile_tags (user_id, tag_id) values
    ('${ANA}', 'etiqueta-1'), ('${ANA}', 'etiqueta-2'), ('${LUIS}', 'etiqueta-1'),
    ('${EVA}', 'etiqueta-3'), ('${FUERA}', 'etiqueta-4');

  -- Moderacion: dos denuncias (una cerrada) y dos vetos en esta ruta.
  insert into public.match_reports (reporter_id, reported_id, route_id, reason, status) values
    ('${ANA}', '${LUIS}', '${RUTA}', 'otro', 'pendiente'),
    ('${LUIS}', '${ANA}', '${RUTA}', 'otro', 'resuelta'),
    ('${ANA}', '${FUERA}', '${OTRA}', 'otro', 'pendiente');
  insert into public.route_bans (route_id, user_id, reason) values ('${RUTA}', '${FUERA}', 'motivo');
  insert into public.cana_bans (user_id, reason, route_id) values ('${FUERA}', 'motivo', '${RUTA}');
`;

type Estadisticas = {
  ruta: Record<string, number>;
  cana: Record<string, number>;
  etiquetas: { etiqueta: string; veces: number }[];
  moderacion: Record<string, number>;
};

async function leer(ruta = RUTA) {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  let res: Estadisticas | undefined;
  await escenario(db, async (a) => {
    await a.como(ADMIN);
    const { rows } = await db.query<{ e: Estadisticas }>('select public.admin_estadisticas_ruta($1) as e', [ruta]);
    res = rows[0]?.e;
  });
  await db.close();
  return res as Estadisticas;
}

describe('0037: estadisticas de una ruta', () => {
  it('la ruta: personas, sellos, quien sello y quien la completo', async () => {
    const e = await leer();
    assert.deepEqual(e.ruta, { personas: 3, bares: 2, sellos: 3, han_sellado: 2, completaron: 1 });
  });

  it('La Caña: solo esta ruta, aunque la misma persona este en otra', async () => {
    const e = await leer();
    assert.deepEqual(e.cana, { activada: 2, me_gusta: 3, conexiones: 3, conexiones_abiertas: 2, preguntas: 2, si: 1 });
  });

  it('etiquetas: las de la gente de la ruta con La Caña activada, de mas a menos', async () => {
    const e = await leer();
    // etiqueta-3 es de Eva, que la tiene apagada; etiqueta-4, de alguien de otra ruta.
    assert.deepEqual(
      e.etiquetas.map((x) => x.veces),
      [2, 1],
    );
    assert.equal(e.etiquetas.length, 2);
  });

  it('moderacion: denuncias (y cuantas siguen abiertas) y vetos de esta ruta', async () => {
    const e = await leer();
    assert.deepEqual(e.moderacion, { denuncias: 2, denuncias_sin_cerrar: 1, vetos: 2 });
  });

  it('NADA por persona: la respuesta no lleva el id de nadie', async () => {
    const e = await leer();
    const texto = JSON.stringify(e);
    for (const uid of [ANA, LUIS, EVA, FUERA, ADMIN]) assert.ok(!texto.includes(uid), `sale ${uid}`);
    assert.doesNotMatch(texto, /[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('solo admins, y una ruta que no existe se dice', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(() => db.query('select public.admin_estadisticas_ruta($1)', [RUTA]), 'NOT_ADMIN');
      await a.como(ADMIN);
      await a.falla(
        () => db.query('select public.admin_estadisticas_ruta($1)', ['00000000-0000-4000-8000-000000000999']),
        'ROUTE_NOT_FOUND',
      );
    });
    await db.close();
  });

  it('una ruta sin bares no se "completa"', async () => {
    const e = await leer(OTRA);
    assert.equal(e.ruta.bares, 1);
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await db.exec(`delete from public.route_bars where route_id = '${OTRA}'`);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const { rows } = await db.query<{ e: Estadisticas }>('select public.admin_estadisticas_ruta($1) as e', [OTRA]);
      assert.equal(rows[0]?.e.ruta.completaron, 0);
    });
    await db.close();
  });
});
