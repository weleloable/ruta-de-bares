import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';
import init from 'pg-query-emscripten';

import { nombresFicheroAvatar } from '../src/features/profile/fotoRevision.ts';
import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0020: la foto de perfil nueva pasa por revision de un admin.
 *
 * Lo que hay que asegurar sobre Postgres real, por orden de importancia:
 *  1. nadie cambia su foto por un camino directo (UPDATE en profiles, ni desde
 *     la app ni siendo admin desde el cliente) y una foto enviada no se puede
 *     sobrescribir en el bucket;
 *  2. un admin decide y solo un admin: aprobar aplica la foto, rechazar guarda
 *     el motivo, una solicitud no se decide dos veces;
 *  3. la foto anterior sigue puesta mientras haya una pendiente, los admins se
 *     auto-aprueban y quitar la propia foto sigue funcionando;
 *  4. ninguna funcion nueva se puede llamar sin el permiso que toca.
 *
 * Los nombres de fichero los fabrica nombresFicheroAvatar() (el codigo de la
 * app), no se escriben a mano: si el SQL y la app dejasen de coincidir, esto
 * fallaria.
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
  '0020_foto_perfil_con_revision.sql',
].map((nombre) => leerFichero(`supabase/migrations/${nombre}`));
const m0020 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const ADMIN2 = '00000000-0000-4000-8000-00000000000e';
// EVA no esta en ninguna ruta: sirve para comprobar que no puede enviar fotos.
const EVA = '00000000-0000-4000-8000-00000000000c';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const FOTO_VIEJA = 'https://ejemplo.test/vieja.jpg';
const MINI_VIEJA = 'https://ejemplo.test/vieja-mini.jpg';

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${ADMIN}', 'admin@example.com'),
    ('${ADMIN2}', 'admin2@example.com'),
    ('${EVA}', 'eva@example.com');
  update public.profiles set role = 'admin' where id in ('${ADMIN}', '${ADMIN2}');
  insert into public.routes (id, name, is_published, created_by) values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}');
  insert into public.route_members (route_id, user_id) values ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}');
  update public.profiles set avatar_url = '${FOTO_VIEJA}', avatar_thumb_url = '${MINI_VIEJA}' where id = '${ANA}';
