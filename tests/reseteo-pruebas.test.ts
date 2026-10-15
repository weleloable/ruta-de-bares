import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { crearBase, escenario, leerFichero, type Actor } from './pglite-supabase.ts';

/**
 * scripts/reseteo-pruebas/reseteo.sql y restaurar.sql (borrar los datos de prueba
 * de produccion y volver atras). Dos clases de prueba:
 *
 *  1. ESTRUCTURA. Cada tabla de `public` esta en el plan de borrado o en la lista
 *     de "se queda" de aqui, con su motivo. Si una migracion nueva anade una
 *     tabla, este test falla hasta que alguien decida si el reseteo la vacia.
 *     Sin esto, una tabla nueva de puntos o mensajes se quedaria llena en
 *     silencio despues de un reseteo.
 *  2. COMPORTAMIENTO, contra Postgres (PGlite) con todas las migraciones: el
 *     simulacro no toca nada, el reseteo vacia lo que dice y NADA mas, deja copia
 *     completa, se deshace entero si algo cambia sin tocar, y restaurar lo devuelve.
 *
 * La prueba con el Supabase real y datos en todas las tablas esta en
 * scripts/reseteo-pruebas/probar-local.mjs (necesita Docker).
 */

const nombres = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
const migraciones = nombres.map((n) => leerFichero(`supabase/migrations/${n}`));
const RESETEO = leerFichero('scripts/reseteo-pruebas/reseteo.sql');
const RESTAURAR = leerFichero('scripts/reseteo-pruebas/restaurar.sql');

