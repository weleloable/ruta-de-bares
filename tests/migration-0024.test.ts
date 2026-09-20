import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0024: el veto de cana aguanta solo, y deja borrar la cuenta.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. borrarse la cuenta y volver con el MISMO correo ya no levanta el veto
 *     (era el motivo por el que la 0021 lo puso como impedimento);
 *  2. y aun asi la cuenta SE PUEDE BORRAR: `CANA_BLOCKED` ya no impide nada;
 *  3. el veto se puede levantar SIEMPRE, incluida la cuenta nueva que lo
 *     heredo por correo (art. 20 DSA: seis meses para reclamar);
 *  4. al levantarlo, el HMAC desaparece: el dato vive lo que vive la sancion;
 *  5. los vetos que ya estaban puestos no se pierden al aplicar la migracion;
 *  6. y quien no esta vetado sigue pudiendo activar la cana.
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
];
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const hasta0023 = migraciones.slice(0, -1);
const m0024 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const ANA_VUELVE = '00000000-0000-4000-8000-00000000001a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const CORREO_ANA = 'ana@example.com';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', '${CORREO_ANA}'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
    values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
`;

/** Ana se borra la cuenta y se registra otra vez con el mismo correo. */
const VUELVE = `
  delete from auth.users where id = '${ANA}';
  insert into auth.users (id, email) values ('${ANA_VUELVE}', '${CORREO_ANA}');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA_VUELVE}');