`;

const BASE_URL = 'https://proyecto.supabase.co/storage/v1/object/public/avatars/';
const url = (ruta: string) => BASE_URL + ruta;

/** Nombres como los fabrica la app. `n` los hace distintos entre si. */
let contador = 0;
function nombres(uid: string) {
  contador += 1;
  return nombresFicheroAvatar(uid, 1_700_000_000_000 + contador, () => (contador % 36) / 36);
}

type Fila = Record<string, unknown>;
const filas = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Fila[]> =>
  (await db.query<Fila>(sql, params)).rows;
const rpc = (db: PGlite, sql: string, params: unknown[] = []) => () => db.query(sql, params);

/** Sube los ficheros (como postgres, sin pasar por las policies: eso se prueba aparte) y devuelve sus nombres. */
async function subir(db: PGlite, a: Actor, uid: string) {
  const n = nombres(uid);
  await a.comoPostgres(() =>
    db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [n.foto, n.miniatura]),
  );
  return n;
}

const enviar = (db: PGlite, n: { foto: string; miniatura: string }, fotoUrl: string | null = null, miniUrl: string | null = null) =>
  db.query<{ r: string }>('select public.avatar_request_submit($1, $2, $3, $4) as r', [n.foto, n.miniatura, fotoUrl, miniUrl]);

const perfil = async (db: PGlite, a: Actor, uid: string) =>
  (await a.comoPostgres(() =>
    filas(db, 'select avatar_url, avatar_thumb_url from public.profiles where id = $1', [uid]),
  ))[0];

describe('0020: forma', () => {
  it('la gramatica es valida y los cuerpos plpgsql compilan', async () => {
    const parser = await init();
    const resultado = parser.parse(m0020);
    assert.ok(!resultado.error, `error de sintaxis: ${JSON.stringify(resultado.error)}`);
    const plpgsql = parser.parsePlpgsql(m0020);
    assert.ok(!plpgsql.error, `plpgsql no compila: ${JSON.stringify(plpgsql.error)}`);
  });

  it('es idempotente: se puede pegar dos veces', async () => {
    const db = await crearBase(migraciones);
    await db.exec(m0020);
    await db.exec(DATOS);
    // Y sigue funcionando tras la segunda pasada.
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(rpc(db, `update public.profiles set avatar_url = 'https://x/y.jpg' where id = $1`, [ANA]), /AVATAR_NEEDS_REVIEW/);
    });
  });
});

describe('0020: nadie cambia su foto por un camino directo', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  const cambiar = (uid: string, sql: string) => rpc(db, `update public.profiles set ${sql} where id = '${uid}'`);

  it('una persona no puede poner una foto nueva en su perfil', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(cambiar(ANA, `avatar_url = 'https://malo.test/x.jpg'`), /AVATAR_NEEDS_REVIEW/);
    });
  });

  it('ni la miniatura sola', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(cambiar(ANA, `avatar_thumb_url = 'https://malo.test/x.jpg'`), /AVATAR_NEEDS_REVIEW/);
    });
  });

  it('ni quitando una para colar la otra en la misma sentencia', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.falla(
        cambiar(ANA, `avatar_url = null, avatar_thumb_url = 'https://malo.test/x.jpg'`),
        /AVATAR_NEEDS_REVIEW/,
      );
      await a.falla(
        cambiar(ANA, `avatar_thumb_url = null, avatar_url = 'https://malo.test/x.jpg'`),
        /AVATAR_NEEDS_REVIEW/,
      );
    });
  });

  it('ni un admin desde el cliente, ni en su fila ni en la de otra persona', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await a.falla(cambiar(ADMIN, `avatar_url = 'https://malo.test/x.jpg'`), /AVATAR_NEEDS_REVIEW/);
      // profiles_update SI deja a un admin editar la fila de otra persona: es el guard quien lo para.
      await a.falla(cambiar(ANA, `avatar_url = 'https://malo.test/x.jpg'`), /AVATAR_NEEDS_REVIEW/);
    });
  });

  it('cambiar el nombre no se ve afectado', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`update public.profiles set display_name = 'Ana-nueva' where id = $1`, [ANA]);
      const p = (await filas(db, 'select display_name, avatar_url from public.profiles where id = $1', [ANA]))[0];
      assert.deepEqual(p, { display_name: 'Ana-nueva', avatar_url: FOTO_VIEJA });
    });
  });

  it('dejar la foto como estaba no cuenta como cambiarla', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`update public.profiles set avatar_url = avatar_url, avatar_thumb_url = avatar_thumb_url where id = $1`, [ANA]);
      await db.query(`update public.profiles set avatar_url = '${FOTO_VIEJA}' where id = $1`, [ANA]);
    });
  });

  it('quitar la propia foto sigue funcionando', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query(`update public.profiles set avatar_url = null, avatar_thumb_url = null where id = $1`, [ANA]);
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: null, avatar_thumb_url: null });
    });
  });

  it('el SQL Editor (postgres) si puede: es como se arregla algo a mano', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await a.comoPostgres(() => db.query(`update public.profiles set avatar_url = 'https://arreglo.test/x.jpg' where id = $1`, [ANA]));
      assert.equal((await perfil(db, a, ANA)).avatar_url, 'https://arreglo.test/x.jpg');
    });
  });
});

describe('0020: pedir el cambio de foto', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('crea una solicitud PENDIENTE y la foto anterior sigue puesta', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const n = await subir(db, a, ANA);
      assert.equal((await enviar(db, n)).rows[0].r, 'pendiente');
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: FOTO_VIEJA, avatar_thumb_url: MINI_VIEJA });
      const propias = await filas(db, 'select status, foto_path from public.avatar_requests');
      assert.deepEqual(propias, [{ status: 'pendiente', foto_path: n.foto }]);
    });
  });

  it('cada persona ve solo sus solicitudes', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      await enviar(db, await subir(db, a, ANA));
      await a.como(LUIS);
      assert.equal((await filas(db, 'select id from public.avatar_requests')).length, 0);
      await a.como(ANA);
      assert.equal((await filas(db, 'select id from public.avatar_requests')).length, 1);
    });
  });

  it('la tabla no se escribe a mano: ni insert, ni update, ni delete, ni truncate', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const n = await subir(db, a, ANA);
      await enviar(db, n);
      const permiso = /permission denied/;
      await a.falla(
        rpc(db, `insert into public.avatar_requests (user_id, foto_path, thumb_path) values ($1, $2, $3)`, [ANA, 'a/x.jpg', 'a/y.jpg']),
        permiso,
      );
      await a.falla(rpc(db, `update public.avatar_requests set status = 'aprobada'`), permiso);
      await a.falla(rpc(db, `delete from public.avatar_requests`), permiso);
      await a.falla(rpc(db, `truncate public.avatar_requests`), permiso);
    });
  });

  it('una persona normal no puede colar URLs: se ignoran y no se aplica nada', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const n = await subir(db, a, ANA);
      assert.equal((await enviar(db, n, 'https://malo.test/x.jpg', 'https://malo.test/y.jpg')).rows[0].r, 'pendiente');
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: FOTO_VIEJA, avatar_thumb_url: MINI_VIEJA });
    });
  });

  it('rechaza rutas que no son de la persona o que no son un nombre plano', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const mia = await subir(db, a, ANA);
      const deLuis = nombres(LUIS);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [deLuis.foto, deLuis.miniatura]), /INVALID_PATH/);
      // Una mia y una de otra persona.
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [mia.foto, deLuis.miniatura]), /INVALID_PATH/);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [`${ANA}/sub/x.jpg`, mia.miniatura]), /INVALID_PATH/);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [`${ANA}/..`, mia.miniatura]), /INVALID_PATH/);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [`${ANA}/a..b.jpg`, mia.miniatura]), /INVALID_PATH/);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [`${ANA}/con espacio.jpg`, mia.miniatura]), /INVALID_PATH/);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [mia.foto, mia.foto]), /INVALID_PATH/);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [null, mia.miniatura]), /INVALID_PATH/);
    });
  });

  it('exige que los dos ficheros esten ya subidos', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const n = nombres(ANA);
      await a.falla(() => enviar(db, n), /FILE_MISSING/);
      // Solo la grande.
      await a.comoPostgres(() => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [n.foto]));
      await a.falla(() => enviar(db, n), /FILE_MISSING/);
      // Un fichero con ese nombre pero en OTRO bucket no cuenta.
      await a.comoPostgres(() => db.query(`insert into storage.objects (bucket_id, name) values ('otro', $1)`, [n.miniatura]));
      await a.falla(() => enviar(db, n), /FILE_MISSING/);
    });
  });

  it('un fichero solo puede pertenecer a una solicitud', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const n = await subir(db, a, ANA);
      await enviar(db, n);
      await a.falla(() => enviar(db, n), /PATH_ALREADY_USED/);
      // Ni reusando solo uno de los dos en otra pareja.
      const otra = await subir(db, a, ANA);
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [n.foto, otra.miniatura]), /PATH_ALREADY_USED/);
    });
  });

  it('sin sesion no se puede llamar', async () => {
    await escenario(db, async (a) => {
      await a.anonimo();
      await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', ['x', 'y']), /permission denied/);
    });
  });

  it('subir otra foto sustituye a la pendiente: nunca hay dos', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const primera = await subir(db, a, ANA);
      const segunda = await subir(db, a, ANA);
      await enviar(db, primera);
      await enviar(db, segunda);
      const estados = await filas(db, 'select status, foto_path from public.avatar_requests order by created_at, status');
      assert.equal(estados.filter((e) => e.status === 'pendiente').length, 1);
      assert.equal(estados.find((e) => e.status === 'pendiente')?.foto_path, segunda.foto);
      assert.equal(estados.find((e) => e.status === 'sustituida')?.foto_path, primera.foto);
    });
  });

  it('un admin se auto-aprueba: la foto se aplica y queda registrado', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const n = await subir(db, a, ADMIN);
      assert.equal((await enviar(db, n, url(n.foto), url(n.miniatura))).rows[0].r, 'aprobada');
      assert.deepEqual(await perfil(db, a, ADMIN), { avatar_url: url(n.foto), avatar_thumb_url: url(n.miniatura) });
      // decided_by no se puede leer como usuario (ni admin): se mira como postgres.
      const s = (await a.comoPostgres(() => filas(db, 'select status, decided_by from public.avatar_requests')))[0];
      assert.deepEqual(s, { status: 'aprobada', decided_by: ADMIN });
      assert.equal((await db.query<{ c: number }>('select public.avatar_admin_count() as c')).rows[0].c, 0);
    });
  });

  it('un admin tiene que pasar URLs validas: sin ellas, de otro fichero o no http, se rechaza', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const n = await subir(db, a, ADMIN);
      await a.falla(() => enviar(db, n), /INVALID_URL/);
      await a.falla(() => enviar(db, n, url(n.foto), url(n.foto)), /INVALID_URL/);
      await a.falla(() => enviar(db, n, url(n.miniatura), url(n.foto)), /INVALID_URL/);
      await a.falla(() => enviar(db, n, `ftp://x/avatars/${n.foto}`, `ftp://x/avatars/${n.miniatura}`), /INVALID_URL/);
      // Tras los fallos no quedo nada a medias.
      assert.equal((await filas(db, 'select id from public.avatar_requests')).length, 0);
    });
  });
});

