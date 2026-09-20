import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0028: la denuncia guarda la foto y la frase de ese momento.
 *
 * Lo que hay que asegurar sobre Postgres real:
 *  1. **el ticket ensena lo que se denuncio, no lo que haya ahora**: si la
 *     persona se cambia la foto o la frase despues, quien revisa sigue viendo
 *     aquello. Ese es el bug entero;
 *  2. se congela al denunciar y por trigger, asi que vale para cualquier via;
 *  3. una denuncia ANTERIOR a esta migracion sigue leyendose (cae al perfil de
 *     ahora, que es lo unico que hay);
 *  4. la firma de `match_admin_report` no cambia: la app consume esas columnas.
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
  '0028_la_denuncia_congela_la_prueba.sql',
];
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const hasta0027 = migraciones.slice(0, -1);
const m0028 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const FOTO_DENUNCIADA = 'https://x.test/storage/v1/object/public/avatars/' + ANA + '/la-mala.jpg';
const FOTO_NUEVA = 'https://x.test/storage/v1/object/public/avatars/' + ANA + '/la-buena.jpg';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
    values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
`;

/** Ana se activa la cana con una frase y una foto, y Luis la denuncia. */
async function denunciar(db: PGlite, a: Actor, frase: string): Promise<string> {
  await a.como(ANA);
  await db.query(`select public.match_activate(true, $1, null, '2026-09-18')`, [frase]);
  await a.comoPostgres(() =>
    db.query(`update public.profiles set avatar_url = $1 where id = $2`, [FOTO_DENUNCIADA, ANA]),
  );
  await a.como(LUIS);
  await db.query(`select public.match_activate(true, 'B', null, '2026-09-18')`);
  const { rows } = await db.query<{ id: string }>(
    `select public.match_report($1, $2, 'foto', 'Esa foto no puede estar ahi', null, false) as id`,
    [RUTA, ANA],
  );
  return rows[0]?.id as string;
}

/** Ana cambia su foto y su frase despues de que la denuncien. */
async function cambiarlo(db: PGlite, a: Actor) {
  await a.comoPostgres(() =>
    db.query(`update public.profiles set avatar_url = $1 where id = $2`, [FOTO_NUEVA, ANA]),
  );
  await a.como(ANA);
  // Por la via de la app: match_save_bio_and_tags es interna y no se le concede
  // a nadie. `match_activate` con p_bio la llama por dentro.
  await db.query(`select public.match_activate(true, 'Ahora pongo otra cosa', null, '2026-09-18')`);
}

const ticket = async (db: PGlite, id: string) =>
  (
    await db.query<{ reported_avatar_url: string; reported_bio: string; reported_name: string }>(
      `select reported_avatar_url, reported_bio, reported_name from public.match_admin_report($1)`,
      [id],
    )
  ).rows[0];

describe('0028: la denuncia congela la prueba', () => {
  it('EL CASO: cambiarse la foto despues no cambia lo que ve quien revisa', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      const id = await denunciar(db, a, 'Mi frase de entonces');
      await cambiarlo(db, a);
      await a.como(ADMIN);
      const t = await ticket(db, id);
      assert.equal(t?.reported_avatar_url, FOTO_DENUNCIADA, 'el ticket ensena la foto de AHORA');
      assert.equal(t?.reported_bio, 'Mi frase de entonces', 'el ticket ensena la frase de AHORA');
    });
    await db.close();
  });

  it('sin cambiar nada, se ve lo mismo que hay', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      const id = await denunciar(db, a, 'Mi frase');
      await a.como(ADMIN);
      const t = await ticket(db, id);
      assert.equal(t?.reported_avatar_url, FOTO_DENUNCIADA);
      assert.equal(t?.reported_bio, 'Mi frase');
    });
    await db.close();
  });

  it('se congela por trigger, asi que vale tambien creando la fila a pelo', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`select public.match_activate(true, 'Frase directa', null, '2026-09-18')`);
      await a.comoPostgres(async () => {
        await db.query(`update public.profiles set avatar_url = $1 where id = $2`, [FOTO_DENUNCIADA, ANA]);
        await db.query(
          `insert into public.match_reports (reporter_id, reported_id, route_id, reason, detail)
           values ($1, $2, $3, 'otro', 'a pelo')`,
          [LUIS, ANA, RUTA],
        );
      });
      const fila = await a.comoPostgres(
        async () =>
          (
            await db.query<{ u: string; b: string }>(
              `select reported_avatar_url as u, reported_bio as b from public.match_reports order by created_at desc limit 1`,
            )
          ).rows[0],
      );
      assert.equal(fila?.u, FOTO_DENUNCIADA);
      assert.equal(fila?.b, 'Frase directa');
    });
    await db.close();
  });

  it('quien no tiene foto ni frase se congela como tal, no como null', async () => {
    // Distingue "no se guardo" (null, denuncia vieja) de "no tenia" ('').
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await db.query(`select public.match_activate(true, 'B', null, '2026-09-18')`);
      await a.como(ANA);
      await db.query(`select public.match_activate(true, 'Algo', null, '2026-09-18')`);
      // La app no deja activarse con la frase vacia (BIO_REQUIRED), pero si se
      // puede vaciar despues, y entonces la denuncia tiene que congelar ''.
      await a.comoPostgres(() =>
        db.query(`update public.match_profiles set bio = '' where user_id = $1`, [ANA]),
      );
      await a.como(LUIS);
      const { rows } = await db.query<{ id: string }>(
        `select public.match_report($1, $2, 'otro', 'sin foto', null, false) as id`,
        [RUTA, ANA],
      );
      const fila = await a.comoPostgres(
        async () =>
          (
            await db.query<{ u: string | null; b: string | null }>(
              `select reported_avatar_url as u, reported_bio as b from public.match_reports where id = $1`,
              [rows[0]?.id],
            )
          ).rows[0],
      );
      assert.equal(fila?.u, null, 'no tenia foto');
      assert.equal(fila?.b, '', 'tenia frase vacia, que no es lo mismo que "no se guardo"');
    });
    await db.close();
  });

  it('una denuncia ANTERIOR a la 0028 se sigue leyendo', async () => {
    const db = await crearBase(hasta0027);
    await db.exec(DATOS);
    // Denuncia puesta con la version vieja: no hay nada congelado.
    await db.exec(`
      select set_config('request.jwt.claims', '{"sub":"${ANA}","role":"authenticated"}', false);
      select public.match_activate(true, 'Frase vieja', null, '2026-09-18');
      select set_config('request.jwt.claims', '{"sub":"${LUIS}","role":"authenticated"}', false);
      select public.match_activate(true, 'B', null, '2026-09-18');
      select public.match_report('${RUTA}', '${ANA}', 'otro', 'antigua', null, false);
      select set_config('request.jwt.claims', null, false);
    `);
    await db.exec(`update public.profiles set avatar_url = '${FOTO_NUEVA}' where id = '${ANA}'`);
    await db.exec(m0028);

    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const id = (await a.comoPostgres(
        async () => (await db.query<{ id: string }>(`select id from public.match_reports limit 1`)).rows[0]?.id,
      )) as string;
      const t = await ticket(db, id);
      // Cae al perfil de ahora, que es lo unico que hay: inventarse lo de antes
      // seria mentir.
      assert.equal(t?.reported_avatar_url, FOTO_NUEVA);
      assert.equal(t?.reported_bio, 'Frase vieja');
    });
    await db.close();
  });

  it('la firma de match_admin_report no cambia: la app consume esas columnas', async () => {
    const antes = await crearBase(hasta0027);
    const despues = await crearBase(migraciones);
    const firma = async (db: PGlite) =>
      (
        await db.query<{ f: string }>(
          `select pg_get_function_result(oid) as f from pg_proc where proname = 'match_admin_report'`,
        )
      ).rows[0]?.f;
    assert.equal(await firma(despues), await firma(antes));
    await antes.close();
    await despues.close();
  });

  it('se puede re-ejecutar sin pisar lo ya congelado', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await escenario(db, async (a) => {
      const id = await denunciar(db, a, 'La de entonces');
      await cambiarlo(db, a);
      await a.comoPostgres(() => db.exec(m0028));
      await a.como(ADMIN);
      const t = await ticket(db, id);
      assert.equal(t?.reported_bio, 'La de entonces');
    });
    await db.close();
  });
});
