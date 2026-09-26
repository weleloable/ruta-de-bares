import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * 0032: lo que sobra se borra, la prueba se protege, y borrarse la cuenta ya no
 * se bloquea por una denuncia abierta.
 *
 * Lo que se asegura sobre Postgres real, variante por variante:
 *  1. la foto de una denuncia es PRUEBA: ni su duena ni un admin la borran, ni
 *     desde la app ni llamando a la API (la policy es la que manda);
 *  2. SOBRA exactamente lo que no se usa: sustituidas, rechazadas y huerfanas;
 *     nunca la puesta, la pendiente, la prueba ni lo recien subido;
 *  3. liberar avisa de las otras denuncias abiertas, no deja liberar una foto en
 *     uso, y lo liberado pasa a sobrar;
 *  4. retirar la foto la apunta en la denuncia y la protege;
 *  5. borrar la ruta deja la prueba sin proteger (y por tanto sobrante);
 *  6. borrarse la cuenta con una denuncia abierta se puede, y quien vuelve con
 *     el mismo correo la recupera; con otro correo, no;
 *  7. resuelta la denuncia, el HMAC desaparece;
 *  8. las denuncias abiertas de antes de la 0032 tambien reciben su HMAC.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const nombres = readdirSync(join(raiz, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && f < '0033')
  .sort();
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const hasta0031 = migraciones.slice(0, -1);
const m0032 = migraciones.at(-1) as string;

const ANA = '00000000-0000-4000-8000-00000000000a';
const LUIS = '00000000-0000-4000-8000-00000000000b';
const EVA = '00000000-0000-4000-8000-00000000000c';
const ADMIN = '00000000-0000-4000-8000-00000000000d';
const RUTA = '00000000-0000-4000-8000-0000000000f1';

const url = (ruta: string) => `https://proyecto.supabase.co/storage/v1/object/public/avatars/${ruta}`;
const f = (uid: string, nombre: string) => `${uid}/${nombre}.jpg`;

// Los ficheros de Ana, por lo que son.
const PUESTA = f(ANA, 'puesta');
const PUESTA_MINI = f(ANA, 'puesta-mini');
const DENUNCIADA = f(ANA, 'denunciada');
const DENUNCIADA_MINI = f(ANA, 'denunciada-mini');
const PENDIENTE = f(ANA, 'pendiente');
const PENDIENTE_MINI = f(ANA, 'pendiente-mini');
const RECHAZADA = f(ANA, 'rechazada');
const RECHAZADA_MINI = f(ANA, 'rechazada-mini');
const SUSTITUIDA = f(ANA, 'sustituida');
const SUSTITUIDA_MINI = f(ANA, 'sustituida-mini');
const HUERFANA_VIEJA = f(ANA, 'de-antes-de-la-0020');
const RECIEN_SUBIDA = f(ANA, 'recien-subida');
const DE_LUIS = f(LUIS, 'puesta');

const DATOS = `
  insert into auth.users (id, email) values
    ('${ANA}', 'ana@example.com'),
    ('${LUIS}', 'luis@example.com'),
    ('${EVA}', 'eva@example.com'),
    ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
    values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_members (route_id, user_id) values
    ('${RUTA}', '${ANA}'), ('${RUTA}', '${LUIS}'), ('${RUTA}', '${EVA}');

  -- Todo subido hace un dia, salvo lo recien subido.
  insert into storage.objects (bucket_id, name, created_at)
  select 'avatars', n, now() - interval '1 day' from unnest(array[
    '${PUESTA}', '${PUESTA_MINI}', '${DENUNCIADA}', '${DENUNCIADA_MINI}',
    '${PENDIENTE}', '${PENDIENTE_MINI}', '${RECHAZADA}', '${RECHAZADA_MINI}',
    '${SUSTITUIDA}', '${SUSTITUIDA_MINI}', '${HUERFANA_VIEJA}', '${DE_LUIS}'
  ]) as n;
  insert into storage.objects (bucket_id, name) values ('avatars', '${RECIEN_SUBIDA}');

  insert into public.avatar_requests (user_id, foto_path, thumb_path, status, created_at) values
    ('${ANA}', '${DENUNCIADA}', '${DENUNCIADA_MINI}', 'aprobada', now() - interval '5 day'),
    ('${ANA}', '${SUSTITUIDA}', '${SUSTITUIDA_MINI}', 'sustituida', now() - interval '4 day'),
    ('${ANA}', '${RECHAZADA}', '${RECHAZADA_MINI}', 'rechazada', now() - interval '3 day'),
    ('${ANA}', '${PUESTA}', '${PUESTA_MINI}', 'aprobada', now() - interval '2 day'),
    ('${ANA}', '${PENDIENTE}', '${PENDIENTE_MINI}', 'pendiente', now() - interval '1 day');

  update public.profiles set avatar_url = '${url(DE_LUIS)}' where id = '${LUIS}';
`;

/** Ana lleva puesta la foto que la denuncia va a congelar. */
const PONER_DENUNCIADA = `update public.profiles
  set avatar_url = '${url(DENUNCIADA)}', avatar_thumb_url = '${url(DENUNCIADA_MINI)}' where id = '${ANA}'`;
/** Y despues se la cambia por la de ahora. */
const PONER_PUESTA = `update public.profiles
  set avatar_url = '${url(PUESTA)}', avatar_thumb_url = '${url(PUESTA_MINI)}' where id = '${ANA}'`;

async function denunciar(db: PGlite, quien: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.match_reports (reporter_id, reported_id, route_id, reason)
     values ($1, $2, $3, 'foto') returning id`,
    [quien, ANA, RUTA],
  );
  return rows[0]?.id as string;
}

/** Ana denunciada con la foto DENUNCIADA, que despues cambia por PUESTA. */
async function montar(): Promise<{ db: PGlite; denuncia: string }> {
  const db = await crearBase(migraciones);
  await db.exec(DATOS);
  await db.exec(PONER_DENUNCIADA);
  const denuncia = await denunciar(db, LUIS);
  await db.exec(PONER_PUESTA);
  return { db, denuncia };
}

/** La RLS de Storage de verdad, como en migration-0023.test.ts. */
async function conRlsDeStorage(db: PGlite, a: Actor) {
  await a.comoPostgres(() =>
    db.exec(`
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to authenticated;
    `),
  );
}

async function borrar(db: PGlite, nombre: string): Promise<number> {
  const { rows } = await db.query<{ name: string }>(
    `delete from storage.objects where bucket_id = 'avatars' and name = $1 returning name`,
    [nombre],
  );
  return rows.length;
}

const lista = async (db: PGlite, sql: string) =>
  (await db.query<Record<string, string>>(sql)).rows.map((r) => Object.values(r)[0] as string).sort();

describe('0032: la foto denunciada es prueba', () => {
  it('ni su duena ni un admin la borran; lo demas de su carpeta, si', async () => {
    const { db } = await montar();
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.como(ANA);
      assert.equal(await borrar(db, DENUNCIADA), 0, 'la duena ha borrado la prueba');
      assert.equal(await borrar(db, HUERFANA_VIEJA), 1);
      await a.como(ADMIN);
      assert.equal(await borrar(db, DENUNCIADA), 0, 'un admin ha borrado la prueba sin liberarla');
      assert.equal(await borrar(db, RECHAZADA), 1);
      await a.como(LUIS);
      assert.equal(await borrar(db, SUSTITUIDA), 0, 'se pueden borrar fotos ajenas');
    });
    await db.close();
  });

  it('solo la foto congelada: su miniatura no es prueba', async () => {
    const { db } = await montar();
    const { rows } = await db.query<{ p: boolean; m: boolean }>(
      `select public.avatar_protegida($1) as p, public.avatar_protegida($2) as m`,
      [DENUNCIADA, DENUNCIADA_MINI],
    );
    assert.deepEqual(rows[0], { p: true, m: false });
    await db.close();
  });
});

describe('0032: que sobra', () => {
  it('en tu carpeta: sustituidas, rechazadas y viejas; nunca la puesta, la pendiente, la prueba ni lo recien subido', async () => {
    const { db } = await montar();
    await escenario(db, async (a) => {
      await a.como(ANA);
      const sobran = await lista(db, 'select * from public.mis_fotos_sobrantes()');
      assert.deepEqual(
        sobran,
        [DENUNCIADA_MINI, HUERFANA_VIEJA, RECHAZADA, RECHAZADA_MINI, SUSTITUIDA, SUSTITUIDA_MINI].sort(),
      );
      for (const nunca of [PUESTA, PUESTA_MINI, PENDIENTE, PENDIENTE_MINI, DENUNCIADA, RECIEN_SUBIDA]) {
        assert.ok(!sobran.includes(nunca), `${nunca} no deberia sobrar`);
      }
    });
    await db.close();
  });

  it('cada cual ve solo lo suyo; un admin, todo el bucket', async () => {
    const { db } = await montar();
    await escenario(db, async (a) => {
      await a.como(LUIS);
      assert.deepEqual(await lista(db, 'select * from public.mis_fotos_sobrantes()'), []);
      await a.falla(() => db.query('select * from public.avatar_admin_sobrantes()'), 'NOT_ADMIN');
      await a.como(ADMIN);
      const todo = await lista(db, 'select * from public.avatar_admin_sobrantes()');
      assert.ok(todo.includes(RECHAZADA) && todo.includes(HUERFANA_VIEJA));
      assert.ok(!todo.includes(DE_LUIS), 'la foto puesta de Luis no sobra');
    });
    await db.close();
  });

  it('lo recien subido tiene gracia solo mientras no es de ninguna solicitud', async () => {
    const { db } = await montar();
    await db.exec(`insert into public.avatar_requests (user_id, foto_path, thumb_path, status)
                   values ('${ANA}', '${RECIEN_SUBIDA}', '${f(ANA, 'x')}', 'rechazada')`);
    await escenario(db, async (a) => {
      await a.como(ANA);
      assert.ok((await lista(db, 'select * from public.mis_fotos_sobrantes()')).includes(RECIEN_SUBIDA));
    });
    await db.close();
  });

  it('la gracia NO vale para una cuenta borrada ni para lo liberado: su prueba reciente se borra ya', async () => {
    // Encontrado probando contra la API real: denuncia a los dos minutos de
    // subir la foto, la persona se borra la cuenta (sus solicitudes se van con
    // ella) y el admin libera la foto. Parecia "recien subida sin solicitud" y
    // la limpieza se la saltaba.
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    const RECIENTE = f(ANA, 'denunciada-reciente');
    await db.exec(`insert into storage.objects (bucket_id, name) values ('avatars', '${RECIENTE}')`);
    await db.exec(`update public.profiles set avatar_url = '${url(RECIENTE)}' where id = '${ANA}'`);
    const denuncia = await denunciar(db, LUIS);
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query('select public.delete_my_account()');
      await a.como(ADMIN);
      await db.query('select public.match_admin_liberar_foto($1, $2)', [denuncia, url(RECIENTE)]);
      assert.ok((await lista(db, 'select * from public.avatar_admin_sobrantes()')).includes(RECIENTE));
    });
    await db.close();
  });

  it('sin sesion no hay lista', async () => {
    const { db } = await montar();
    await assert.rejects(db.query('select * from public.mis_fotos_sobrantes()'), /NOT_AUTHENTICATED/);
    await db.close();
  });
});

describe('0032: liberar la foto de una denuncia', () => {
  it('avisa de cuantas denuncias abiertas mas la tienen, y liberada sobra y se puede borrar', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await db.exec(PONER_DENUNCIADA);
    const deLuis = await denunciar(db, LUIS);
    await denunciar(db, EVA);
    await db.exec(PONER_PUESTA);
    await escenario(db, async (a) => {
      await conRlsDeStorage(db, a);
      await a.como(ADMIN);
      const { rows: fotos } = await db.query<{ foto_url: string; en_uso: boolean; otras_abiertas: number }>(
        'select * from public.match_admin_fotos_denuncia($1)',
        [deLuis],
      );
      assert.equal(fotos.length, 1);
      assert.equal(fotos[0]?.en_uso, false);
      assert.equal(fotos[0]?.otras_abiertas, 1, 'la de Eva tambien la tiene');

      const { rows } = await db.query<{ n: number }>('select public.match_admin_liberar_foto($1, $2) as n', [
        deLuis,
        url(DENUNCIADA),
      ]);
      assert.equal(rows[0]?.n, 1);
      assert.ok((await lista(db, 'select * from public.avatar_admin_sobrantes()')).includes(DENUNCIADA));
      assert.equal(await borrar(db, DENUNCIADA), 1);

      // Liberar dos veces no rompe nada.
      await db.query('select public.match_admin_liberar_foto($1, $2)', [deLuis, url(DENUNCIADA)]);
    });
    await db.close();
  });

  it('no se libera la foto que tiene puesta: eso es retirarla, con motivo y aviso', async () => {
    const db = await crearBase(migraciones);
    await db.exec(DATOS);
    await db.exec(PONER_DENUNCIADA);
    const denuncia = await denunciar(db, LUIS);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      const { rows } = await db.query<{ en_uso: boolean }>('select * from public.match_admin_fotos_denuncia($1)', [
        denuncia,
      ]);
      assert.equal(rows[0]?.en_uso, true);
      await a.falla(
        () => db.query('select public.match_admin_liberar_foto($1, $2)', [denuncia, url(DENUNCIADA)]),
        'PHOTO_IN_USE',
      );
    });
    await db.close();
  });

  it('solo un admin, y solo una foto de esa denuncia', async () => {
    const { db, denuncia } = await montar();
    await escenario(db, async (a) => {
      await a.como(LUIS);
      await a.falla(
        () => db.query('select public.match_admin_liberar_foto($1, $2)', [denuncia, url(DENUNCIADA)]),
        'NOT_ADMIN',
      );
      await a.como(ADMIN);
      await a.falla(
        () => db.query('select public.match_admin_liberar_foto($1, $2)', [denuncia, url(RECHAZADA)]),
        'PHOTO_NOT_IN_REPORT',
      );
      await a.falla(() => db.query('select * from public.match_admin_fotos_denuncia($1)', [RUTA]), 'REPORT_NOT_FOUND');
    });
    await db.close();
  });
});

describe('0032: retirar la foto', () => {
  it('apunta en la denuncia la que se retiro, y esa tambien es prueba', async () => {
    const { db, denuncia } = await montar();
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_remove_photo($1, 'No es tuya', $2, '')`, [ANA, denuncia]);
      const { rows } = await a.comoPostgres(() =>
        db.query<{ r: string; a: string | null }>(
          `select r.retired_avatar_url as r, p.avatar_url as a
             from public.match_reports r, public.profiles p where r.id = $1 and p.id = $2`,
          [denuncia, ANA],
        ),
      );
      assert.equal(rows[0]?.r, url(PUESTA));
      assert.equal(rows[0]?.a, null, 'se le quito del perfil');

      const fotos = await lista(db, `select foto_url from public.match_admin_fotos_denuncia('${denuncia}')`);
      assert.deepEqual(fotos, [url(DENUNCIADA), url(PUESTA)].sort());
      const sobran = await lista(db, 'select * from public.avatar_admin_sobrantes()');
      assert.ok(!sobran.includes(PUESTA), 'la retirada no puede sobrar: es prueba');
      assert.ok(sobran.includes(PUESTA_MINI), 'su miniatura si');
    });
    await db.close();
  });
});

