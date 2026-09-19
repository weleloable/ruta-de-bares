import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0019 arregla activar la cana, que la 0015 rompio al reescribir
 * `match_activate` de memoria en vez de partir del cuerpo que funcionaba.
 *
 * El fallo solo salia activando POR PRIMERA VEZ y CON etiquetas, que es
 * justamente lo que los tests de la 0015 no hacian (pasaban `p_tag_ids => null`
 * y perfiles ya activados alguna vez). Asi que aqui se prueba eso: activar de
 * cero con frase y etiquetas, y volver a activar despues de borrar los datos.
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
  '0019_activar_la_cana_arreglado.sql',
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0019 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const CONSENTIMIENTO = '2026-09-18';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'), ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by)
  values ('${RUTA}', 'Compostelana de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}');
`;

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

/** Como activa la app: mayoria de edad, frase, etiquetas y consentimiento. */
const activarDeCero = (db: PGlite, frase = 'Vengo a por el pleno') =>
  db.query('select public.match_activate(true, $1, $2, $3)', [
    frase,
    ['etiqueta-1', 'etiqueta-3'],
    CONSENTIMIENTO,
  ]);

describe('0019: forma', () => {
  it('la gramatica es valida y el cuerpo plpgsql compila', async () => {
    const resultado = (await init()).parse(m0019);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = (await init()).parsePlpgsql(m0019);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('la definicion vigente guarda la frase y las etiquetas con la funcion que existe', () => {
    // El fallo fue llamar a `match_set_tags`, que no existe: la buena es
    // `match_save_bio_and_tags(uid, bio, tags)`, y guarda las dos cosas juntas.
    // La 0015 se queda con su texto roto (una migracion aplicada no se edita,
    // se anade la siguiente), pero la funcion viva es esta.
    // Se mira el CUERPO y no el fichero entero: la cabecera nombra la funcion
    // mala a proposito, para explicar que fue lo que se rompio.
    const cuerpo = m0019.slice(m0019.indexOf('create or replace function public.match_activate'));
    assert.match(cuerpo, /perform public\.match_save_bio_and_tags\(v_uid, p_bio, p_tag_ids\);/);
    assert.doesNotMatch(cuerpo, /match_set_tags/);
  });
});

describe('0019: activar la cana de cero', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('por primera vez, con frase y etiquetas, funciona y las guarda', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await activarDeCero(db);
      const [perfil] = await filas(db, 'select * from public.match_get_profile()');
      assert.equal(perfil.is_active, true);
      assert.equal(perfil.bio, 'Vengo a por el pleno');
      assert.deepEqual(perfil.tag_ids, ['etiqueta-1', 'etiqueta-3'], 'las etiquetas no se perdian solas');
      assert.equal(perfil.consent_version, CONSENTIMIENTO);
      assert.equal(perfil.adult_confirmed, true);
    });
  });

  it('despues de borrar tus datos se puede volver a activar', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await activarDeCero(db);
      await db.query('select public.match_delete_my_data()');
      await activarDeCero(db, 'Segunda vuelta');
      const [perfil] = await filas(db, 'select * from public.match_get_profile()');
      assert.equal(perfil.is_active, true);
      assert.equal(perfil.bio, 'Segunda vuelta');
      assert.deepEqual(perfil.tag_ids, ['etiqueta-1', 'etiqueta-3']);
    });
  });

  it('sigue rechazando lo que rechazaba: frase vacia, demasiadas etiquetas, etiqueta inventada', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(
        rpc(db, 'select public.match_activate(true, $1, $2, $3)', ['   ', [], CONSENTIMIENTO]),
        /BIO_REQUIRED/,
      );
    });
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(
        rpc(db, 'select public.match_activate(true, $1, $2, $3)', [
          'Hola',
          ['etiqueta-1', 'etiqueta-2', 'etiqueta-3', 'etiqueta-4', 'etiqueta-5', 'etiqueta-6'],
          CONSENTIMIENTO,
        ]),
        /TOO_MANY_TAGS/,
      );
    });
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(
        rpc(db, 'select public.match_activate(true, $1, $2, $3)', ['Hola', ['no-existe'], CONSENTIMIENTO]),
        /TAG_NOT_FOUND/,
      );
    });
  });

  it('sin mayoria de edad y sin consentimiento sigue sin activarse', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(
        rpc(db, 'select public.match_activate(false, $1, $2, $3)', ['Hola', [], CONSENTIMIENTO]),
        /ADULT_CONFIRMATION_REQUIRED/,
      );
    });
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(
        rpc(db, 'select public.match_activate(true, $1, $2, null)', ['Hola', []]),
        /CONSENT_REQUIRED/,
      );
    });
  });

  it('volver a activar no pisa la fecha ni la version del primer consentimiento', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await activarDeCero(db);
      await db.query('select public.match_deactivate()');
      await db.query(`select public.match_activate(true, null, null, '2027-01-01')`);
      const [perfil] = await filas(db, 'select * from public.match_get_profile()');
      assert.equal(perfil.consent_version, CONSENTIMIENTO, 'se guarda el primero que se dio');
      assert.equal(perfil.is_active, true);
    });
  });
});

describe('0019: los vetos de la 0015 siguen en pie', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('con la cana vetada no se puede activar', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await activarDeCero(db);
      await a.como(ADMIN);
      await db.query('select public.match_admin_deactivate($1, $2)', [ANA, 'La foto no era tuya']);
      await a.como(ANA);
      await a.falla(rpc(db, 'select public.match_activate()'), /CANA_BLOCKED/);
    });
  });

  it('con la cuenta suspendida tampoco', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query('select public.match_admin_suspend($1, $2)', [ANA, 'Acoso grave']);
      await a.como(ANA);
      await a.falla(rpc(db, 'select public.match_activate(true, $1, $2, $3)', ['Hola', [], CONSENTIMIENTO]), /ACCOUNT_SUSPENDED/);
    });
  });
});
