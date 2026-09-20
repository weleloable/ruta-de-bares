import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { nombresFicheroAvatar } from '../src/features/profile/fotoRevision.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0023: el bucket de fotos deja de ser publico.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. el bucket ya no es publico (que es lo que servia las fotos sin policy);
 *  2. de otra persona solo se lee el fichero que ya se le ve en la app: la foto
 *     aprobada y su miniatura. **Lo PENDIENTE y lo RECHAZADO siguen siendo
 *     ilegibles**, que es lo que cerro la 0020 y esta migracion no puede
 *     reabrir al ensanchar la lectura;
 *  3. hace falta compartir ruta: a quien no comparte, ni la foto aprobada;
 *  4. lo propio, todo; un admin, todo (o no puede revisar);
 *  5. no se puede leer sin sesion.
 */

const nombresMigraciones = [
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
];
const migraciones = nombresMigraciones.map((n) => leerFichero(`supabase/migrations/${n}`));
const m0023 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
// EVA tiene cuenta pero esta en OTRA ruta: no comparte nada con Ana.
const EVA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const OTRA_RUTA = '00000000-0000-4000-8000-0000000000f2';

const BASE_URL = 'https://proyecto.supabase.co/storage/v1/object/public/avatars/';
const url = (ruta: string) => BASE_URL + ruta;

let contador = 0;
function nombres(uid: string) {
  contador += 1;
  return nombresFicheroAvatar(uid, 1_700_000_000_000 + contador, () => (contador % 36) / 36);
}

const APROBADA = nombres(ANA);
const PENDIENTE = nombres(ANA);

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${EVA}', 'eva@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by) values
    ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}'),
    ('${OTRA_RUTA}', 'Otra ruta', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'),
    ('${OTRA_RUTA}', '${EVA}');
  -- La foto que Ana tiene PUESTA hoy.
  update public.profiles
     set avatar_url = '${url(APROBADA.foto)}', avatar_thumb_url = '${url(APROBADA.miniatura)}'
   where id = '${ANA}';
  -- Los cuatro ficheros existen en el bucket: dos puestos, dos esperando.
  insert into storage.objects (bucket_id, name) values
    ('avatars', '${APROBADA.foto}'),
    ('avatars', '${APROBADA.miniatura}'),
    ('avatars', '${PENDIENTE.foto}'),
    ('avatars', '${PENDIENTE.miniatura}');
`;

/**
 * SUPABASE_MINIMO no activa la RLS de storage.objects ni da privilegios: aqui
 * se hace, para probar la policy REAL. Dentro de la transaccion del escenario.
 * Mismo montaje que usa migration-0020.test.ts.
 */
async function conRlsDeStorage(db: PGlite, a: Actor) {
  await a.comoPostgres(() =>
    db.exec(`
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to authenticated;
    `),
  );
}

/** Que ficheros del bucket ve quien esta mirando ahora mismo. */
async function loQueVeo(db: PGlite): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `select name from storage.objects where bucket_id = 'avatars' order by 1`,
  );
  return rows.map((f) => f.name);
}

describe('0023: bucket de fotos privado', () => {
  it('el bucket deja de ser publico', async () => {
    const db = await crearBase(migraciones);
    const { rows } = await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'avatars'`);
    assert.equal(rows[0]?.public, false, 'si sigue publico, Storage sirve las fotos sin mirar ninguna policy');
    await db.close();
  });

  it('un companero de ruta ve la foto puesta, y SOLO esa', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.como(LUIS);
      assert.deepEqual(
        (await loQueVeo(db)).sort(),
        [APROBADA.foto, APROBADA.miniatura].sort(),
        'de un companero solo se lee lo que ya se le ve en la app',
      );
    });
    await db.close();
  });

  it('lo PENDIENTE de otra persona sigue sin verse: la 0020 no se reabre', async () => {
    // Este es el test que importa de esta migracion. Al ensanchar la lectura
    // por carpetas, un companero volveria a poder listar la foto que mandaste a
    // revision y la que te rechazaron, que es justo lo que cerro la 0020.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.como(LUIS);
      const visto = await loQueVeo(db);
      assert.ok(!visto.includes(PENDIENTE.foto), 'se ve la foto pendiente de otra persona');
      assert.ok(!visto.includes(PENDIENTE.miniatura), 'se ve la miniatura pendiente de otra persona');
    });
    await db.close();
  });

  it('quien no comparte ruta no ve nada, ni la foto puesta', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.como(EVA);
      assert.deepEqual(await loQueVeo(db), []);
    });
    await db.close();
  });

  it('lo propio se ve entero, tambien lo pendiente', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.como(ANA);
      assert.deepEqual(
        (await loQueVeo(db)).sort(),
        [APROBADA.foto, APROBADA.miniatura, PENDIENTE.foto, PENDIENTE.miniatura].sort(),
      );
    });
    await db.close();
  });

  it('un admin lo ve todo: sin eso no puede revisar una foto', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.como(ADMIN);
      assert.equal((await loQueVeo(db)).length, 4);
    });
    await db.close();
  });

  it('sin sesion no se lee nada', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.anonimo();
      // La policy es `to authenticated`: anon no entra por ninguna rama.
      await a.falla(() => db.query(`select name from storage.objects`), /permission denied|row-level security/i);
    });
    await db.close();
  });

  it('al cambiar Ana de foto, la vieja deja de verse y la nueva se ve', async () => {
    // La regla mira `profiles.avatar_url` en vivo, asi que sigue a la foto
    // puesta sin que nadie tenga que limpiar permisos.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.comoPostgres(() =>
        db.exec(`update public.profiles
                    set avatar_url = '${url(PENDIENTE.foto)}',
                        avatar_thumb_url = '${url(PENDIENTE.miniatura)}'
                  where id = '${ANA}'`),
      );
      await a.como(LUIS);
      assert.deepEqual((await loQueVeo(db)).sort(), [PENDIENTE.foto, PENDIENTE.miniatura].sort());
    });
    await db.close();
  });

  /**
   * La ayuda SI se le concede a `authenticated`, y no es un descuido: el USING
   * de una policy corre como el rol que consulta, asi que sin ejecucion la
   * policy falla para todo el mundo. Lo que se comprueba es que, llamandola
   * suelta, no cuenta nada que no se supiera ya.
   */
  it('la ayuda, llamada suelta, responde lo mismo que la policy', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      const pregunta = async (fichero: string) =>
        (await db.query<{ v: boolean }>(`select public.avatar_visible_para_mi($1) as v`, [fichero])).rows[0]?.v;

      await a.como(LUIS);
      assert.equal(await pregunta(APROBADA.foto), true, 'la foto puesta de una companera, si');
      assert.equal(await pregunta(PENDIENTE.foto), false, 'la pendiente de una companera, no');

      await a.como(EVA);
      assert.equal(await pregunta(APROBADA.foto), false, 'quien no comparte ruta, nada');
    });
    await db.close();
  });

  it('y a anon no se le concede', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.anonimo();
      await a.falla(
        () => db.query(`select public.avatar_visible_para_mi($1)`, [APROBADA.foto]),
        /permission denied/i,
      );
    });
    await db.close();
  });

  it('se puede re-ejecutar', async () => {
    const db = await crearBase([...migraciones, m0023]);
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_policies where schemaname = 'storage' and policyname = 'avatars_read'`,
    );
    assert.equal(rows[0]?.n, 1);
    await db.close();
  });
});