`;

const activar = (db: PGlite) => () =>
  db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);

async function vetar(db: PGlite, a: Actor, motivo = 'Acoso en los chats') {
  await a.como(ADMIN);
  await db.query(`select public.match_admin_deactivate($1, $2)`, [ANA, motivo]);
}

describe('0024: el veto de cana con HMAC', () => {
  it('vetar deja las dos filas: la viva y la que sobrevive', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a);
      const filas = await a.comoPostgres(async () =>
        (
          await db.query<{ viva: boolean; hmac: string | null; motivo: string }>(`
            select (mp.blocked_at is not null) as viva, b.email_hmac as hmac, b.reason as motivo
              from public.match_profiles mp
              join public.cana_bans b on b.user_id = mp.user_id
             where mp.user_id = '${ANA}'`)
        ).rows,
      );
      assert.equal(filas.length, 1);
      assert.equal(filas[0]?.viva, true);
      assert.equal(filas[0]?.motivo, 'Acoso en los chats');
      assert.ok(filas[0]?.hmac, 'sin HMAC, borrarse la cuenta esquiva el veto');
    });
    await db.close();
  });

  it('EL CASO: borrarse la cuenta y volver con el mismo correo NO levanta el veto', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a);
      await a.comoPostgres(() => db.exec(VUELVE));
      await a.como(ANA_VUELVE);
      await a.falla(activar(db), 'CANA_BLOCKED');
    });
    await db.close();
  });

  it('y aun asi la cuenta se puede borrar: CANA_BLOCKED ya no lo impide', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a);
      await a.como(ANA);
      const { rows } = await db.query<{ b: string[] }>(`select public.delete_my_account_blockers() as b`);
      assert.deepEqual(rows[0]?.b, [], 'un veto de cana no puede bloquear el derecho de supresion');
      await db.query(`select public.delete_my_account()`);
      const quedan = await a.comoPostgres(async () =>
        (await db.query<{ n: number }>(`select count(*)::int as n from auth.users where id = '${ANA}'`)).rows[0]?.n,
      );
      assert.equal(quedan, 0);
    });
    await db.close();
  });

  it('el veto sobrevive al borrado aunque la cuenta ya no exista', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a);
      await a.como(ANA);
      await db.query(`select public.delete_my_account()`);
      const ban = await a.comoPostgres(async () =>
        (await db.query<{ n: number }>(`select count(*)::int as n from public.cana_bans`)).rows[0]?.n,
      );
      assert.equal(ban, 1, 'cana_bans no puede tener clave ajena a profiles');
    });
    await db.close();
  });

  it('se puede levantar, tambien a la cuenta nueva que lo heredo por correo', async () => {
    // Art. 20 del DSA: seis meses para reclamar. Un veto que nadie puede
    // deshacer deja ese derecho en nada.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a);
      await a.comoPostgres(() => db.exec(VUELVE));
      await a.como(ADMIN);
      const { rows } = await db.query<{ ok: boolean }>(
        `select public.match_admin_lift_cana($1, 'Reclamo y tenia razon') as ok`,
        [ANA_VUELVE],
      );
      assert.equal(rows[0]?.ok, true, 'sin fila viva que limpiar, tiene que levantar igual por HMAC');
      await a.como(ANA_VUELVE);
      await db.query(`select public.match_activate(true, 'Otra vez', null, '2026-09-18')`);
    });
    await db.close();
  });

  it('al levantarlo, el HMAC desaparece', async () => {
    // El dato vive lo que vive la sancion: es lo que lo hace defendible.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a);
      await a.como(ADMIN);
      await db.query(`select public.match_admin_lift_cana($1)`, [ANA]);
      const n = await a.comoPostgres(async () =>
        (await db.query<{ n: number }>(`select count(*)::int as n from public.cana_bans`)).rows[0]?.n,
      );
      assert.equal(n, 0);
    });
    await db.close();
  });

  it('levantar algo que no esta puesto devuelve false', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const { rows } = await db.query<{ ok: boolean }>(`select public.match_admin_lift_cana($1) as ok`, [LUIS]);
      assert.equal(rows[0]?.ok, false);
    });
    await db.close();
  });

  it('Mi perfil se entera del veto heredado', async () => {
    // Sin esto, quien vuelve con el mismo correo ve "Participante" y no
    // entiende por que la cana le dice que no.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a, 'Acoso grave');
      await a.comoPostgres(() => db.exec(VUELVE));
      await a.como(ANA_VUELVE);
      const { rows } = await db.query<{ cana_blocked: boolean; cana_reason: string }>(
        `select cana_blocked, cana_reason from public.my_restrictions()`,
      );
      assert.equal(rows[0]?.cana_blocked, true);
      assert.equal(rows[0]?.cana_reason, 'Acoso grave');
    });
    await db.close();
  });

  it('Moderacion lo sigue listando cuando la cuenta ya no existe', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await vetar(db, a);
      await a.como(ANA);
      await db.query(`select public.delete_my_account()`);
      await a.como(ADMIN);
      const { rows } = await db.query<{ tipo: string; user_name: string }>(
        `select tipo, user_name from public.match_admin_moderaciones() where tipo = 'cana'`,
      );
      assert.equal(rows.length, 1, 'si se lee de match_profiles, esto desaparece con la cuenta');
      assert.equal(rows[0]?.user_name, '(cuenta borrada)');
    });
    await db.close();
  });

  it('quien no esta vetado activa la cana sin problema', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await db.query(`select public.match_activate(true, 'Hola', null, '2026-09-18')`);
      // Las match_* no tienen privilegios para la app (van por SECURITY
      // DEFINER), asi que comprobarlo hay que hacerlo desde fuera.
      const activo = await a.comoPostgres(async () =>
        (
          await db.query<{ activo: boolean }>(
            `select is_active as activo from public.match_profiles where user_id = '${LUIS}'`,
          )
        ).rows[0]?.activo,
      );
      assert.equal(activo, true);
    });
    await db.close();
  });

  it('los vetos que ya estaban puestos no se pierden al aplicar la migracion', async () => {
    const db = await crearBase(hasta0023);
    await db.exec(DATOS);
    // Un veto puesto con la version anterior, sin cana_bans.
    await db.exec(`
      select set_config('request.jwt.claims', '{"sub":"${ADMIN}","role":"authenticated"}', false);
      select public.match_admin_deactivate('${ANA}', 'Puesto antes de la 0024');
      select set_config('request.jwt.claims', null, false);
    `);
    await db.exec(m0024);
    const { rows } = await db.query<{ n: number; motivo: string }>(
      `select count(*)::int as n, min(reason) as motivo from public.cana_bans`,
    );
    assert.equal(rows[0]?.n, 1, 'la migracion tiene que rellenar los que ya estaban');
    assert.equal(rows[0]?.motivo, 'Puesto antes de la 0024');
    await db.close();
  });

  it('se puede re-ejecutar', async () => {
    const db = await crearBase([...migraciones, m0024]);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = 'cana_bans'`,
    );
    assert.equal(rows[0]?.n, 1);
    await db.close();
  });

  it('la tabla no tiene privilegios para la app', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await a.falla(() => db.query(`select * from public.cana_bans`), /permission denied/i);
      await a.falla(() => db.query(`select public.esta_vetada_de_cana($1)`, [ANA]), /permission denied/i);
    });
    await db.close();
  });
});
