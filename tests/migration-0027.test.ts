import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0027: una ruta termina, y al borrarla se lleva sus datos.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. **borrar una ruta se lleva TODO lo del evento**: sellos (con su GPS),
 *     participantes, invitaciones, conexiones y chats, votos, denuncias, el
 *     veto de ruta con su HMAC y el veto de cana. Esa es la purga, y no hace
 *     falta ni cron ni funcion nueva porque el esquema ya lo cascadea;
 *  2. lo que NO debe morir con una ruta: la suspension de cuenta (es de la
 *     persona, no del evento) y el registro de moderacion;
 *  3. no se puede publicar una ruta sin fecha, o no termina nunca y se escapa
 *     del aviso;
 *  4. `finished_at` existe y se puede poner, para terminarla a mano.
 */

const nombres = [
  '0001_init.sql',
  '0002_guard_role_sql_editor.sql',
  '0003_nombre_unico.sql',
  '0004_invitaciones_por_ruta.sql',
  '0005_tirate_una_cana.sql',
  '0006_cana_visto.sql',
  '0007_avatar_miniatura.sql',
  '0008_cana_solo_la_pregunta.sql',
  '0009_cana_bloqueos_denuncias.sql',
  '0010_cana_consentimiento_y_datos.sql',
  '0011_cana_chat_sin_abrir.sql',
  '0012_cana_pertenencia_real.sql',
  '0013_cana_alertas_admin.sql',
  '0014_admin_expulsar_de_ruta.sql',
  '0015_vetos_y_avisos.sql',
  '0016_denunciar_exige_estar_dentro.sql',
  '0017_el_rastro_sobrevive.sql',
  '0018_lista_de_moderaciones.sql',
  '0019_activar_la_cana_arreglado.sql',
  '0020_foto_perfil_con_revision.sql',
  '0021_borrar_mi_cuenta.sql',
  '0022_sin_truncate.sql',
  '0023_bucket_de_fotos_privado.sql',
  '0024_veto_de_cana_con_hmac.sql',
  '0025_exportar_todos_mis_datos.sql',
  '0026_canal_de_contacto.sql',
  '0027_rutas_terminadas.sql',
];
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const m0027 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR = '00000000-0000-4000-8000-0000000000b1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
    values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date - 10);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at)
    values ('${BAR}', '${RUTA}', 0, 'Bar Manolo', 42.88, -8.54,
            now() - interval '1 hour', now() + interval '5 hours');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
  insert into public.route_invites (route_id, token, max_uses, created_by, expires_at)
    values ('${RUTA}', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 10, '${ADMIN}', now() + interval '8 hours');
`;

/** Deja la ruta con datos de todo tipo: sellos, cana, denuncia y dos vetos. */
async function llenarLaRuta(db: PGlite, a: Actor) {
  await a.como(ANA);
  await db.query(`select public.claim_stamp($1, 42.88, -8.54)`, [BAR]);
  await db.query(`select public.match_activate(true, 'A', null, '2026-09-18')`);
  await a.como(LUIS);
  await db.query(`select public.match_activate(true, 'B', null, '2026-09-18')`);
  await db.query(`select public.match_set_like($1, $2, true)`, [RUTA, ANA]);
  await a.como(ANA);
  await db.query(`select public.match_set_like($1, $2, true)`, [RUTA, LUIS]);
  await a.como(LUIS);
  const { rows } = await db.query<{ id: string }>(
    `select public.match_report($1, $2, 'acoso', 'Se pasa', null, false) as id`,
    [RUTA, ANA],
  );
  // Los dos vetos que tienen que morir con la ruta, con sus HMAC.
  await a.como(ADMIN);
  await db.query(`select public.match_admin_deactivate($1, 'Acoso', $2)`, [ANA, rows[0]?.id]);
  await db.query(`select public.match_admin_remove_from_route($1, $2, 'Acoso')`, [ANA, RUTA]);
}

const rastro = async (db: PGlite, a: Actor) =>
  (await a.comoPostgres(
    async () => (await db.query<{ r: Record<string, number> }>(`select public.rastro_de_ruta($1) as r`, [RUTA])).rows[0]?.r,
  )) as Record<string, number>;

describe('0027: borrar la ruta es la purga', () => {
  it('antes de borrar hay de todo, o el test no prueba nada', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await llenarLaRuta(db, a);
      const antes = await rastro(db, a);
      for (const [que, cuantos] of Object.entries(antes)) {
        assert.ok(cuantos > 0, `no se sembro nada en "${que}", el test no probaria su borrado`);
      }
    });
    await db.close();
  });

  it('EL CASO: borrar la ruta se lo lleva todo, incluidos los HMAC', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await llenarLaRuta(db, a);
      await a.como(ADMIN);
      await db.query(`delete from public.routes where id = $1`, [RUTA]);

      const despues = await rastro(db, a);
      for (const [que, cuantos] of Object.entries(despues)) {
        assert.equal(cuantos, 0, `queda "${que}" despues de borrar la ruta`);
      }
      // Y los HMAC se han ido con sus vetos: es lo que hace defendible guardarlos.
      const hmacs = await a.comoPostgres(
        async () =>
          (
            await db.query<{ n: number }>(
              `select (select count(*) from public.route_bans) + (select count(*) from public.cana_bans) as n`,
            )
          ).rows[0]?.n,
      );
      assert.equal(hmacs, 0);
    });
    await db.close();
  });

  it('los sellos y su GPS se van con la ruta', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`select public.claim_stamp($1, 42.88, -8.54)`, [BAR]);
      await a.como(ADMIN);
      await db.query(`delete from public.routes where id = $1`, [RUTA]);
      const n = await a.comoPostgres(
        async () => (await db.query<{ n: number }>(`select count(*)::int as n from public.stamps`)).rows[0]?.n,
      );
      assert.equal(n, 0, 'el GPS de los sellos no puede sobrevivir al evento');
    });
    await db.close();
  });

  it('lo que NO muere con una ruta: la suspension de cuenta', async () => {
    // No es de un evento, es de la persona.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_suspend($1, 'Acoso grave')`, [ANA]);
      await db.query(`delete from public.routes where id = $1`, [RUTA]);
      const sigue = await a.comoPostgres(
        async () =>
          (await db.query<{ v: boolean }>(`select public.esta_suspendida($1) as v`, [ANA])).rows[0]?.v,
      );
      assert.equal(sigue, true);
    });
    await db.close();
  });

  it('ni el registro de moderacion, que es el historial de quien organiza', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await llenarLaRuta(db, a);
      await a.como(ADMIN);
      await db.query(`delete from public.routes where id = $1`, [RUTA]);
      const n = await a.comoPostgres(
        async () =>
          (await db.query<{ n: number }>(`select count(*)::int as n from public.match_moderation_log`)).rows[0]?.n,
      );
      assert.ok((n ?? 0) > 0, 'el registro de moderacion no es del evento');
    });
    await db.close();
  });

  it('nada bloquea el borrado: ninguna clave ajena es NO ACTION', async () => {
    // Si alguna lo fuera, borrar la ruta fallaria y la purga entera se cae.
    const db = await crearBase(migraciones);
    const { rows } = await db.query<{ t: string }>(`
      select conrelid::regclass::text as t
        from pg_constraint
       where contype = 'f' and confrelid = 'public.routes'::regclass and confdeltype not in ('c', 'n')
    `);
    assert.deepEqual(rows, []);
    await db.close();
  });
});