describe('0020: lo que ve y decide el admin', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  /** ANA envia una foto; deja a ADMIN listo para decidir. */
  async function conPendiente(a: Actor) {
    await a.como(ANA);
    const n = await subir(db, a, ANA);
    await enviar(db, n);
    const id = (await a.comoPostgres(() => filas(db, `select id from public.avatar_requests where foto_path = $1`, [n.foto])))[0].id as string;
    await a.como(ADMIN);
    return { n, id };
  }
  const decidir = (id: string, aprobar: boolean, motivo = '', f: string | null = null, m: string | null = null) =>
    db.query('select public.avatar_admin_decide($1, $2, $3, $4, $5)', [id, aprobar, motivo, f, m]);

  it('solo lo ve un admin', async () => {
    await escenario(db, async (a) => {
      const { id } = await conPendiente(a);
      await a.como(ANA);
      await a.falla(rpc(db, 'select * from public.avatar_admin_requests()'), /NOT_ADMIN/);
      await a.falla(rpc(db, 'select public.avatar_admin_count()'), /NOT_ADMIN/);
      await a.falla(rpc(db, 'select public.avatar_admin_decide($1, true)', [id]), /NOT_ADMIN/);
      await a.falla(rpc(db, 'select public.avatar_admin_decide($1, false, $2)', [id, 'no']), /NOT_ADMIN/);
    });
  });

  it('la bandeja trae a quien lo pide, su foto actual y la nueva; las sustituidas no salen', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const vieja = await subir(db, a, ANA);
      await enviar(db, vieja);
      const nueva = await subir(db, a, ANA);
      await enviar(db, nueva);
      await a.como(ADMIN);
      const lista = await filas(db, 'select * from public.avatar_admin_requests()');
      assert.equal(lista.length, 1);
      assert.equal(lista[0].foto_path, nueva.foto);
      assert.equal(lista[0].thumb_path, nueva.miniatura);
      assert.equal(lista[0].current_avatar_url, FOTO_VIEJA);
      assert.equal(lista[0].status, 'pendiente');
      assert.ok(typeof lista[0].user_name === 'string' && (lista[0].user_name as string).length > 0);
      assert.equal((await db.query<{ c: number }>('select public.avatar_admin_count() as c')).rows[0].c, 1);
    });
  });

  it('aprobar aplica la foto y la miniatura, deja constancia de quien y libera la bandeja', async () => {
    await escenario(db, async (a) => {
      const { n, id } = await conPendiente(a);
      await decidir(id, true, '', url(n.foto), url(n.miniatura));
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: url(n.foto), avatar_thumb_url: url(n.miniatura) });
      // Como postgres: por RLS un admin solo ve SUS filas en la tabla, y lee las de los demas por avatar_admin_requests().
      const s = (await a.comoPostgres(() => filas(db, 'select status, decided_by, reason from public.avatar_requests where id = $1', [id])))[0];
      assert.deepEqual(s, { status: 'aprobada', decided_by: ADMIN, reason: null });
      assert.equal((await db.query<{ c: number }>('select public.avatar_admin_count() as c')).rows[0].c, 0);
      const cerradas = await filas(db, 'select status, decided_by_name from public.avatar_admin_requests(false)');
      assert.equal(cerradas[0].status, 'aprobada');
      assert.ok(cerradas[0].decided_by_name);
    });
  });

  it('aprobar con una URL que no es de ese fichero se rechaza y no cambia nada', async () => {
    await escenario(db, async (a) => {
      const { n, id } = await conPendiente(a);
      await a.falla(() => decidir(id, true, '', url(n.foto), url(n.foto)), /INVALID_URL/);
      await a.falla(() => decidir(id, true, '', url(n.miniatura), url(n.foto)), /INVALID_URL/);
      await a.falla(() => decidir(id, true, '', null, null), /INVALID_URL/);
      await a.falla(() => decidir(id, true, '', 'https://malo.test/x.jpg', 'https://malo.test/y.jpg'), /INVALID_URL/);
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: FOTO_VIEJA, avatar_thumb_url: MINI_VIEJA });
      assert.equal((await a.comoPostgres(() => filas(db, 'select status from public.avatar_requests where id = $1', [id])))[0].status, 'pendiente');
    });
  });

  it('rechazar exige motivo (sin contar espacios), con tope, y la foto no cambia', async () => {
    await escenario(db, async (a) => {
      const { id } = await conPendiente(a);
      await a.falla(() => decidir(id, false), /REASON_REQUIRED/);
      await a.falla(() => decidir(id, false, '   '), /REASON_REQUIRED/);
      await a.falla(() => decidir(id, false, 'x'.repeat(501)), /REASON_TOO_LONG/);
      await decidir(id, false, '  Sale tapada la cara  ');
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: FOTO_VIEJA, avatar_thumb_url: MINI_VIEJA });
      // La persona ve el motivo (recortado) y no puede tocarlo.
      await a.como(ANA);
      const mia = (await filas(db, 'select status, reason from public.avatar_requests'))[0];
      assert.deepEqual(mia, { status: 'rechazada', reason: 'Sale tapada la cara' });
    });
  });

  it('una solicitud no se decide dos veces, ni por el mismo admin ni por otro', async () => {
    await escenario(db, async (a) => {
      const { n, id } = await conPendiente(a);
      await decidir(id, true, '', url(n.foto), url(n.miniatura));
      await a.falla(() => decidir(id, false, 'tarde'), /REQUEST_NOT_PENDING/);
      await a.como(ADMIN2);
      await a.falla(() => decidir(id, true, '', url(n.foto), url(n.miniatura)), /REQUEST_NOT_PENDING/);
    });
  });

  it('una solicitud sustituida ya no se puede decidir', async () => {
    await escenario(db, async (a) => {
      const { n, id } = await conPendiente(a);
      await a.como(ANA);
      await enviar(db, await subir(db, a, ANA));
      await a.como(ADMIN);
      await a.falla(() => decidir(id, true, '', url(n.foto), url(n.miniatura)), /REQUEST_NOT_PENDING/);
    });
  });

  it('una solicitud que no existe da REQUEST_NOT_FOUND', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await a.falla(() => decidir('00000000-0000-4000-8000-0000000000ff', false, 'x'), /REQUEST_NOT_FOUND/);
    });
  });

  it('tras un rechazo la persona puede volver a intentarlo', async () => {
    await escenario(db, async (a) => {
      const { id } = await conPendiente(a);
      await decidir(id, false, 'Otra, por favor');
      await a.como(ANA);
      assert.equal((await enviar(db, await subir(db, a, ANA))).rows[0].r, 'pendiente');
    });
  });
});

