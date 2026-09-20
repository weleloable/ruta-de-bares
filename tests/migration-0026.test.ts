import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0026: escribir a la organizacion, y reclamar una decision.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. **una cuenta SUSPENDIDA y EXPULSADA puede escribir**. Es el punto entero
 *     de este canal (art. 20 DSA) y el error mas facil de cometer seria copiar
 *     el guardian de la 0016, que exige estar dentro y sin sancion;
 *  2. una reclamacion solo puede apuntar a un aviso PROPIO;
 *  3. responder genera un aviso, o la respuesta no llega a nadie;
 *  4. nadie lee los mensajes de otra persona, y solo un admin ve la bandeja;
 *  5. el tope de 5 al dia funciona;
 *  6. el mensaje sobrevive al borrado de la cuenta de quien lo escribio.
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
];
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const m0026 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const ADMIN2 = '00000000-0000-4000-8000-00000000000e';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com'),
    ('${ADMIN2}', 'admin2@example.com');
  update public.profiles set role = 'admin' where id in ('${ADMIN}', '${ADMIN2}');
  insert into public.routes (id, name, is_published, created_by)
    values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
`;

const escribir = (db: PGlite, kind: string, texto: string, aviso: string | null = null) =>
  db.query<{ id: string }>(`select public.send_admin_message($1, $2, $3) as id`, [kind, texto, aviso]);

/** El id del ultimo aviso de esa persona. */
async function ultimoAviso(db: PGlite, a: Actor, uid: string): Promise<string> {
  return (await a.comoPostgres(
    async () =>
      (
        await db.query<{ id: string }>(
          `select id from public.user_notices where user_id = $1 order by seq desc limit 1`,
          [uid],
        )
      ).rows[0]?.id as string,
  )) as string;
}

describe('0026: canal de contacto y reclamacion', () => {
  it('EL CASO: una cuenta suspendida y expulsada puede escribir', async () => {
    // Si se copiase el guardian de la 0016 (estar dentro y sin sancion), este
    // canal no serviria justo para lo que existe.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_remove_from_route($1, $2, 'Acoso')`, [ANA, RUTA]);
      await db.query(`select public.match_admin_suspend($1, 'Acoso grave')`, [ANA]);

      await a.como(ANA);
      const { rows } = await escribir(db, 'contacto', 'No entiendo por que me habeis suspendido');
      assert.ok(rows[0]?.id, 'la cuenta sancionada tiene que poder escribir');
    });
    await db.close();
  });

  it('una reclamacion se ata al aviso, y solo si es tuyo', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_deactivate($1, 'Acoso')`, [ANA]);
      await db.query(`select public.match_admin_deactivate($1, 'Otra cosa')`, [LUIS]);
      const avisoDeAna = await ultimoAviso(db, a, ANA);
      const avisoDeLuis = await ultimoAviso(db, a, LUIS);

      await a.como(ANA);
      await escribir(db, 'reclamacion', 'Creo que es un error', avisoDeAna);
      // El de Luis no: si colase, se le sacaria por el ticket que le pasa.
      await a.falla(() => escribir(db, 'reclamacion', 'Dame datos', avisoDeLuis), 'NOTICE_NOT_FOUND');
    });
    await db.close();
  });

  it('responder genera un aviso: el circulo se cierra donde ya sabe mirar', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      const { rows } = await escribir(db, 'contacto', 'Hola, una duda');
      const id = rows[0]?.id as string;

      await a.como(ADMIN);
      await db.query(`select public.admin_answer_message($1, 'Resuelto, gracias por avisar')`, [id]);

      await a.como(ANA);
      const avisos = await db.query<{ action: string; reason: string }>(
        `select action, reason from public.my_notices() order by created_at desc limit 1`,
      );
      assert.equal(avisos.rows[0]?.action, 'respuesta_organizacion');
      assert.equal(avisos.rows[0]?.reason, 'Resuelto, gracias por avisar');

      const mios = await db.query<{ status: string; answer: string }>(`select status, answer from public.my_admin_messages()`);
      assert.equal(mios.rows[0]?.status, 'resuelta');
      assert.equal(mios.rows[0]?.answer, 'Resuelto, gracias por avisar');
    });
    await db.close();
  });

  it('responder exige decir algo', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      const { rows } = await escribir(db, 'contacto', 'Hola');
      await a.como(ADMIN);
      await a.falla(() => db.query(`select public.admin_answer_message($1, '  ')`, [rows[0]?.id]), 'REASON_REQUIRED');
    });
    await db.close();
  });

  it('se reclama al abrirlo, y el segundo admin se entera', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      const { rows } = await escribir(db, 'contacto', 'Hola');
      const id = rows[0]?.id as string;

      await a.como(ADMIN);
      const primero = await db.query<{ ok: boolean }>(`select public.admin_take_message($1) as ok`, [id]);
      assert.equal(primero.rows[0]?.ok, true);
      await a.como(ADMIN2);
      const segundo = await db.query<{ ok: boolean }>(`select public.admin_take_message($1) as ok`, [id]);
      assert.equal(segundo.rows[0]?.ok, false, 'ya lo tenia el primero');
    });
    await db.close();
  });

  it('avisa de que la decision reclamada la tomo quien la esta mirando', async () => {
    // Art. 20.6 del DSA: la revision no puede ser automatica. No se bloquea
    // (con un solo admin no habria alternativa), se avisa.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_deactivate($1, 'Acoso')`, [ANA]);
      const aviso = await ultimoAviso(db, a, ANA);
      await a.como(ANA);
      await escribir(db, 'reclamacion', 'No estoy de acuerdo', aviso);

      await a.como(ADMIN);
      const mio = await db.query<{ d: boolean }>(`select decidido_por_mi as d from public.admin_messages()`);
      assert.equal(mio.rows[0]?.d, true);
      await a.como(ADMIN2);
      const otro = await db.query<{ d: boolean }>(`select decidido_por_mi as d from public.admin_messages()`);
      assert.equal(otro.rows[0]?.d, false, 'al otro admin no se le avisa de nada');
    });
    await db.close();
  });

  it('nadie lee los mensajes de otra persona, ni la bandeja sin ser admin', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await escribir(db, 'contacto', 'Algo privado mio');
      await a.como(LUIS);
      const mios = await db.query(`select * from public.my_admin_messages()`);
      assert.equal(mios.rows.length, 0, 'my_admin_messages solo devuelve lo tuyo');
      await a.falla(() => db.query(`select * from public.admin_messages()`), /NOT_ADMIN|permission denied/i);
      await a.falla(() => db.query(`select * from public.user_messages`), /permission denied/i);
    });
    await db.close();
  });

  it('el tope de 5 al dia', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      for (let i = 0; i < 5; i++) await escribir(db, 'contacto', `Mensaje ${i}`);
      await a.falla(() => escribir(db, 'contacto', 'Uno mas'), 'TOO_MANY_MESSAGES');
    });
    await db.close();
  });

  it('un mensaje vacio no se envia', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(() => escribir(db, 'contacto', '   '), 'BODY_REQUIRED');
      await a.falla(() => escribir(db, 'otra_cosa', 'Hola'), 'KIND_INVALID');
    });
    await db.close();
  });

  it('el mensaje sobrevive al borrado de la cuenta, con el nombre de entonces', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await escribir(db, 'contacto', 'Quiero contar algo antes de irme');
      await db.query(`select public.delete_my_account()`);

      await a.como(ADMIN);
      const { rows } = await db.query<{ user_name: string; body: string }>(
        `select user_name, body from public.admin_messages()`,
      );
      assert.equal(rows.length, 1, 'user_messages no puede tener clave ajena a profiles');
      assert.ok(rows[0]?.user_name, 'se guarda el nombre de entonces, o no hay quien lo lea');
      assert.equal(rows[0]?.body, 'Quiero contar algo antes de irme');
    });
    await db.close();
  });

  it('sin sesion no se escribe nada', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.anonimo();
      await a.falla(() => escribir(db, 'contacto', 'Hola'), /permission denied/i);
    });
    await db.close();
  });

  it('se puede re-ejecutar', async () => {
    const db = await crearBase([...migraciones, m0026]);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = 'user_messages'`,
    );
    assert.equal(rows[0]?.n, 1);
    await db.close();
  });
});
