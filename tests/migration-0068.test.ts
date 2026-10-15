import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0068: pantalla de Usuarios para admins.
 *
 *  1. solo un admin ve la lista, y con el correo (busca por nombre o correo);
 *  2. sellar a mano se salta horario y radio, NO la pertenencia ni el tipo de
 *     parada, exige motivo, apunta quien y por que, y da los puntos del sello;
 *  3. borrar una cuenta: no a un admin, no a una misma, exige motivo, deja
 *     registro sin el correo y se lleva la cuenta entera;
 *  4. nada de esto lo puede llamar un jugador ni alguien sin sesion.
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => f <= '0068_zzz');
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const ADMIN_B = '00000000-0000-4000-8000-00000000000b';
const PEPA = '00000000-0000-4000-8000-00000000000c';
const FUERA = '00000000-0000-4000-8000-00000000000d';
const UNO = '00000000-0000-4000-8000-00000000000e';
const DOS = '00000000-0000-4000-8000-00000000000f';
const OCULTA = '00000000-0000-4000-8000-0000000000f2';
const BAR_OCULTO = '00000000-0000-4000-8000-0000000000b3';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const CERRADO = '00000000-0000-4000-8000-0000000000b1';
const FOTO = '00000000-0000-4000-8000-0000000000b2';

