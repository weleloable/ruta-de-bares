import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/** 0064: avisos en el movil (suscripciones, preferencias, cola y lo que la llena). */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0064_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-0000000000ad';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR1 = '00000000-0000-4000-8000-0000000000b1';
const BAR2 = '00000000-0000-4000-8000-0000000000b2';
const FOTO = '00000000-0000-4000-8000-0000000000b3';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * Ruta con un bar abierto que cierra en 10 min (BAR1), otro que abre en 5 min (BAR2, el ultimo en cerrar, que
 * cierra en 20 min) y una parada de foto que abre en 8 min. Persona1 y
 * Persona2 tienen avisos activados; Persona3 no tiene ningun dispositivo.
 */
const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date, sorteo_activo, sorteo_premio)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date, true, 'una camiseta');
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at, tipo) values
    ('${BAR1}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '10 minutes', 'bar'),
    ('${BAR2}', '${RUTA}', 1, 'Dos', 40.48, -3.36, now() + interval '5 minutes', now() + interval '20 minutes', 'bar'),
    ('${FOTO}', '${RUTA}', 2, 'La plaza', 40.48, -3.36, now() + interval '8 minutes', now() + interval '3 hours', 'foto');
  ${[1, 2, 3]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');`,
    )
    .join('\n')}
`;

async function conBase(fn: (db: PGlite, a: Actor) => Promise<void>) {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  try {
    await escenario(db, async (a) => {
      for (const n of [1, 2]) {
        await a.como(uid(n));
        await db.query('select public.push_guardar($1, $2, $3)', [`https://push.example.com/${n}`, 'p256dh-de-prueba', 'auth-prueba']);
      }
      await fn(db, a);
    });
  } finally {
    await db.close();
  }
}

type Fila = { user_id: string; tipo: string; titulo: string; cuerpo: string; url: string };
async function cola(db: PGlite, a: Actor): Promise<Fila[]> {
  let filas: Fila[] = [];
  await a.comoPostgres(async () => {
    filas = (await db.query<Fila>('select user_id, tipo, titulo, cuerpo, url from public.push_cola order by id')).rows;
  });
  return filas;
}

describe('0064: suscripciones y preferencias', () => {
  it('cada uno guarda su dispositivo y sus preferencias; nadie toca las tablas', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(1));
      const { rows } = await db.query<{ p: { paradas: boolean; sorteo: boolean; cana: boolean; dispositivos: number } }>(
        'select public.push_preferencias_leer() as p',
      );
      assert.deepEqual(rows[0]!.p, { paradas: true, sorteo: true, cana: true, dispositivos: 1 });
      await db.query('select public.push_preferencias_guardar(false, true, true)');
      const { rows: otra } = await db.query<{ p: { paradas: boolean } }>('select public.push_preferencias_leer() as p');
      assert.equal(otra[0]!.p.paradas, false);
      await a.falla(() => db.query('select * from public.push_suscripciones'), /permission denied/);
      await a.falla(() => db.query('select * from public.push_cola_reclamar(10)'), /permission denied/);
      await a.falla(() => db.query(`select public.push_guardar('http://inseguro', 'x', 'y')`), /INVALID_ENDPOINT/);
    });
  });

  it('si otra persona entra en el mismo movil, el dispositivo pasa a ser suyo', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(3));
      await db.query('select public.push_guardar($1, $2, $3)', ['https://push.example.com/1', 'p256dh-de-prueba', 'auth-prueba']);
      await a.comoPostgres(async () => {
        const { rows } = await db.query<{ user_id: string }>(`select user_id from public.push_suscripciones where endpoint = 'https://push.example.com/1'`);
        assert.equal(rows[0]!.user_id, uid(3));
      });
    });
  });
});