describe('0020: una foto enviada no se puede cambiar por debajo (storage)', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  /**
   * SUPABASE_MINIMO no activa la RLS de storage.objects ni da privilegios: aqui
   * se hace, para probar las policies REALES de la 0001 y la 0020. Dentro de la
   * transaccion del escenario, asi que se deshace.
   */
  async function conRlsDeStorage(a: Actor) {
    await a.comoPostgres(() =>
      db.exec(`
        alter table storage.objects enable row level security;
        grant select, insert, update, delete on storage.objects to authenticated;
      `),
    );
  }
  const insertar = (nombre: string) => rpc(db, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [nombre]);

  it('avatars_update_own ya no existe, y avatars_write_own si', async () => {
    const politicas = (await filas(db, `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'`)).map(
      (p) => p.policyname,
    );
    assert.ok(!politicas.includes('avatars_update_own'), 'sigue la policy que deja sobrescribir');
    assert.ok(politicas.includes('avatars_write_own'));
    assert.ok(politicas.includes('avatars_delete_own'), 'borrar la propia foto sigue permitido');
  });

  it('se puede subir a la carpeta propia y no a la de otra persona', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      await a.como(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [nombres(ANA).foto]);
      await a.falla(insertar(nombres(LUIS).foto), /row-level security/);
    });
  });

  it('tras solicitar, el mismo nombre no se puede volver a subir (ni borrando antes)', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      await a.como(ANA);
      const n = nombres(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [n.foto, n.miniatura]);
      await enviar(db, n);

      // Subir encima: el "upsert" de la app antigua.
      await a.falla(insertar(n.foto), /row-level security/);
      // Borrar y volver a subir con el mismo nombre.
      await db.query(`delete from storage.objects where name = $1`, [n.foto]);
      await a.falla(insertar(n.foto), /row-level security/);
      await a.falla(insertar(n.miniatura), /row-level security/);
    });
  });

  it('y despues de APROBARSE sigue sin poder sobrescribirse: es el caso que importa', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      await a.como(ANA);
      const n = nombres(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [n.foto, n.miniatura]);
      await enviar(db, n);
      await a.como(ADMIN);
      const id = (await a.comoPostgres(() => filas(db, 'select id from public.avatar_requests')))[0].id as string;
      await db.query('select public.avatar_admin_decide($1, true, $2, $3, $4)', [id, '', url(n.foto), url(n.miniatura)]);

      await a.como(ANA);
      await a.falla(insertar(n.foto), /row-level security/);
      await db.query(`delete from storage.objects where name = $1`, [n.foto]);
      await a.falla(insertar(n.foto), /row-level security/);
    });
  });

  it('actualizar un fichero propio (lo que hacia el upsert) ya no toca nada', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      await a.como(ANA);
      const n = nombres(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [n.foto]);
      const r = await db.query(`update storage.objects set name = $2 where name = $1`, [n.foto, `${ANA}/otro.jpg`]);
      assert.equal(r.affectedRows, 0);
    });
  });

  it('subir una foto nueva con nombre nuevo sigue funcionando tras haber tenido otra solicitud', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      await a.como(ANA);
      const n1 = nombres(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [n1.foto, n1.miniatura]);
      await enviar(db, n1);
      const n2 = nombres(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [n2.foto, n2.miniatura]);
      assert.equal((await enviar(db, n2)).rows[0].r, 'pendiente');
    });
  });
});