describe('0027: una ruta publicada tiene fecha', () => {
  it('publicar sin fecha se rechaza', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.comoPostgres(async () => {
        await db.exec(`insert into public.routes (id, name, is_published, created_by)
                       values ('00000000-0000-4000-8000-0000000000f9', 'Sin fecha', false, '${ADMIN}')`);
      });
      await a.falla(
        () =>
          db.exec(`update public.routes set is_published = true
                    where id = '00000000-0000-4000-8000-0000000000f9'`),
        /routes_publicada_con_fecha/,
      );
    });
    await db.close();
  });

  it('un borrador si puede estar sin fecha: todavia se esta montando', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await db.exec(`insert into public.routes (name, is_published, created_by) values ('Borrador', false, '${ADMIN}')`);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.routes where event_date is null`,
    );
    assert.equal(rows[0]?.n, 1);
    await db.close();
  });

  it('la restriccion es NOT VALID: no rompe un proyecto que ya este en marcha', async () => {
    const { rows } = await (await crearBase(migraciones)).query<{ v: boolean }>(
      `select convalidated as v from pg_constraint where conname = 'routes_publicada_con_fecha'`,
    );
    assert.equal(rows[0]?.v, false, 'validada rompe al aplicarla si hay publicadas sin fecha');
  });
});

describe('0027: terminar a mano', () => {
  it('finished_at existe, empieza vacio y un admin lo puede poner', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const antes = await db.query<{ f: string | null }>(`select finished_at as f from public.routes where id = $1`, [RUTA]);
      assert.equal(antes.rows[0]?.f, null, 'lo normal es que se deduzca, no que se guarde');
      await db.query(`update public.routes set finished_at = now() where id = $1`, [RUTA]);
      const despues = await db.query<{ f: string | null }>(`select finished_at as f from public.routes where id = $1`, [RUTA]);
      assert.ok(despues.rows[0]?.f);
    });
    await db.close();
  });

  it('quien no es admin no puede terminar una ruta', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await db.query(`update public.routes set finished_at = now() where id = $1`, [RUTA]);
      const f = await a.comoPostgres(
        async () =>
          (await db.query<{ f: string | null }>(`select finished_at as f from public.routes where id = $1`, [RUTA]))
            .rows[0]?.f,
      );
      assert.equal(f, null, 'la policy routes_write es solo para admins');
    });
    await db.close();
  });

  it('se puede re-ejecutar', async () => {
    const db = await crearBase([...migraciones, m0027]);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
        where table_name = 'routes' and column_name = 'finished_at'`,
    );
    assert.equal(rows[0]?.n, 1);
    await db.close();
  });
});