describe('0032: borrar la ruta', () => {
  it('se lleva la denuncia y la prueba pasa a sobrar', async () => {
    const { db } = await montar();
    await db.exec(`delete from public.routes where id = '${RUTA}'`);
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      assert.ok((await lista(db, 'select * from public.avatar_admin_sobrantes()')).includes(DENUNCIADA));
    });
    await db.close();
  });
});

describe('0032: borrarse la cuenta con una denuncia abierta', () => {
  const quienEsLaDenunciada = async (db: PGlite, id: string) =>
    (await db.query<{ r: string | null }>('select reported_id as r from public.match_reports where id = $1', [id]))
      .rows[0]?.r;

  it('se puede; la denuncia y su prueba se quedan; volver con el mismo correo la recupera', async () => {
    const { db, denuncia } = await montar();
    await escenario(db, async (a) => {
      await a.como(ANA);
      const { rows } = await db.query<{ b: string[] }>('select public.delete_my_account_blockers() as b');
      assert.deepEqual(rows[0]?.b, []);
      const { rows: retenidas } = await db.query<{ n: string }>('select * from public.mis_fotos_retenidas() as n');
      assert.deepEqual(
        retenidas.map((r) => r.n),
        [DENUNCIADA],
      );
      await db.query('select public.delete_my_account()');

      await a.comoPostgres(async () => {
        assert.equal(await quienEsLaDenunciada(db, denuncia), null);
        const { rows: p } = await db.query<{ n: number }>(
          `select count(*)::int as n from public.avatar_protegida('${DENUNCIADA}') x where x`,
        );
        assert.equal(p[0]?.n, 1, 'la prueba sigue protegida sin la cuenta');

        const NUEVA = '00000000-0000-4000-8000-0000000000aa';
        await db.exec(`insert into auth.users (id, email) values ('${NUEVA}', 'ana@example.com')`);
        assert.equal(await quienEsLaDenunciada(db, denuncia), NUEVA, 'la denuncia no encontro a Ana');
      });
    });
    await db.close();
  });

  it('con otro correo no la recupera nadie', async () => {
    const { db, denuncia } = await montar();
    await escenario(db, async (a) => {
      await a.como(ANA);
      await db.query('select public.delete_my_account()');
      await a.comoPostgres(async () => {
        await db.exec(`insert into auth.users (id, email)
                       values ('00000000-0000-4000-8000-0000000000bb', 'otra@example.com')`);
        assert.equal(await quienEsLaDenunciada(db, denuncia), null);
      });
    });
    await db.close();
  });

  it('resuelta, el HMAC desaparece y ya no recupera nada', async () => {
    const { db, denuncia } = await montar();
    await escenario(db, async (a) => {
      await a.como(ADMIN);
      await db.query(`select public.match_admin_resolve($1, 'sin_accion', '')`, [denuncia]);
      await a.como(ANA);
      await db.query('select public.delete_my_account()');
      await a.comoPostgres(async () => {
        const { rows } = await db.query<{ h: string | null }>(
          'select reported_email_hmac as h from public.match_reports where id = $1',
          [denuncia],
        );
        assert.equal(rows[0]?.h, null);
        await db.exec(`insert into auth.users (id, email)
                       values ('00000000-0000-4000-8000-0000000000cc', 'ana@example.com')`);
        assert.equal(await quienEsLaDenunciada(db, denuncia), null);
      });
    });
    await db.close();
  });

  it('las denuncias abiertas de antes de la 0032 tambien reciben su HMAC', async () => {
    const db = await crearBase(hasta0031);
    await db.exec(DATOS);
    await db.exec(`insert into public.match_reports (reporter_id, reported_id, route_id, reason)
                   values ('${LUIS}', '${ANA}', '${RUTA}', 'foto')`);
    await db.exec(m0032);
    const { rows } = await db.query<{ h: string | null }>('select reported_email_hmac as h from public.match_reports');
    assert.ok(rows[0]?.h, 'la denuncia vieja se quedo sin HMAC');
    await db.close();
  });
});