describe('0064: lo que avisa', () => {
  it('parada: 10 min antes, a quien tiene avisos, una sola vez y segun el tipo', async () => {
    await conBase(async (db, a) => {
      await a.como(uid(2));
      await db.query('select public.push_preferencias_guardar(false, true, true)');
      await a.comoPostgres(async () => {
        await db.query('select public.avisos_generar()');
        await db.query('select public.avisos_generar()');
      });
      const paradas = (await cola(db, a)).filter((f) => f.tipo === 'parada');
      // Solo Persona1: Persona2 los quito y Persona3 no tiene dispositivo.
      assert.deepEqual(paradas.map((f) => [f.user_id, f.titulo]), [
        [uid(1), '🍺 En 5 min abre Dos'],
        [uid(1), '📸 En 8 min: La plaza'],
      ]);
      assert.equal(paradas[0]!.cuerpo, 'Parada 2 de Ruta de prueba. ¡A por el sello!');
    });
  });

  it('ultimo bar: a quien le falta uno y aun llega, media hora antes de que cierre', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        // Persona1 lleva el Uno: le falta solo el Dos. Persona2 no lleva ninguno.
        await db.query(`insert into public.stamps (user_id, route_bar_id, lat, lng, distance_m) values ($1, $2, 40.48, -3.36, 5)`, [uid(1), BAR1]);
        await db.query('select public.avisos_generar()');
      });
      const ultimos = (await cola(db, a)).filter((f) => f.tipo === 'ultimo_bar');
      assert.deepEqual(ultimos.map((f) => [f.user_id, f.cuerpo]), [
        [uid(1), 'Sella Dos antes de que cierre y entras en el sorteo de una camiseta.'],
      ]);
    });
  });

  it('sorteo: a toda la ruta, con su texto para quien gana y los suplentes', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.query(`insert into public.sorteos (route_id, premio, ganador, suplentes, participantes) values ($1, 'una camiseta', $2, array[$3]::uuid[], 2)`, [
          RUTA,
          uid(1),
          uid(2),
        ]);
      });
      const sorteo = (await cola(db, a)).filter((f) => f.tipo === 'sorteo');
      assert.deepEqual(sorteo.map((f) => [f.user_id, f.titulo, f.cuerpo]), [
        [uid(1), '🎉 ¡Has ganado el sorteo!', 'Te llevas una camiseta. Busca a la organización.'],
        [uid(2), '🎽 Sorteo hecho: has quedado de suplente', 'Ha ganado Persona1. Si no aparece, te puede tocar a ti.'],
      ]);
    });
  });

  it('La Caña: conexion a quien no la provoco, y mensajes de uno en uno cada 5 min sin el texto', async () => {
    await conBase(async (db, a) => {
      const CONEXION = '00000000-0000-4000-8000-0000000000c1';
      await a.como(uid(2));
      await a.comoPostgres(async () => {
        // Como si Persona2 diera el Me gusta que la crea (auth.uid() = Persona2).
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid(2) })]);
        await db.query(`insert into public.match_connections (id, route_id, user_a, user_b) values ($1, $2, $3, $4)`, [CONEXION, RUTA, uid(1), uid(2)]);
        await db.query(`insert into public.match_connection_members (connection_id, user_id) values ($1, $2), ($1, $3)`, [CONEXION, uid(1), uid(2)]);
        await db.query(`insert into public.match_messages (connection_id, sender_id, kind, body) values ($1, $2, 'text', 'hola secreta')`, [CONEXION, uid(2)]);
        await db.query(`insert into public.match_messages (connection_id, sender_id, kind, body) values ($1, $2, 'text', 'otra')`, [CONEXION, uid(2)]);
      });
      const cana = (await cola(db, a)).filter((f) => f.tipo === 'cana');
      assert.deepEqual(cana.map((f) => [f.user_id, f.titulo, f.url]), [
        [uid(1), '🍻 ¡Nueva conexión en La Caña!', '/cana'],
        [uid(1), '💬 Persona2 te ha escrito', '/cana'],
      ]);
      assert.ok(cana.every((f) => !f.cuerpo.includes('secreta')), 'no se ensena el mensaje');
    });
  });
});

describe('0064: envio (lo que usa la Edge Function)', () => {
  it('reclamar da cada aviso con sus dispositivos una vez; el resultado los marca y limpia los caducados', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.query('select public.avisos_generar()');
        type R = { id: number; titulo: string; dispositivos: { endpoint: string }[] };
        const { rows } = await db.query<R>('select * from public.push_cola_reclamar(100)');
        assert.equal(rows.length, 4, 'dos paradas para cada una');
        assert.deepEqual(rows[0]!.dispositivos.map((d) => d.endpoint), ['https://push.example.com/1']);
        const { rows: otra } = await db.query<R>('select * from public.push_cola_reclamar(100)');
        assert.equal(otra.length, 0, 'lo reclamado no sale otra vez enseguida');
        await db.query('select public.push_cola_resultado($1::bigint[], $2::text[])', [[rows[0]!.id], ['https://push.example.com/1']]);
        const { rows: q } = await db.query<{ n: number }>('select count(*)::int as n from public.push_cola where enviada_at is not null');
        assert.equal(q[0]!.n, 1);
        const { rows: s } = await db.query<{ n: number }>('select count(*)::int as n from public.push_suscripciones');
        assert.equal(s[0]!.n, 1, 'el de Persona1 caduco y se borro');
      });
    });
  });

  it('descargar mis datos trae preferencias, dispositivos y avisos', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(async () => {
        await db.query('select public.avisos_generar()');
      });
      await a.como(uid(1));
      type D = { avisos: unknown; avisos_en_el_movil: { dispositivos: { servicio: string }[]; enviados: { titulo: string }[] } };
      const d = (await db.query<{ d: D }>('select public.export_my_data() as d')).rows[0]!.d;
      assert.deepEqual(d.avisos_en_el_movil.dispositivos.map((x) => x.servicio), ['push.example.com']);
      assert.equal(d.avisos_en_el_movil.enviados.length, 2);
      // 'avisos' sigue siendo lo de moderacion (una lista), no se pisa.
      assert.ok(Array.isArray(d.avisos));
    });
  });
});
