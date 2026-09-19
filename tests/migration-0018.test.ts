import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0018: la lista de a quien se ha moderado.
 *
 * Lo que hay que asegurar sobre Postgres real: que salen los tres vetos
 * vigentes Y el historial de lo que se hizo, que quien se borro la cuenta
 * sigue apareciendo con su nombre de entonces, y que esto es solo para admins.
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
  '0018_lista_de_moderaciones.sql',
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0018 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const EVA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${EVA}', 'eva@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  update public.profiles set avatar_url = 'https://ejemplo.test/foto.jpg' where id = '${EVA}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'), ('${RUTA}', '${EVA}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

describe('0018: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const resultado = (await init()).parse(m0018);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0018);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });
});

describe('0018: la lista de moderaciones', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('solo la ven los admins', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, 'select * from public.match_admin_moderaciones()'), /NOT_ADMIN/);
    });
  });

  it('ensena los tres vetos vigentes y ademas lo que se hizo en su dia', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [ANA, 'Acoso grave']);
      await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, 'Acoso en la ruta']);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'Frase fuera de tono']);
      await db.query('select public.match_admin_remove_photo($1, $2)', [EVA, 'La foto no era suya']);

      const todo = await filas(db, 'select * from public.match_admin_moderaciones()');
      const porTipo = (t: string) => todo.filter((f) => f.tipo === t);

      assert.equal(porTipo('cuenta').length, 1);
      assert.equal(porTipo('cuenta')[0].user_name, 'ana');
      assert.equal(porTipo('ruta').length, 1);
      assert.equal(porTipo('ruta')[0].route_name, 'Compostelana de prueba');
      assert.equal(porTipo('ruta')[0].motivo, 'Acoso en la ruta');
      assert.equal(porTipo('cana').length, 1);
      assert.equal(porTipo('cana')[0].user_name, 'luis');

      // La foto retirada no deja veto, pero tiene que constar.
      const acciones = porTipo('accion').map((f) => f.accion);
      assert.ok(acciones.includes('foto_retirada'), 'retirar una foto es moderacion aunque no deje veto');
      assert.ok(acciones.includes('cuenta_suspendida'));
      assert.ok(acciones.includes('expulsada_de_ruta'));
    });
  });

  it('no ensena el ruido del flujo de la denuncia', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const [d] = await filas(
        db,
        `select public.match_report($1, $2, 'acoso', 'Se puso pesado', null, false) as id`,
        [RUTA, LUIS],
      );
      await a.como(ADMIN);
      await db.query('select public.match_admin_take($1)', [d.id]);
      await db.query(`select public.match_admin_resolve($1, 'sin_accion', '')`, [d.id]);

      const acciones = (await filas(db, `select accion from public.match_admin_moderaciones() where tipo = 'accion'`))
        .map((f) => f.accion);
      assert.ok(!acciones.includes('denuncia_en_revision'), 'poner en revision no es moderar a nadie');
      assert.ok(!acciones.includes('denuncia_resuelta'));
    });
  });

  it('quien se borro la cuenta sigue apareciendo, con el nombre de entonces', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_remove_from_route($1, $2, $3)', [LUIS, RUTA, 'Acoso']);
      await a.comoPostgres(() => db.query('delete from auth.users where id = $1', [LUIS]));
      await a.como(ADMIN);
      const todo = await filas(db, 'select * from public.match_admin_moderaciones()');
      const veto = todo.find((f) => f.tipo === 'ruta');
      assert.equal(veto?.user_name, '(cuenta borrada)', 'el veto sigue ahi y se puede retirar');
      const apunte = todo.find((f) => f.tipo === 'accion' && f.accion === 'expulsada_de_ruta');
      assert.equal(apunte?.user_name, 'luis', 'y el historial conserva su nombre');
    });
  });

  it('al levantar un veto desaparece de lo vigente pero queda en el historial', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [LUIS, 'Frase fuera de tono']);
      assert.equal(
        (await filas(db, `select 1 from public.match_admin_moderaciones() where tipo = 'cana'`)).length,
        1,
      );
      await db.query('select public.match_admin_lift_cana($1, $2)', [LUIS, 'Revisado']);
      assert.equal(
        (await filas(db, `select 1 from public.match_admin_moderaciones() where tipo = 'cana'`)).length,
        0,
        'ya no esta vigente',
      );
      const acciones = (await filas(db, `select accion from public.match_admin_moderaciones() where tipo = 'accion'`))
        .map((f) => f.accion);
      assert.ok(acciones.includes('cana_desactivada'), 'pero consta que se hizo');
      assert.ok(acciones.includes('veto_retirado'), 'y que se levanto');
    });
  });
});