/** Las tablas que el reseteo vacia, leidas del propio script. */
function tablasDelPlan(sql: string): string[] {
  const bloque = /insert into reseteo_plan[\s\S]*?;/.exec(sql)?.[0] ?? '';
  return [...bloque.matchAll(/\(\d+,\s*'[^']+',\s*'(\w+)',/g)].map((m) => m[1] as string);
}
function tablasDeRestaurar(sql: string): string[] {
  const bloque = /v_tablas constant text\[\] := array\[([\s\S]*?)\];/.exec(sql)?.[1] ?? '';
  return [...bloque.matchAll(/'(\w+)'/g)].map((m) => m[1] as string);
}

/**
 * Lo que el reseteo NO toca, y por que. Si anades una tabla y no esta en el plan
 * ni aqui, el test de estructura falla: hay que elegir.
 */
const SE_QUEDA: Record<string, string> = {
  profiles: 'las cuentas y sus fotos puestas',
  routes: 'las rutas',
  route_bars: 'las paradas',
  route_members: 'quien esta en cada ruta',
  route_invites: 'las invitaciones',
  catalog_bars: 'el catalogo de bares',
  user_houses: 'la casa de cada persona (decidido: se queda)',
  point_rules: 'cuanto vale cada accion',
  retos: 'los retos que crean los admins (definiciones, no resultados)',
  temporadas: 'las temporadas que crean los admins (definiciones)',
  casas_marcador: 'una fila por ruta para el tiempo real: se avisa, no se borra',
  match_profiles: 'quien tiene La Caña activada, su frase y etiquetas',
  match_profile_tags: 'etiquetas de cada perfil',
  match_route_activations: 'activacion de La Caña por ruta',
  match_tags: 'el catalogo de etiquetas',
  qr_codigos: 'el codigo QR de cada persona (identidad, no puntos)',
  push_suscripciones: 'los dispositivos con avisos activados',
  push_preferencias: 'lo que cada persona quiere que le avisen',
  admin_rutas_terminadas_vistas: 'que admin ya vio el aviso de una ruta terminada (no es moderacion)',
  app_secrets: 'la clave con la que se firman los vetos: NO borrar nunca',
  admin_cuentas_borradas: 'quien borro que cuenta y por que (0068): restaurar no devuelve la cuenta, asi que el rastro se queda',
};
/** Tablas de las que el reseteo solo borra una parte (fotos pendientes, avisos sin enviar). */
const SOLO_PENDIENTES = new Set(['avatar_requests', 'push_cola']);

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const RUTA = '00000000-0000-4000-8000-0000000000f1';
const BAR1 = '00000000-0000-4000-8000-0000000000b1';
const BAR2 = '00000000-0000-4000-8000-0000000000b2';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hoyUtc = () => new Date().toISOString().slice(0, 10);
const conConfirmar = (sql: string, valor: string, fecha = hoyUtc()) => {
  const salida = sql
    .replace(/(v_confirmar constant text := )'(NO|SI)'/, `$1'${valor}'`)
    .replace(/(v_fecha constant text := )'[^']*'/, `$1'${fecha}'`);
  assert.ok(salida.includes(`v_confirmar constant text := '${valor}'`), 'no se pudo poner el valor en el script');
  return salida;
};
const conEsquema = (sql: string, esquema: string, valor: string) =>
  conConfirmar(sql.replace("'reseteo_AAAAMMDD_HHMMSS'", `'${esquema}'`), valor);

/** Un mundo con datos en las tablas que mas importan: sellos, puntos, mensajes, moderacion y avisos. */
const DATOS = `
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com');
  update public.profiles set role = 'admin' where id = '${ADMIN}';
  insert into public.routes (id, name, is_published, created_by, event_date)
  values ('${RUTA}', 'Ruta de prueba', true, '${ADMIN}', current_date);
  insert into public.route_bars (id, route_id, sort_order, name, lat, lng, opens_at, closes_at) values
    ('${BAR1}', '${RUTA}', 0, 'Uno', 40.48, -3.36, now() - interval '1 hour', now() + interval '5 hours'),
    ('${BAR2}', '${RUTA}', 1, 'Dos', 40.49, -3.36, now() - interval '1 hour', now() + interval '5 hours');
  ${[1, 2, 3, 4]
    .map(
      (n) => `insert into auth.users (id, email) values ('${uid(n)}', 'u${n}@example.com');
              update public.profiles set display_name = 'Persona${n}' where id = '${uid(n)}';
              insert into public.route_members (route_id, user_id) values ('${RUTA}', '${uid(n)}');
              insert into public.match_profiles (user_id, is_active) values ('${uid(n)}', true) on conflict do nothing;`,
    )
    .join('\n')}
  insert into public.push_suscripciones (endpoint, user_id, p256dh, auth) values
    ('https://push.example.com/a', '${ADMIN}', 'p256dh-de-prueba', 'auth-prueba');
  -- Un aviso sin enviar (se borra) y uno ya enviado (se queda). Se meten a mano: lo
  -- que los genera desde las denuncias (0066) no esta en todas las versiones.
  insert into public.push_cola (user_id, tipo, clave, titulo, cuerpo, enviada_at) values
    ('${ADMIN}', 'cana', 'reseteo-prueba:pendiente', 'Pendiente', 'Sin enviar', null),
    ('${ADMIN}', 'cana', 'reseteo-prueba:enviado', 'Enviado', 'Ya enviado', now());
`;

async function mundo(db: PGlite, a: Actor) {
  await a.comoPostgres(() => db.exec(DATOS));
  // sellos y los puntos que dan
  for (const n of [1, 2]) {
    await a.como(uid(n));
    await db.query(`select public.claim_stamp('${BAR1}', 40.48, -3.36)`);
  }
  // minijuego
  await a.como(uid(1));
  await db.query(`select public.minigame_submit_nota('${RUTA}', 'cana-perfecta', 20, 30000)`);
  // mensajes a la organizacion y una denuncia (genera avisos a admins: 0066)
  await a.como(uid(3));
  await db.query(`select public.send_admin_message('contacto', 'Hola', null)`);
  await a.como(uid(1));
  await db.query(`select public.match_report('${RUTA}', '${uid(4)}', 'acoso', 'detalle', null, false)`);
  // sanciones
  await a.como(ADMIN);
  await db.query(`select public.match_admin_suspend('${uid(3)}', 'Motivo de prueba')`);
  await db.query(`select public.match_admin_remove_from_route('${uid(4)}', '${RUTA}', 'Motivo de prueba')`);
  // veto de La Caña: vive en match_profiles.blocked_* y en cana_bans
  await db.query(`select public.match_admin_deactivate('${uid(2)}', 'Motivo de prueba')`);
  // una foto pendiente (y una ya aprobada, que NO se borra)
  await a.comoPostgres(() => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [`${uid(2)}/f.jpg`, `${uid(2)}/f-mini.jpg`]));
  await a.como(uid(2));
  const url = (r: string) => `https://x.supabase.co/storage/v1/object/public/avatars/${r}`;
  // la del admin se aprueba sola: esa NO se borra
  await a.comoPostgres(() => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [`${ADMIN}/g.jpg`, `${ADMIN}/g-mini.jpg`]));
  await a.como(ADMIN);
  await db.query('select public.avatar_request_submit($1, $2, $3, $4)', [`${ADMIN}/g.jpg`, `${ADMIN}/g-mini.jpg`, `https://x.supabase.co/storage/v1/object/public/avatars/${ADMIN}/g.jpg`, `https://x.supabase.co/storage/v1/object/public/avatars/${ADMIN}/g-mini.jpg`]);
  await a.como(uid(2));
  await db.query('select public.avatar_request_submit($1, $2, $3, $4)', [`${uid(2)}/f.jpg`, `${uid(2)}/f-mini.jpg`, url(`${uid(2)}/f.jpg`), url(`${uid(2)}/f-mini.jpg`)]);
}

