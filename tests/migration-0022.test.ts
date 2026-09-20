import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0022: ni `anon` ni `authenticated` pueden vaciar una tabla.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. el TRUNCATE que ANTES funcionaba ahora falla (si no, el test no prueba
 *     nada: hay que ver el agujero abierto y luego cerrado);
 *  2. ninguna tabla de `public` concede TRUNCATE a esos roles, hoy;
 *  3. y **la tabla que se cree manana tampoco**, que es la mitad que de verdad
 *     cierra el agujero: sin `alter default privileges`, la proxima migracion
 *     vuelve a abrirlo y hay que acordarse a mano.
 *  4. lo que la app SI hace (leer, insertar, borrar filas sueltas) sigue
 *     funcionando: revocar de mas romperia el sellado o el canje.
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
];
const migraciones = nombres.map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const hasta0021 = migraciones.slice(0, -1);
const m0022 = migraciones.at(-1) as string;

/** Las que la 0022 nombra: las que tienen privilegios para la app. */
const TABLAS = [
  'profiles',
  'routes',
  'route_bars',
  'stamps',
  'route_invites',
  'route_members',
  'avatar_requests',
];

const ADMIN = '00000000-0000-4000-8000-000000000001';
const SOCIA = '00000000-0000-4000-8000-000000000002';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

async function sembrar(db: PGlite) {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@probe.test'),
      ('${SOCIA}', 'socia@probe.test');
    update public.profiles set role = 'admin' where id = '${ADMIN}';
    insert into public.routes (id, name, is_published, created_by)
      values ('${RUTA}', 'Ruta sonda', true, '${ADMIN}');
    insert into public.route_members (route_id, user_id) values ('${RUTA}', '${SOCIA}');
  `);
}

/** Cuantos privilegios TRUNCATE hay concedidos a los roles de la app. */
async function truncatesConcedidos(db: PGlite): Promise<string[]> {
  const { rows } = await db.query<{ t: string }>(`
    select table_name || ' -> ' || grantee as t
      from information_schema.role_table_grants
     where table_schema = 'public'
       and privilege_type = 'TRUNCATE'
       and grantee in ('anon', 'authenticated')
     order by 1
  `);
  return rows.map((f) => f.t);
}

describe('0022: sin TRUNCATE para anon ni authenticated', () => {
  it('ANTES de la 0022 el agujero esta abierto (si no, el test no prueba nada)', async () => {
    const db = await crearBase(hasta0021);
    await sembrar(db);
    const antes = await truncatesConcedidos(db);
    assert.ok(
      antes.length >= TABLAS.length,
      `se esperaba el agujero abierto en al menos ${TABLAS.length} tablas, y habia ${antes.length}`,
    );

    await escenario(db, async (actor: Actor) => {
      await actor.anonimo();
      // Sin sesion siquiera: vacia la tabla que deja a todos fuera de la ruta.
      await db.exec('truncate table public.route_members');
      const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.route_members');
      assert.equal(rows[0]?.n, 0, 'el agujero deberia estar abierto antes de la 0022');
    });
    await db.close();
  });

  it('despues, ninguna tabla de public se lo concede', async () => {
    const db = await crearBase(migraciones);
    assert.deepEqual(await truncatesConcedidos(db), []);
    await db.close();
  });

  it('el TRUNCATE que antes funcionaba ahora falla, como anon y como authenticated', async () => {
    const db = await crearBase(migraciones);
    await sembrar(db);

    for (const tabla of TABLAS) {
      await escenario(db, async (actor: Actor) => {
        await actor.anonimo();
        await actor.falla(() => db.exec(`truncate table public.${tabla}`), /permission denied|denegado/i);
        await actor.como(SOCIA);
        await actor.falla(() => db.exec(`truncate table public.${tabla}`), /permission denied|denegado/i);
      });
    }
    await db.close();
  });

  it('la tabla que se cree MANANA tampoco lo concede', async () => {
    const db = await crearBase(migraciones);
    // Lo que hara la proxima migracion: crear una tabla como postgres.
    await db.exec('create table public.tabla_futura (id int primary key)');
    assert.deepEqual(
      await truncatesConcedidos(db),
      [],
      'sin `alter default privileges`, cada tabla nueva vuelve a abrir el agujero',
    );
    await db.close();
  });

  it('la 0022 se puede re-ejecutar sin romper nada', async () => {
    const db = await crearBase([...migraciones, m0022, m0022]);
    assert.deepEqual(await truncatesConcedidos(db), []);
    await db.close();
  });

  /**
   * La red que de verdad protege de revocar de mas. En vez de adivinar que
   * operaciones usa la app (route_members, por ejemplo, ya no dejaba DELETE a
   * `authenticated` ANTES de esta migracion), se compara el mapa entero de
   * privilegios antes y despues: lo unico que puede haber cambiado es TRUNCATE.
   */
  it('no revoca nada mas: el resto de privilegios queda igual que antes', async () => {
    const privilegios = async (db: PGlite) => {
      const { rows } = await db.query<{ t: string }>(`
        select table_name || ' ' || grantee || ' ' || privilege_type as t
          from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('anon', 'authenticated')
         order by 1
      `);
      return rows.map((f) => f.t);
    };

    const antes = await crearBase(hasta0021);
    const despues = await crearBase(migraciones);
    const esperado = (await privilegios(antes)).filter((p) => !p.endsWith(' TRUNCATE'));
    assert.deepEqual(await privilegios(despues), esperado);
    await antes.close();
    await despues.close();
  });

  it('y lo que la app SI hace con estas tablas sigue funcionando', async () => {
    const db = await crearBase(migraciones);
    await sembrar(db);

    await escenario(db, async (actor: Actor) => {
      await actor.como(SOCIA);
      const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.routes');
      assert.equal(rows[0]?.n, 1, 'seguir leyendo la ruta de la que es miembro');
      // Cambiarse el nombre visible: un UPDATE de la fila propia de profiles.
      await db.exec(`update public.profiles set display_name = 'Socia2' where id = '${SOCIA}'`);
      const { rows: n } = await db.query<{ d: string }>(
        `select display_name as d from public.profiles where id = '${SOCIA}'`,
      );
      assert.equal(n[0]?.d, 'Socia2');
    });
    await db.close();
  });
});