describe('0020: permisos', async () => {
  const db = await crearBase(migraciones);
  const puede = async (rol: string, firma: string) =>
    (await db.query<{ p: boolean }>(`select has_function_privilege($1, $2, 'execute') as p`, [rol, firma])).rows[0].p;

  it('las funciones de la app las ejecuta authenticated y no anon', async () => {
    for (const firma of [
      'public.avatar_request_submit(text, text, text, text)',
      'public.avatar_admin_requests(boolean)',
      'public.avatar_admin_count()',
      'public.avatar_admin_decide(uuid, boolean, text, text, text)',
    ]) {
      assert.equal(await puede('authenticated', firma), true, `authenticated ${firma}`);
      assert.equal(await puede('anon', firma), false, `anon ${firma}`);
    }
  });

  it('las internas no se pueden llamar desde la API', async () => {
    for (const firma of ['public.guard_profile_avatar()', 'public.avatar_url_coincide(text, text)']) {
      assert.equal(await puede('authenticated', firma), false, `authenticated ${firma}`);
      assert.equal(await puede('anon', firma), false, `anon ${firma}`);
    }
  });

  it('avatar_requests: authenticated solo lee, y no lee decided_by; anon no toca nada', async () => {
    const priv = async (rol: string, p: string) =>
      (await db.query<{ p: boolean }>(`select has_table_privilege($1, 'public.avatar_requests', $2) as p`, [rol, p])).rows[0].p;
    const col = async (rol: string, c: string) =>
      (await db.query<{ p: boolean }>(`select has_column_privilege($1, 'public.avatar_requests', $2, 'select') as p`, [rol, c])).rows[0].p;
    // Las columnas que la app y la policy de storage necesitan.
    for (const c of ['id', 'user_id', 'foto_path', 'thumb_path', 'status', 'reason', 'created_at', 'decided_at']) {
      assert.equal(await col('authenticated', c), true, `authenticated deberia leer ${c}`);
    }
    assert.equal(await col('authenticated', 'decided_by'), false, 'decided_by (el uuid del admin) no es para quien envia');
    for (const p of ['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) {
      assert.equal(await priv('authenticated', p), false, `authenticated ${p}`);
    }
    for (const p of ['select', 'insert', 'update', 'delete', 'truncate']) {
      assert.equal(await priv('anon', p), false, `anon ${p}`);
    }
  });

  it('la tabla tiene la RLS activada', async () => {
    const r = await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where oid = 'public.avatar_requests'::regclass`);
    assert.equal(r.rows[0].relrowsecurity, true);
  });
});

/**
 * Regresiones de la revision adversaria (un critico frio intento romper la 0020
 * y consiguio seis cosas). Cada test de aqui es un ataque que ANTES prosperaba.
 */
describe('0020: regresiones de la revision adversaria', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  async function conRlsDeStorage(a: Actor) {
    await a.comoPostgres(() =>
      db.exec(`
        alter table storage.objects enable row level security;
        grant select, insert, update, delete on storage.objects to authenticated;
      `),
    );
  }
  const insertar = (nombre: string) => rpc(db, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [nombre]);

  it('1. una foto puesta ANTES de la 0020 (sin solicitud) no se puede reemplazar borrando y volviendo a subir', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      const foto = `${ANA}/avatar-1700000000000.jpg`;
      const mini = `${ANA}/avatar-1700000000000-mini.jpg`;
      await a.comoPostgres(async () => {
        await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [foto, mini]);
        await db.query(`update public.profiles set avatar_url = $2, avatar_thumb_url = $3 where id = $1`, [ANA, url(foto), url(mini)]);
      });
      await a.como(ANA);
      await db.query(`delete from storage.objects where name = $1`, [foto]);
      await a.falla(insertar(foto), /row-level security/);
      await db.query(`delete from storage.objects where name = $1`, [mini]);
      await a.falla(insertar(mini), /row-level security/);
    });
  });

  it('1b. proteger la foto puesta no bloquea subir otra con nombre nuevo, ni nombres parecidos con "_"', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      const puesta = `${ANA}/avatarX1.jpg`;
      await a.comoPostgres(() =>
        db.query(`update public.profiles set avatar_url = $2, avatar_thumb_url = null where id = $1`, [ANA, url(puesta)]),
      );
      await a.como(ANA);
      // Con LIKE, "_" casaria con cualquier caracter y este nombre quedaria bloqueado sin motivo.
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ANA}/avatar_1.jpg`]);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [nombres(ANA).foto]);
    });
  });

  it('1c. quien no tiene foto puesta no se ve afectado por el bloqueo', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      await a.como(LUIS);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [nombres(LUIS).foto]);
    });
  });

  it('2. el bucket no se puede listar con la clave publica, y cada persona solo ve su carpeta', async () => {
    await escenario(db, async (a) => {
      await conRlsDeStorage(a);
      const deAna = nombres(ANA).foto;
      const deLuis = nombres(LUIS).foto;
      await a.comoPostgres(() =>
        db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [deAna, deLuis]),
      );
      await a.anonimo();
      // Sin sesion ni siquiera hay privilegio de lectura: la enumeracion queda cerrada.
      await a.falla(rpc(db, `select name from storage.objects where bucket_id = 'avatars'`), /permission denied/);
      await a.como(ANA);
      const vistos = (await filas(db, `select name from storage.objects where bucket_id = 'avatars'`)).map((f) => f.name);
      assert.deepEqual(vistos, [deAna]);
    });
  });

  it('3. con muchas solicitudes nuevas, la mas antigua sigue en la bandeja (y va la primera)', async () => {
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await enviar(db, await subir(db, a, LUIS));
      // 205 personas mas envian DESPUES, como postgres para no montar 205 sesiones.
      await a.comoPostgres(async () => {
        await db.exec(`
          insert into auth.users (id, email)
          select gen_random_uuid(), 'spam' || g || '@example.com' from generate_series(1, 205) g;
        `);
        await db.query(
          `insert into public.avatar_requests (user_id, foto_path, thumb_path, created_at)
           select p.id, p.id || '/f.jpg', p.id || '/m.jpg',
                  now() + (row_number() over (order by p.id)) * interval '1 second'
             from public.profiles p
            where p.id <> all ($1::uuid[])`,
          [[ANA, LUIS, ADMIN, ADMIN2, EVA]],
        );
      });
      await a.como(ADMIN);
      const lista = await filas(db, 'select user_id, status from public.avatar_admin_requests()');
      assert.equal(lista.length, 200);
      assert.equal(lista[0].user_id, LUIS, 'la mas antigua tiene que ser la primera');
      assert.ok(lista.every((f) => f.status === 'pendiente'));
      assert.equal((await db.query<{ c: number }>('select public.avatar_admin_count() as c')).rows[0].c, 206);
    });
  });

  it('3b. cuando cabe todo, las pendientes van antes que lo cerrado', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const vieja = await subir(db, a, ANA);
      await enviar(db, vieja);
      const idVieja = (await a.comoPostgres(() => filas(db, 'select id from public.avatar_requests where foto_path = $1', [vieja.foto])))[0].id as string;
      await a.como(ADMIN);
      await db.query('select public.avatar_admin_decide($1, false, $2)', [idVieja, 'No']);
      await a.como(LUIS);
      await enviar(db, await subir(db, a, LUIS));
      await a.como(ADMIN);
      const lista = await filas(db, 'select status from public.avatar_admin_requests(false)');
      assert.deepEqual(lista.map((f) => f.status), ['pendiente', 'rechazada']);
    });
  });

  it('4. una URL solo vale con la forma <host>/storage/v1/object/public/avatars/<ruta> exacta', async () => {
    const ruta = `${ANA}/avatar-x.jpg`;
    const ok = async (u: string | null, p: string | null = ruta) =>
      (await db.query<{ v: boolean }>(`select public.avatar_url_coincide($1, $2) as v`, [u, p])).rows[0].v;
    // Validas: https con host, y el Supabase local (http con puerto).
    assert.equal(await ok(`https://proyecto.supabase.co/storage/v1/object/public/avatars/${ruta}`), true);
    assert.equal(await ok(`http://127.0.0.1:54321/storage/v1/object/public/avatars/${ruta}`), true);
    // Las que colaban antes.
    assert.equal(await ok(`https://evil.test/track?x=/avatars/${ruta}`), false, 'query string');
    assert.equal(await ok(`https://evil.test/#/avatars/${ruta}`), false, 'fragmento');
    assert.equal(await ok(`https://evil.test/avatars/${ruta}`), false, 'sin /storage/v1/object/public');
    // Y otras formas de esquivarlo.
    assert.equal(await ok(`https://usuario@proyecto.supabase.co/storage/v1/object/public/avatars/${ruta}`), false, 'userinfo');
    assert.equal(await ok(`https://proyecto.supabase.co/storage/v1/object/public/avatars/extra/${ruta}`), false, 'carpeta de mas');
    assert.equal(await ok(`https://proyecto.supabase.co/storage/v1/object/public/otro/${ruta}`), false, 'otro bucket');
    assert.equal(await ok(`ftp://proyecto.supabase.co/storage/v1/object/public/avatars/${ruta}`), false, 'esquema');
    assert.equal(await ok(`https://proyecto.supabase.co/storage/v1/object/public/avatars/${ANA}/otra.jpg`), false, 'otra ruta');
    assert.equal(await ok(null), false);
    assert.equal(await ok(`https://proyecto.supabase.co/storage/v1/object/public/avatars/${ruta}`, null), false);
  });

  it('4b. un admin tampoco puede aprobar ni auto-aprobar con esas URL', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const propia = await subir(db, a, ADMIN);
      await a.falla(
        () => enviar(db, propia, `https://evil.test/avatars/${propia.foto}`, `https://evil.test/avatars/${propia.miniatura}`),
        /INVALID_URL/,
      );

      await a.como(ANA);
      const n = await subir(db, a, ANA);
      await enviar(db, n);
      const id = (await a.comoPostgres(() => filas(db, 'select id from public.avatar_requests where foto_path = $1', [n.foto])))[0].id as string;
      await a.como(ADMIN);
      await a.falla(
        rpc(db, 'select public.avatar_admin_decide($1, true, $2, $3, $4)', [id, '', `https://evil.test/x?a=/avatars/${n.foto}`, `https://evil.test/#/avatars/${n.miniatura}`]),
        /INVALID_URL/,
      );
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: FOTO_VIEJA, avatar_thumb_url: MINI_VIEJA });
    });
  });

  it('5. bloquear en el mismo orden que el envio: primero la persona, luego la solicitud', () => {
    const cuerpo = m0020.slice(m0020.indexOf('function public.avatar_admin_decide'));
    const persona = cuerpo.indexOf('from public.profiles p where p.id = v_usuario for no key update');
    const solicitud = cuerpo.indexOf('from public.avatar_requests r where r.id = p_request_id for update');
    assert.ok(persona > 0, 'decide no bloquea la fila de la persona con FOR NO KEY UPDATE');
    assert.ok(solicitud > 0, 'decide no bloquea la solicitud');
    assert.ok(persona < solicitud, 'decide bloquea la solicitud ANTES que la persona: riesgo de deadlock con el envio');
  });

  it('6. rutas degeneradas (".", "-", que empiecen por punto, guion o guion bajo) se rechazan', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const mia = await subir(db, a, ANA);
      for (const mala of ['.', '-', '-x.jpg', '.oculto.jpg', '_x.jpg']) {
        await a.falla(rpc(db, 'select public.avatar_request_submit($1, $2)', [`${ANA}/${mala}`, mia.miniatura]), /INVALID_PATH/);
      }
      // Un nombre normal que contiene punto, guion y guion bajo por dentro sigue valiendo.
      await a.comoPostgres(() =>
        db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [`${ANA}/a.b-c_d.jpg`, `${ANA}/a.b-c_d-mini.jpg`]),
      );
      const r = await db.query<{ r: string }>('select public.avatar_request_submit($1, $2) as r', [`${ANA}/a.b-c_d.jpg`, `${ANA}/a.b-c_d-mini.jpg`]);
      assert.equal(r.rows[0].r, 'pendiente');
    });
  });
});