const DATOS = `
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN}', 'admin@example.com', '{"display_name":"Jefa"}'),
    ('${ADMIN_B}', 'otra@example.com', '{"display_name":"Otra"}'),
    ('${PEPA}', 'pepa.garcia@example.com', '{"display_name":"Pepa"}'),
    ('${FUERA}', 'fuera@example.com', '{"display_name":"Fuera"}');
  update public.profiles set role = 'admin' where id in ('${ADMIN}', '${ADMIN_B}');
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta', true, '${ADMIN}', current_date);
  -- Un bar que cerro hace horas y lejos de todo: claim_stamp diria TOO_LATE.
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at, tipo) values
    ('${CERRADO}', '${RUTA}', 0, 'Cerrado', 40.48, -3.36, now() - interval '6 hours', now() - interval '3 hours', 'bar'),
    ('${FOTO}', '${RUTA}', 1, 'Foto', 40.48, -3.36, now() - interval '6 hours', now() - interval '3 hours', 'foto');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${PEPA}');
  -- Ruta sin publicar, con Pepa dentro: claim_stamp no deja y esto tampoco.
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${OCULTA}', 'Oculta', false, '${ADMIN}', current_date + 30);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at, tipo) values
    ('${BAR_OCULTO}', '${OCULTA}', 0, 'Oculto', 40.48, -3.36, now() + interval '30 days', now() + interval '31 days', 'bar');
  insert into public.route_members (route_id, user_id) values ('${OCULTA}', '${PEPA}');
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

type Usuario = { user_id: string; nombre: string; email: string; rol: string; rutas: number };
const usuarios = async (db: PGlite, q: string | null) =>
  (await db.query<Usuario>('select * from public.admin_usuarios($1)', [q])).rows;

describe('0068: la lista de usuarios', () => {
  it('un admin ve a todo el mundo con su correo', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      const todos = await usuarios(db, null);
      assert.equal(todos.length, 4);
      const pepa = todos.find((u) => u.user_id === PEPA);
      assert.equal(pepa?.email, 'pepa.garcia@example.com');
      assert.equal(pepa?.rutas, 2);
    });
  });

  it('busca por nombre y por correo', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      assert.deepEqual((await usuarios(db, 'pep')).map((u) => u.user_id), [PEPA]);
      assert.deepEqual((await usuarios(db, 'garcia@')).map((u) => u.user_id), [PEPA]);
      assert.equal((await usuarios(db, '  ')).length, 4);
    });
  });

  it('un jugador no la ve, ni sin sesion', async () => {
    await conBase(async (db, a) => {
      await a.como(PEPA);
      await a.falla(() => usuarios(db, null), 'NOT_ADMIN');
      await a.anonimo();
      await a.falla(() => usuarios(db, null), /permission denied/);
    });
  });
});

describe('0068: sellar a mano', () => {
  const sellar = (db: PGlite, uid: string, bar: string, motivo: string) =>
    db.query<{ id: string; sellado_por: string; sellado_motivo: string; distance_m: number }>(
      'select * from public.admin_sellar($1, $2, $3)',
      [uid, bar, motivo],
    );

  it('sella fuera de horario y sin posicion, apunta quien y por que, y da los puntos', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      const { rows } = await sellar(db, PEPA, CERRADO, 'Se quedo sin bateria');
      assert.equal(rows[0].sellado_por, ADMIN);
      assert.equal(rows[0].sellado_motivo, 'Se quedo sin bateria');
      assert.equal(rows[0].distance_m, 0);
      const puntos = await a.comoPostgres(() =>
        db.query<{ n: number }>(`select count(*)::int as n from public.point_movements where ref = 'sello:' || $1`, [rows[0].id]),
      );
      assert.equal(puntos.rows[0].n, 1, 'el sello a mano puntua como uno normal');
      const s = await db.query<{ sellado_por: string; bar: string; route_id: string }>(
        'select * from public.admin_usuario_sellos($1)',
        [PEPA],
      );
      const deRuta = s.rows.filter((r) => r.route_id === RUTA);
      assert.equal(deRuta.length, 1, 'solo la parada de tipo bar');
      assert.equal(deRuta[0].sellado_por, 'Jefa');
    });
  });

  it('dos veces devuelve el mismo sello, no duplica', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      const uno = (await sellar(db, PEPA, CERRADO, 'Sin bateria')).rows[0].id;
      await a.como(ADMIN_B);
      const dos = (await sellar(db, PEPA, CERRADO, 'Otra vez')).rows[0].id;
      assert.equal(uno, dos);
    });
  });

  it('no a quien no esta en la ruta, no una parada de foto, y con motivo', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await a.falla(() => sellar(db, FUERA, CERRADO, 'Porque si'), 'NOT_A_MEMBER');
      await a.falla(() => sellar(db, PEPA, FOTO, 'Porque si'), 'NOT_STAMPABLE');
      await a.falla(() => sellar(db, PEPA, CERRADO, ' a '), 'REASON_REQUIRED');
    });
  });

  it('un admin no se sella a si mismo, ni en una ruta sin publicar', async () => {
    await conBase(async (db, a) => {
      await a.comoPostgres(() => db.query(`insert into public.route_members (route_id, user_id) values ($1, $2)`, [RUTA, ADMIN]));
      await a.como(ADMIN);
      await a.falla(() => sellar(db, ADMIN, CERRADO, 'Me lo merezco'), 'SELF');
      await a.falla(() => sellar(db, PEPA, BAR_OCULTO, 'Antes de tiempo'), 'ROUTE_NOT_PUBLISHED');
    });
  });

  it('un sello a mano no crea una racha que no paso', async () => {
    await conBase(async (db, a) => {
      // Dos de Mahou sellaron de verdad; Pepa (Mahou) llega horas despues a mano.
      await a.comoPostgres(async () => {
        await db.exec(`
          insert into auth.users (id, email) values ('${UNO}', 'uno@example.com'), ('${DOS}', 'dos@example.com');
          insert into public.route_members (route_id, user_id) values ('${RUTA}', '${UNO}'), ('${RUTA}', '${DOS}');
          insert into public.user_houses (user_id, house) values ('${UNO}', 'mahou'), ('${DOS}', 'mahou'), ('${PEPA}', 'mahou')
            on conflict (user_id) do update set house = excluded.house;
          insert into public.stamps (user_id, route_bar_id, stamped_at, lat, lng, distance_m) values
            ('${UNO}', '${CERRADO}', now() - interval '5 hours', 40.48, -3.36, 1),
            ('${DOS}', '${CERRADO}', now() - interval '5 hours' + interval '1 minute', 40.48, -3.36, 1);
        `);
      });
      await a.como(ADMIN);
      await sellar(db, PEPA, CERRADO, 'Sin bateria');
      const rachas = await a.comoPostgres(() =>
        db.query<{ n: number }>(`select count(*)::int as n from public.point_movements where action = 'racha'`),
      );
      assert.equal(rachas.rows[0].n, 0);
    });
  });

  it('un jugador no se sella a si mismo por aqui', async () => {
    await conBase(async (db, a) => {
      await a.como(PEPA);
      await a.falla(() => sellar(db, PEPA, CERRADO, 'Yo lo valgo'), 'NOT_ADMIN');
    });
  });
});

describe('0068: la ficha de una cuenta', () => {
  it('trae una sola cuenta con su correo, y NOT_FOUND si ya no existe', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      const { rows } = await db.query<Usuario>('select * from public.admin_usuario($1)', [PEPA]);
      assert.deepEqual(rows.map((u) => [u.nombre, u.email]), [['Pepa', 'pepa.garcia@example.com']]);
      await db.query('select public.admin_borrar_cuenta($1, $2)', [PEPA, 'Cuenta de prueba']);
      await a.falla(() => db.query('select * from public.admin_usuario($1)', [PEPA]), 'NOT_FOUND');
      await a.como(FUERA);
      await a.falla(() => db.query('select * from public.admin_usuario($1)', [FUERA]), 'NOT_ADMIN');
    });
  });
});

describe('0068: borrar una cuenta', () => {
  const borrar = (db: PGlite, uid: string, motivo: string) =>
    db.query('select public.admin_borrar_cuenta($1, $2)', [uid, motivo]);

  it('se lleva la cuenta y deja registro con el nombre, sin el correo', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await sellar0(db, PEPA);
      await borrar(db, PEPA, 'Cuenta de prueba');
      const queda = await a.comoPostgres(() =>
        db.query<{ n: number }>(
          `select (select count(*) from auth.users where id = $1)
                + (select count(*) from public.profiles where id = $1)
                + (select count(*) from public.route_members where user_id = $1)
                + (select count(*) from public.stamps where user_id = $1) as n`,
          [PEPA],
        ),
      );
      assert.equal(Number(queda.rows[0].n), 0);
      const lista = await db.query<{ nombre: string; motivo: string; por: string }>(
        'select * from public.admin_cuentas_borradas_lista()',
      );
      assert.deepEqual(
        lista.rows.map((r) => [r.nombre, r.motivo, r.por]),
        [['Pepa', 'Cuenta de prueba', 'Jefa']],
      );
      const columnas = await a.comoPostgres(() =>
        db.query<{ column_name: string }>(
          `select column_name from information_schema.columns where table_name = 'admin_cuentas_borradas'`,
        ),
      );
      assert.ok(!columnas.rows.some((c) => /mail/i.test(c.column_name)), 'el registro no guarda el correo');
    });
  });

  it('no a un admin, no a una misma, con motivo y que exista', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await a.falla(() => borrar(db, ADMIN_B, 'Porque si'), 'TARGET_IS_ADMIN');
      await a.falla(() => borrar(db, ADMIN, 'Porque si'), 'SELF');
      await a.falla(() => borrar(db, PEPA, ''), 'REASON_REQUIRED');
      await a.falla(() => borrar(db, '00000000-0000-4000-8000-000000000999', 'Porque si'), 'NOT_FOUND');
    });
  });

  it('un jugador no borra a nadie, ni sin sesion', async () => {
    await conBase(async (db, a) => {
      await a.como(PEPA);
      await a.falla(() => borrar(db, FUERA, 'Porque si'), 'NOT_ADMIN');
      await a.anonimo();
      await a.falla(() => borrar(db, FUERA, 'Porque si'), /permission denied/);
    });
  });

  it('el registro no se lee directamente', async () => {
    await conBase(async (db, a) => {
      await a.como(ADMIN);
      await a.falla(() => db.query('select * from public.admin_cuentas_borradas'), /permission denied/);
    });
  });
});

async function sellar0(db: PGlite, uid: string) {
  await db.query('select public.admin_sellar($1, $2, $3)', [uid, CERRADO, 'Para el test']);
}