type Huella = Record<string, { n: number; h: string }>;
async function huellas(db: PGlite, esquema = 'public'): Promise<Huella> {
  const { rows: tablas } = await db.query<{ t: string }>(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = $1 and c.relkind = 'r' order by 1`, [esquema]);
  const salida: Huella = {};
  for (const { t } of tablas) {
    const { rows } = await db.query<{ n: string; h: string }>(
      `select count(*)::text as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as h from ${esquema}.${t} x`,
    );
    salida[t] = { n: Number(rows[0]?.n), h: rows[0]?.h ?? '' };
  }
  return salida;
}
const cambiadas = (a: Huella, b: Huella, salvo: string[] = []) =>
  Object.keys(a).filter((t) => !salvo.includes(t) && (a[t]?.h !== b[t]?.h || a[t]?.n !== b[t]?.n));

/** Cada prueba recibe la base con el mundo ya montado y un `pg` que ejecuta como el SQL Editor (postgres). */
async function conBase(fn: (db: PGlite, a: Actor, pg: Postgres) => Promise<void>) {
  const db = await crearBase(migraciones);
  try {
    await escenario(db, async (a) => {
      await mundo(db, a);
      const pg: Postgres = {
        exec: (sql) => a.comoPostgres(async () => ((await db.exec(sql)).at(-1)?.rows ?? []) as Record<string, unknown>[]),
        huellas: (esquema) => a.comoPostgres(() => huellas(db, esquema)),
        copias: () => a.comoPostgres(() => esquemasCopia(db)),
        uno: (sql) => a.comoPostgres(async () => Number(Object.values((await db.query<Record<string, unknown>>(sql)).rows[0] ?? {})[0])),
      };
      await fn(db, a, pg);
    });
  } finally {
    await db.close();
  }
}
/** Ejecuta un script que TIENE que fallar y comprueba el mensaje; el savepoint deja usable la transaccion de la prueba. */
async function debeFallar(db: PGlite, a: Actor, sql: string, patron: RegExp) {
  let mensaje = 'no fallo';
  await a.comoPostgres(async () => {
    await db.exec('savepoint prueba_reseteo');
    try {
      await db.exec(sql);
    } catch (e) {
      mensaje = (e as Error).message;
    }
    await db.exec('rollback to savepoint prueba_reseteo');
  });
  assert.match(mensaje, patron);
}type Postgres = {
  exec(sql: string): Promise<Record<string, unknown>[]>;
  huellas(esquema?: string): Promise<Huella>;
  copias(): Promise<string[]>;
  uno(sql: string): Promise<number>;
};
const esquemasCopia = async (db: PGlite) =>
  (await db.query<{ n: string }>(`select nspname as n from pg_namespace where nspname like 'reseteo\\_%' order by 1`)).rows.map((r) => r.n);

describe('reseteo de datos de prueba: estructura', () => {
  it('cada tabla de public esta en el plan de borrado o en la lista de "se queda", y solo en una', async () => {
    const db = await crearBase(migraciones);
    try {
      const { rows } = await db.query<{ t: string }>(`select tablename as t from pg_tables where schemaname = 'public' order by 1`);
      const todas = rows.map((r) => r.t);
      const plan = new Set(tablasDelPlan(RESETEO));
      const sinDecidir = todas.filter((t) => !plan.has(t) && !(t in SE_QUEDA));
      assert.deepEqual(sinDecidir, [], `tablas nuevas sin decidir si el reseteo las vacia: ${sinDecidir.join(', ')}. Anadelas al plan de scripts/reseteo-pruebas/reseteo.sql y restaurar.sql, o a SE_QUEDA con su motivo.`);
      const repetidas = [...plan].filter((t) => t in SE_QUEDA);
      assert.deepEqual(repetidas, [], 'una tabla no puede borrarse y quedarse a la vez');
      const fantasmas = [...plan, ...Object.keys(SE_QUEDA)].filter((t) => !todas.includes(t));
      assert.deepEqual(fantasmas, [], `tablas que ya no existen: ${fantasmas.join(', ')}`);
    } finally {
      await db.close();
    }
  });

  it('restaurar.sql devuelve exactamente las tablas que reseteo.sql borra', () => {
    assert.deepEqual([...tablasDeRestaurar(RESTAURAR)].sort(), [...tablasDelPlan(RESETEO)].sort());
    assert.ok(tablasDelPlan(RESETEO).length >= 25, 'el detector del plan no encuentra tablas');
  });

  it('restaurar respeta las claves ajenas: cada tabla va despues de las que necesita', () => {
    const orden = tablasDeRestaurar(RESTAURAR);
    const antes = (a: string, b: string) => orden.indexOf(a) < orden.indexOf(b);
    assert.ok(antes('match_connections', 'match_connection_members') && antes('match_connections', 'match_messages'));
    assert.ok(antes('match_reports', 'match_report_messages') && antes('match_reports', 'match_moderation_log'));
  });

  it('el reseteo nunca toca la clave de los vetos ni las cuentas', () => {
    const plan = tablasDelPlan(RESETEO);
    for (const intocable of ['app_secrets', 'profiles', 'routes', 'route_members', 'user_houses', 'point_rules', 'push_suscripciones']) {
      assert.ok(!plan.includes(intocable), `${intocable} esta en el plan de borrado`);
    }
  });

  it('todo `delete` y `update` del script lleva WHERE (pg-safeupdate lo exige en la API)', () => {
    const sinComentarios = RESETEO.replace(/--.*$/gm, '');
    assert.match(sinComentarios, /delete from public\.%I where %s/);
    assert.match(sinComentarios, /update public\.casas_marcador set cambiado_at = now\(\) where true;/);
  });
});

describe('reseteo de datos de prueba: comportamiento', () => {
  it('el simulacro no toca NI UNA fila y no crea copia', async () => {
    await conBase(async (_db, _a, pg) => {
      const antes = await pg.huellas();
      const informe = await pg.exec(RESETEO);
      assert.deepEqual(cambiadas(antes, await pg.huellas()), []);
      assert.deepEqual(await pg.copias(), []);
      assert.ok(informe.some((f) => f.tabla === 'stamps' && Number(f.antes) === 2), 'el informe no cuenta los sellos');
      assert.ok(informe.filter((f) => f.grupo === 'NO SE TOCA (debe quedar igual)').every((f) => f.nota === 'igual'));
    });
  });

  it('con SI vacia lo que dice, deja todo lo demas IDENTICO y guarda una copia completa', async () => {
    await conBase(async (_db, _a, pg) => {
      const antes = await pg.huellas();
      const plan = tablasDelPlan(RESETEO);
      for (const t of ['stamps', 'point_movements', 'user_messages', 'user_notices', 'match_reports', 'account_suspensions', 'route_bans', 'avatar_requests', 'minigame_scores', 'push_cola']) {
        assert.ok((antes[t]?.n ?? 0) > 0, `el mundo de prueba no tiene datos en ${t}`);
      }
      const fotosAprobadas = await pg.uno(`select count(*)::int from public.avatar_requests where status <> 'pendiente'`);
      const fotosPendientes = await pg.uno(`select count(*)::int from public.avatar_requests where status = 'pendiente'`);
      const avisosPendientes = await pg.uno(`select count(*)::int from public.push_cola where enviada_at is null`);
      const vetosAntes = await pg.uno(`select count(*)::int from public.match_profiles where blocked_at is not null`);
      assert.ok(fotosAprobadas > 0 && fotosPendientes > 0 && vetosAntes > 0, 'el mundo no tiene fotos de las dos clases ni un veto');
      await pg.exec(conConfirmar(RESETEO, 'SI'));
      const despues = await pg.huellas();
      for (const t of plan) {
        if (SOLO_PENDIENTES.has(t)) continue;
        assert.equal(despues[t]?.n, 0, `${t} no ha quedado a cero`);
      }
      assert.equal(await pg.uno(`select count(*)::int from public.push_cola where enviada_at is null`), 0, 'quedan avisos sin enviar');
      assert.equal(await pg.uno(`select count(*)::int from public.avatar_requests where status = 'pendiente'`), 0, 'quedan fotos pendientes');
      assert.equal(await pg.uno(`select count(*)::int from public.avatar_requests where status <> 'pendiente'`), fotosAprobadas, 'se han borrado fotos ya decididas');
      assert.equal(await pg.uno(`select count(*)::int from public.match_profiles where blocked_at is not null`), 0, 'quedan vetos de La Cana sin levantar');
      assert.equal(despues.match_profiles?.n, antes.match_profiles?.n, 'cambio el numero de perfiles de La Cana');
      assert.deepEqual(cambiadas(antes, despues, [...plan, 'casas_marcador', 'match_profiles']), [], 'el reseteo ha cambiado tablas que no tocaba');
      const [copia] = await pg.copias();
      assert.match(copia ?? '', /^reseteo_\d{8}_\d{6}$/);
      const enCopia = await pg.huellas(copia as string);
      for (const t of plan) {
        const esperado = t === 'avatar_requests' ? fotosPendientes : t === 'push_cola' ? avisosPendientes : antes[t]?.n;
        assert.equal(enCopia[t]?.n, esperado, `la copia de ${t} no esta completa`);
        if (!SOLO_PENDIENTES.has(t)) assert.equal(enCopia[t]?.h, antes[t]?.h, `la copia de ${t} no es identica`);
      }
      assert.equal(enCopia.match_profiles_vetos?.n, vetosAntes, 'la copia no guarda los vetos de La Cana');
    });
  });

  it('la copia no la ve nadie: ni anon ni authenticated, y con RLS en cada tabla', async () => {
    await conBase(async (_db, _a, pg) => {
      await pg.exec(conConfirmar(RESETEO, 'SI'));
      const [copia] = await pg.copias();
      for (const rol of ['anon', 'authenticated']) {
        assert.equal(await pg.uno(`select case when has_schema_privilege('${rol}', '${copia}', 'usage') then 1 else 0 end`), 0, `${rol} puede entrar en la copia`);
        assert.equal(await pg.uno(`select case when has_table_privilege('${rol}', '${copia}.stamps', 'select') then 1 else 0 end`), 0, `${rol} puede leer la copia`);
      }
      assert.equal(await pg.uno(`select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = '${copia}' and c.relkind = 'r' and not c.relrowsecurity`), 0, 'hay tablas de la copia sin RLS');
    });
  });

  it('sin la fecha de hoy NO borra (un script guardado no vale otro dia), pero el simulacro no la pide', async () => {
    await conBase(async (db, a, pg) => {
      const antes = await pg.huellas();
      await debeFallar(db, a, conConfirmar(RESETEO, 'SI', '2020-01-01'), /pon en v_fecha la fecha de hoy/);
      await debeFallar(db, a, conConfirmar(RESETEO, 'SI', 'AAAA-MM-DD'), /pon en v_fecha la fecha de hoy/);
      assert.deepEqual(cambiadas(antes, await pg.huellas()), []);
      assert.deepEqual(await pg.copias(), []);
      await pg.exec(conConfirmar(RESETEO, 'NO', 'AAAA-MM-DD')); // el simulacro funciona con la fecha sin poner
    });
  });

  it('si otra tabla cambia durante el borrado, se deshace TODO: no se borra nada ni queda copia', async () => {
    await conBase(async (db, a, pg) => {
      await a.comoPostgres(() => db.exec(`
        create function public.zz_trampa() returns trigger language plpgsql as $f$ begin insert into public.temporadas (nombre) values ('trampa'); return null; end $f$;
        create trigger zz_trampa after update on public.match_profiles for each statement execute function public.zz_trampa();`));
      const antes = await pg.huellas();
      await debeFallar(db, a, conConfirmar(RESETEO, 'SI'), /ha cambiado sin que tocase/);
      assert.deepEqual(cambiadas(antes, await pg.huellas()), [], 'tras el fallo hay tablas distintas');
      assert.deepEqual(await pg.copias(), [], 'quedo una copia a medias');
    });
  });

  it("un valor que no es 'SI' ni 'NO' se rechaza sin tocar nada", async () => {
    await conBase(async (db, a, pg) => {
      const antes = await pg.huellas();
      await debeFallar(db, a, conConfirmar(RESETEO, 'QUIZAS'), /tiene que ser/);
      assert.deepEqual(cambiadas(antes, await pg.huellas()), []);
    });
  });

  it('si ya esta todo a cero no crea otra copia vacia', async () => {
    await conBase(async (_db, _a, pg) => {
      await pg.exec(conConfirmar(RESETEO, 'SI'));
      const una = await pg.copias();
      await pg.exec(conConfirmar(RESETEO, 'SI'));
      assert.deepEqual(await pg.copias(), una);
    });
  });

  it('restaurar devuelve cada tabla, fila a fila, y sin duplicar puntos', async () => {
    await conBase(async (_db, _a, pg) => {
      const antes = await pg.huellas();
      await pg.exec(conConfirmar(RESETEO, 'SI'));
      const [copia] = await pg.copias();
      const plan = tablasDelPlan(RESETEO).filter((t) => t !== 'push_cola');
      const vacia = await pg.huellas();
      await pg.exec(conEsquema(RESTAURAR, copia as string, 'NO'));
      assert.deepEqual(cambiadas(vacia, await pg.huellas()), [], 'el simulacro de restaurar toco algo');
      await pg.exec(conEsquema(RESTAURAR, copia as string, 'SI'));
      const restaurada = await pg.huellas();
      for (const t of plan) {
        assert.equal(restaurada[t]?.n, antes[t]?.n, `${t}: ${antes[t]?.n} antes, ${restaurada[t]?.n} al restaurar`);
        assert.equal(restaurada[t]?.h, antes[t]?.h, `${t} no es identica`);
      }
      assert.equal(restaurada.point_movements?.n, antes.point_movements?.n, 'se duplicaron los puntos');
      // los vetos de La Cana vuelven a estar puestos, y match_profiles queda identica a como estaba
      assert.equal(restaurada.match_profiles?.h, antes.match_profiles?.h, 'match_profiles no es identica tras restaurar');
      assert.equal(await pg.uno(`select count(*)::int from public.match_profiles where blocked_at is not null`), 1, 'no volvio el veto');
    });
  });

  it('restaurar dos veces, o sin poner el nombre de la copia, se rechaza sin tocar nada', async () => {
    await conBase(async (db, a, pg) => {
      await pg.exec(conConfirmar(RESETEO, 'SI'));
      const [copia] = await pg.copias();
      await pg.exec(conEsquema(RESTAURAR, copia as string, 'SI'));
      const hecho = await pg.huellas();
      await debeFallar(db, a, conEsquema(RESTAURAR, copia as string, 'SI'), /ya tiene/);
      await debeFallar(db, a, conConfirmar(RESTAURAR, 'SI'), /No existe el esquema/);
      assert.deepEqual(cambiadas(hecho, await pg.huellas()), []);
    });
  });

  it('despues del reseteo la app sigue funcionando: se vuelve a sellar y a dar puntos, y sin sanciones', async () => {
    await conBase(async (db, a, pg) => {
      await pg.exec(conConfirmar(RESETEO, 'SI'));
      await a.como(uid(1));
      await db.query(`select public.claim_stamp('${BAR1}', 40.48, -3.36)`);
      assert.ok((await pg.uno(`select count(*)::int from public.point_movements`)) > 0, 'sellar ya no da puntos');
      assert.equal(await pg.uno(`select case when public.esta_suspendida('${uid(3)}') then 1 else 0 end`), 0, 'sigue suspendida');
      assert.equal(await pg.uno(`select case when public.esta_vetada_de_ruta('${RUTA}', '${uid(4)}') then 1 else 0 end`), 0, 'sigue vetada');
    });
  });
});