/**
 * Segunda revision adversaria: cinco hallazgos mas. Igual que arriba, cada test
 * es un ataque o un fallo que ANTES prosperaba.
 */
describe('0020: regresiones de la segunda revision adversaria', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  it('7. quien no esta en ninguna ruta no puede enviar fotos (el alta abierta no llena la bandeja)', async () => {
    await escenario(db, async (a) => {
      await a.como(EVA);
      const n = await subir(db, a, EVA);
      await a.falla(() => enviar(db, n), /NOT_A_MEMBER/);
      assert.equal((await a.comoPostgres(() => filas(db, 'select * from public.avatar_requests'))).length, 0);
    });
  });

  it('7b. y quien esta en una ruta si puede: la membresia es la puerta, no un obstaculo', async () => {
    await escenario(db, async (a) => {
      await a.como(LUIS);
      assert.equal((await enviar(db, await subir(db, a, LUIS))).rows[0].r, 'pendiente');
    });
  });

  it('7c. un admin no necesita ser miembro de ninguna ruta', async () => {
    await escenario(db, async (a) => {
      await a.como(ADMIN2);
      const n = await subir(db, a, ADMIN2);
      assert.equal((await enviar(db, n, url(n.foto), url(n.miniatura))).rows[0].r, 'aprobada');
    });
  });

  it('8. como mucho 5 envios al dia por persona, se sustituyan o no; un admin no tiene limite', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      for (let i = 0; i < 5; i += 1) await enviar(db, await subir(db, a, ANA));
      await a.falla(async () => enviar(db, await subir(db, a, ANA)), /TOO_MANY_REQUESTS/);
      // Otra persona no se ve afectada.
      await a.como(LUIS);
      await enviar(db, await subir(db, a, LUIS));
      // Y un admin puede seguir.
      await a.como(ADMIN);
      for (let i = 0; i < 6; i += 1) {
        const n = await subir(db, a, ADMIN);
        await enviar(db, n, url(n.foto), url(n.miniatura));
      }
    });
  });

  it('9. no se aprueba una foto cuyo fichero la persona borro despues de enviarla', async () => {
    await escenario(db, async (a) => {
      await a.como(ANA);
      const n = await subir(db, a, ANA);
      await enviar(db, n);
      const id = (await a.comoPostgres(() => filas(db, 'select id from public.avatar_requests where foto_path = $1', [n.foto])))[0].id as string;
      // La persona borra el fichero pequeno (borrar sigue permitido).
      await a.comoPostgres(() => db.query(`delete from storage.objects where name = $1`, [n.miniatura]));
      await a.como(ADMIN);
      await a.falla(rpc(db, 'select public.avatar_admin_decide($1, true, $2, $3, $4)', [id, '', url(n.foto), url(n.miniatura)]), /FILE_MISSING/);
      assert.deepEqual(await perfil(db, a, ANA), { avatar_url: FOTO_VIEJA, avatar_thumb_url: MINI_VIEJA });
      // Rechazarla si se puede: no depende de los ficheros.
      await db.query('select public.avatar_admin_decide($1, false, $2)', [id, 'Falta la miniatura']);
    });
  });

  it('10. la foto puesta tambien queda protegida si su URL lleva query ("?v=1")', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(() =>
        db.exec(`
          alter table storage.objects enable row level security;
          grant select, insert, update, delete on storage.objects to authenticated;
        `),
      );
      const foto = `${ANA}/avatar-1700000000001.jpg`;
      await a.comoPostgres(async () => {
        await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [foto]);
        await db.query(`update public.profiles set avatar_url = $2 where id = $1`, [ANA, `${url(foto)}?v=1`]);
      });
      await a.como(ANA);
      await db.query(`delete from storage.objects where name = $1`, [foto]);
      await a.falla(rpc(db, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [foto]), /row-level security/);
    });
  });

  it('11. ninguna de las dos funciones bloquea la fila de profiles con FOR UPDATE (deadlock por la FK decided_by)', () => {
    const lineas = m0020.split('\n').filter((l) => l.includes('from public.profiles p where p.id =') && / for /.test(l));
    assert.ok(lineas.length >= 2, `solo ${lineas.length} bloqueos de profiles: ¿se movio el codigo?`);
    for (const linea of lineas) {
      assert.ok(linea.includes('for no key update'), `bloqueo demasiado fuerte: ${linea.trim()}`);
    }
  });
});

