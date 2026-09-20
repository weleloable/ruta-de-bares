import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0025: llevarte TODOS tus datos, no solo los de la cana.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. estan los bloques que FALTABAN: cuenta con correo, rutas, sellos (con
 *     coordenadas), fotos enviadas, avisos de moderacion y sanciones con su
 *     HMAC. Ese es el hueco del art. 15 que esto viene a tapar;
 *  2. lo de la cana sigue entero dentro, y no como una copia que pueda
 *     separarse: se llama a la funcion de la 0010;
 *  3. NO salen datos de terceros: ni el texto de una denuncia abierta sobre
 *     ti, ni los mensajes que escribio la otra persona (art. 15.4);
 *  4. cada cual ve lo suyo y nada mas, y sin sesion no se ve nada.
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
];
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const m0025 = migraciones.at(-1) as string;

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
    values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at)
    values ('${BAR}', '${RUTA}', 0, 'Bar Manolo', 42.88, -8.54,
            now() - interval '1 hour', now() + interval '5 hours');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
`;

type Export = Record<string, any>;

async function exportarComo(db: PGlite, a: Actor, uid: string): Promise<Export> {
  await a.como(uid);
  const { rows } = await db.query<{ d: Export }>(`select public.export_my_data() as d`);
  return rows[0]?.d as Export;
}

describe('0025: exportar todos mis datos', () => {
  it('estan los bloques que faltaban', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      const d = await exportarComo(db, a, ANA);
      for (const clave of ['cuenta', 'rutas', 'sellos', 'fotos_enviadas', 'avisos', 'sanciones', 'cana', 'generado_el']) {
        assert.ok(clave in d, `falta el bloque "${clave}"`);
      }
    });
    await db.close();
  });

  it('la cuenta lleva el correo y el nombre', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      const d = await exportarComo(db, a, ANA);
      assert.equal(d.cuenta.correo, 'ana@example.com');
      assert.equal(d.cuenta.id, ANA);
      assert.ok('display_name' in d.cuenta);
    });
    await db.close();
  });

  it('los sellos salen CON coordenadas y hora: es dato de localizacion tuyo', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`select public.claim_stamp($1, 42.88, -8.54)`, [BAR]);
      const d = await exportarComo(db, a, ANA);
      assert.equal(d.sellos.length, 1);
      assert.equal(d.sellos[0].bar, 'Bar Manolo');
      assert.equal(d.sellos[0].ruta, 'Ruta de prueba');
      assert.ok(d.sellos[0].lat !== undefined && d.sellos[0].lng !== undefined, 'sin coordenadas no se ensena lo que se guarda');
      assert.ok(d.sellos[0].cuando);
    });
    await db.close();
  });

  it('las rutas a las que perteneces', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      const d = await exportarComo(db, a, ANA);
      assert.equal(d.rutas.length, 1);
      assert.equal(d.rutas[0].ruta, 'Ruta de prueba');
    });
    await db.close();
  });

  it('los avisos de moderacion y su motivo: es lo que hace falta para reclamar', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_deactivate($1, 'Acoso en los chats')`, [ANA]);
      const d = await exportarComo(db, a, ANA);
      assert.equal(d.avisos.length, 1);
      assert.equal(d.avisos[0].que, 'cana_desactivada');
      assert.equal(d.avisos[0].motivo, 'Acoso en los chats');
    });
    await db.close();
  });

  it('las sanciones, CON el HMAC del correo', async () => {
    // No se puede decir en la politica que se guarda y luego esconderlo cuando
    // alguien pide sus datos.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_deactivate($1, 'Acoso')`, [ANA]);
      await db.query(`select public.match_admin_remove_from_route($1, $2, 'Acoso')`, [ANA, RUTA]);
      await db.query(`select public.match_admin_suspend($1, 'Acoso grave')`, [ANA]);
      const d = await exportarComo(db, a, ANA);
      assert.equal(d.sanciones.veto_de_cana.length, 1);
      assert.equal(d.sanciones.vetos_de_ruta.length, 1);
      assert.equal(d.sanciones.suspension.length, 1);
      for (const [donde, filas] of Object.entries(d.sanciones)) {
        const primera = (filas as Export[])[0] as Export;
        assert.ok(primera.hmac_de_tu_correo, `${donde} sin el HMAC a la vista`);
      }
      assert.equal(d.sanciones.vetos_de_ruta[0].ruta, 'Ruta de prueba');
    });
    await db.close();
  });

  it('lo de la cana sigue entero dentro', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`select public.match_activate(true, 'Me gusta la negra', null, '2026-09-18')`);
      const d = await exportarComo(db, a, ANA);
      for (const clave of [
        'perfil',
        'conexiones',
        'me_gusta_y_vistos',
        'mensajes_que_enviaste',
        'personas_que_bloqueaste',
        'denuncias_que_pusiste',
      ]) {
        assert.ok(clave in d.cana, `falta "${clave}" dentro de cana`);
      }
      assert.equal(d.cana.perfil.bio, 'Me gusta la negra');
    });
    await db.close();
  });

  it('NO salen datos de terceros: ni una denuncia abierta sobre ti ni mensajes ajenos', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`select public.match_activate(true, 'A', null, '2026-09-18')`);
      await a.como(LUIS);
      await db.query(`select public.match_activate(true, 'B', null, '2026-09-18')`);
      await db.query(`select public.match_report($1, $2, 'acoso', 'Me dijo algo horrible', null, false)`, [RUTA, ANA]);

      const d = await exportarComo(db, a, ANA);
      const texto = JSON.stringify(d);
      assert.ok(!texto.includes('Me dijo algo horrible'), 'el texto de una denuncia abierta sobre ti no es tuyo');
      assert.ok(!texto.includes('Luis'), 'no debe salir quien te denuncio');
    });
    await db.close();
  });

  it('cada cual ve lo suyo: el export de Ana no lleva nada de Luis', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await db.query(`select public.claim_stamp($1, 42.88, -8.54)`, [BAR]);
      const d = await exportarComo(db, a, ANA);
      assert.equal(d.sellos.length, 0, 'los sellos de Luis no son de Ana');
      assert.equal(d.cuenta.correo, 'ana@example.com');
    });
    await db.close();
  });

  it('sin sesion no se exporta nada', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.anonimo();
      await a.falla(() => db.query(`select public.export_my_data()`), /permission denied/i);
    });
    await db.close();
  });

  it('se puede re-ejecutar', async () => {
    const db = await crearBase([...migraciones, m0025]);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc where proname = 'export_my_data'`,
    );
    assert.equal(rows[0]?.n, 1);
    await db.close();
  });
});
