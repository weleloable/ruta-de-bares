import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0017: el rastro de moderacion sobrevive a que se borre la cuenta.
 *
 * Lo que hay que asegurar sobre Postgres real: que borrarse la cuenta ya no
 * limpia la suspension, ni el registro, ni las denuncias, ni las pruebas
 * copiadas; que el panel las sigue leyendo con el nombre de entonces; y que un
 * veto se puede levantar aunque la persona haya vuelto con otra cuenta.
 */

const migraciones = [
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
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0017 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
/** Luis se borra la cuenta y vuelve con el mismo correo. */
const LUIS2 = '00000000-0000-4000-8000-00000000000f';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;

async function activar(db: PGlite, a: Actor, ...uids: string[]) {
  for (const uid of uids) {
    await a.como(uid);
    await db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);
  }
}

/** Ana denuncia a Luis llevandose lo que Luis escribio. */
async function denunciaConPruebas(db: PGlite, a: Actor): Promise<string> {
  await a.como(ANA);
  await db.query('select * from public.match_set_like($1, $2, true)', [RUTA, LUIS]);
  await a.como(LUIS);
  const [c] = await filas(db, 'select * from public.match_set_like($1, $2, true)', [RUTA, ANA]);
  const conexion = c.connection_id as string;
  await db.query('select * from public.match_ask_beer($1)', [conexion]);
  await a.como(ANA);
  await db.query(`select * from public.match_answer_beer($1, 'yes')`, [conexion]);
  await a.como(LUIS);
  await db.query('select * from public.match_send_text($1, $2)', [conexion, 'Un mensaje que molesta']);
  await a.como(ANA);
  const [fila] = await filas(
    db,
    `select public.match_report($1, $2, 'acoso', 'Se puso pesado', $3, false) as id`,
    [RUTA, LUIS, conexion],
  );
  return fila.id as string;
}

/** Borra la cuenta de Luis y la vuelve a crear con el mismo correo. */
async function seBorraYVuelve(db: PGlite, a: Actor) {
  await a.comoPostgres(async () => {
    await db.query('delete from auth.users where id = $1', [LUIS]);
    await db.query(`insert into auth.users (id, email) values ($1, 'luis@example.com')`, [LUIS2]);
  });
}

describe('0017: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0017);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0017);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('los triggers de nombres no se le conceden a nadie', () => {
    assert.match(
      m0017.replace(/--.*$/gm, ''),
      /revoke all on function\s+public\.match_log_nombres\(\),\s+public\.match_report_nombres\(\)\s+from public, anon, authenticated;/,
    );
  });
});

describe('0017: borrarse la cuenta ya no limpia el expediente', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('la denuncia y sus pruebas se quedan, con el nombre de entonces', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaConPruebas(db, a);
      await seBorraYVuelve(db, a);

      await a.como(ADMIN);
      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [denuncia]);
      assert.ok(ticket, 'la denuncia sigue existiendo');
      assert.equal(ticket.reported_name, 'luis', 'con el nombre que tenia al denunciarla');
      assert.equal(ticket.reported_id, null, 'pero sin apuntar a una cuenta que ya no existe');
      assert.equal(Number(ticket.mensajes), 2, 'las pruebas copiadas siguen ahi');

      const bandeja = await filas(db, 'select * from public.match_admin_reports()');
      assert.equal(bandeja.length, 1, 'y la bandeja la sigue listando');
    });
  });

  it('el registro de moderacion se queda, con quien lo hizo y sobre quien', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, 'Acoso']);
      await seBorraYVuelve(db, a);
      await a.comoPostgres(async () => {
        const apuntes = await filas(
          db,
          `select action, admin_name, target_name, target_id from public.match_moderation_log where action = 'expulsada_de_ruta'`,
        );
        assert.equal(apuntes.length, 1, 'el apunte no se va con la cuenta');
        assert.equal(apuntes[0].target_name, 'luis');
        assert.equal(apuntes[0].admin_name, 'admin');
        assert.equal(apuntes[0].target_id, null);
      });
    });
  });

  it('la suspension aguanta: se borra la cuenta, vuelve, y sigue suspendida', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Acoso grave']);
      await seBorraYVuelve(db, a);
      // esta_suspendida es interna (no se le concede a la app): se mira como postgres.
      await a.comoPostgres(async () => {
        const [fila] = await filas(db, 'select public.esta_suspendida($1) as suspendida', [LUIS2]);
        assert.equal(fila.suspendida, true, 'la sancion mas dura ya no se esquiva borrandose la cuenta');
      });
    });
  });

  it('y se le puede levantar a la cuenta nueva, borrando el HMAC', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Acoso grave']);
      await seBorraYVuelve(db, a);
      await a.como(ADMIN);
      const [levantada] = await filas(db, 'select public.match_admin_unsuspend($1) as ok', [LUIS2]);
      assert.equal(levantada.ok, true);
      await a.comoPostgres(async () => {
        const [fila] = await filas(db, 'select public.esta_suspendida($1) as suspendida', [LUIS2]);
        assert.equal(fila.suspendida, false);
        const [s] = await filas(db, 'select email_hmac from public.account_suspensions');
        assert.equal(s.email_hmac, null, 'el correo deja de guardarse en cuanto acaba la sancion');
      });
    });
  });

  it('un veto de ruta se puede retirar aunque haya vuelto con otra cuenta', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, 'Acoso']);
      await seBorraYVuelve(db, a);
      await a.como(ADMIN);
      const [retirado] = await filas(db, 'select public.match_admin_lift_route_ban($1, $2) as ok', [LUIS2, RUTA]);
      assert.equal(retirado.ok, true, 'antes devolvia false y el veto se quedaba para siempre');
      await a.comoPostgres(async () => {
        const [fila] = await filas(db, 'select public.esta_vetada_de_ruta($1, $2) as vetada', [RUTA, LUIS2]);
        assert.equal(fila.vetada, false);
      });
    });
  });

  it('re-suspender no pisa la fecha en que empezo la sancion', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Primera']);
      await a.comoPostgres(() =>
        db.query(`update public.account_suspensions set created_at = now() - interval '10 days'`),
      );
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [LUIS, 'Segunda']);
      await a.comoPostgres(async () => {
        const [s] = await filas(db, `select created_at < now() - interval '9 days' as conserva, reason from public.account_suspensions`);
        assert.equal(s.conserva, true, 'sigue constando desde cuando esta fuera');
        assert.equal(s.reason, 'Segunda', 'pero con el motivo actualizado');
      });
    });
  });
});

describe('0017: lo de siempre sigue igual', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('una denuncia normal se lee con los nombres de verdad', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaConPruebas(db, a);
      await a.como(ADMIN);
      const [ticket] = await filas(db, 'select * from public.match_admin_report($1)', [denuncia]);
      assert.equal(ticket.reporter_name, 'ana');
      assert.equal(ticket.reported_name, 'luis');
      assert.equal(ticket.reported_id, LUIS);
      assert.equal(ticket.reported_suspended, false);
      assert.equal(ticket.reported_in_route, true);
    });
  });

  it('resolver y contar siguen funcionando', async () => {
    await escenario(db, async (a) => {
      await activar(db, a, ANA, LUIS);
      const denuncia = await denunciaConPruebas(db, a);
      await a.como(ADMIN);
      assert.equal(Number((await filas(db, 'select public.match_admin_alert_count() as n'))[0].n), 1);
      await db.query(`select public.match_admin_resolve($1, 'sin_accion', '')`, [denuncia]);
      assert.equal(Number((await filas(db, 'select public.match_admin_alert_count() as n'))[0].n), 0);
    });
  });
});