/**
 * Tercera revision adversaria: tres hallazgos bajos (el crítico no consiguio
 * romper nada demostrable en Postgres; lo unico serio que dejo es un riesgo del
 * Storage real que no se puede probar aqui, y esta documentado en la cabecera).
 */
describe('0020: regresiones de la tercera revision adversaria', async () => {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);

  async function pendienteDeAna(a: Actor) {
    await a.como(ANA);
    const n = await subir(db, a, ANA);
    await enviar(db, n);
    const id = (await a.comoPostgres(() => filas(db, 'select id from public.avatar_requests where foto_path = $1', [n.foto])))[0].id as string;
    await a.como(ADMIN);
    return { n, id };
  }

  it('12. un motivo hecho solo de espacios raros (NBSP, ancho cero, word joiner, BOM) no vale', async () => {
    await escenario(db, async (a) => {
      const { id } = await pendienteDeAna(a);
      for (const invisible of [' ', '​', '‌', '‍', '⁠', '﻿', '   ​ ', '\t\n ']) {
        await a.falla(rpc(db, 'select public.avatar_admin_decide($1, false, $2)', [id, invisible]), /REASON_REQUIRED/);
      }
      // Sigue pendiente: ningun rechazo a medias.
      assert.equal((await a.comoPostgres(() => filas(db, 'select status from public.avatar_requests where id = $1', [id])))[0].status, 'pendiente');
    });
  });

  it('12b. un motivo real que contiene un espacio raro por dentro sigue valiendo', async () => {
    await escenario(db, async (a) => {
      const { id } = await pendienteDeAna(a);
      await db.query('select public.avatar_admin_decide($1, false, $2)', [id, 'Foto borrosa']);
      await a.como(ANA);
      assert.equal((await filas(db, 'select reason from public.avatar_requests'))[0].reason, 'Foto borrosa');
    });
  });

  it('13. las variantes de nombre no se cuelan junto a una foto solicitada (mayusculas, espacio final, "//", "./", "../")', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(() =>
        db.exec(`
          alter table storage.objects enable row level security;
          grant select, insert, update, delete on storage.objects to authenticated;
        `),
      );
      await a.como(ANA);
      const n = nombres(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [n.foto, n.miniatura]);
      await enviar(db, n);
      const nombre = n.foto.slice(ANA.length + 1);
      const variantes = [
        `${ANA}/${nombre.toUpperCase()}`,
        `${ANA}/${nombre} `,
        `${ANA}//${nombre}`,
        `${ANA}/./${nombre}`,
        `${ANA}/../${nombre}`,
        `${ANA}/${nombre}\n`,
      ];
      for (const v of variantes) {
        await a.falla(rpc(db, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [v]), /row-level security/);
      }
    });
  });

  it('13b. tampoco se cuela una variante con otras mayusculas de la foto que ya tenia puesta', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(async () => {
        await db.exec(`
          alter table storage.objects enable row level security;
          grant select, insert, update, delete on storage.objects to authenticated;
        `);
        await db.query(`update public.profiles set avatar_url = $2, avatar_thumb_url = null where id = $1`, [ANA, url(`${ANA}/Vieja-Foto.jpg`)]);
      });
      await a.como(ANA);
      await a.falla(rpc(db, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ANA}/vieja-foto.jpg`]), /row-level security/);
    });
  });

  it('13c. el formato de la app y el de las fotos antiguas siguen subiendo (no se rompe el flujo normal)', async () => {
    await escenario(db, async (a) => {
      await a.comoPostgres(() =>
        db.exec(`
          alter table storage.objects enable row level security;
          grant select, insert, update, delete on storage.objects to authenticated;
        `),
      );
      await a.como(ANA);
      const nueva = nombres(ANA);
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [nueva.foto, nueva.miniatura]);
      // Como las subia la app antes de la 0020: avatar-<timestamp>.jpg y -mini.jpg.
      await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [`${ANA}/avatar-1700000000009.jpg`, `${ANA}/avatar-1700000000009-mini.jpg`]);
    });
  });

  it('14. quien envia la foto no puede leer decided_by (el uuid del admin), pero si su estado y su motivo', async () => {
    await escenario(db, async (a) => {
      const { id } = await pendienteDeAna(a);
      await db.query('select public.avatar_admin_decide($1, false, $2)', [id, 'Muy oscura']);
      await a.como(ANA);
      await a.falla(rpc(db, 'select decided_by from public.avatar_requests'), /permission denied/);
      await a.falla(rpc(db, 'select * from public.avatar_requests'), /permission denied/);
      // Lo que la app SI pide (ultimaSolicitudFoto) sigue funcionando.
      const propia = await filas(db, 'select id, status, reason, created_at from public.avatar_requests');
      assert.equal(propia[0].status, 'rechazada');
      assert.equal(propia[0].reason, 'Muy oscura');
    });
  });
});
