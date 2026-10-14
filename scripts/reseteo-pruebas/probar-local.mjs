// Prueba el reseteo (reseteo.sql) y la vuelta atras (restaurar.sql) contra el Supabase
// LOCAL con datos de verdad en TODAS las tablas afectadas:
//
//   node scripts/reseteo-pruebas/probar-local.mjs
//
// BORRA la base local (supabase db reset) y la llena con los flujos del kit de pruebas
// mas lo que falte para que ninguna tabla afectada este vacia. Nunca toca produccion.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { entrar, guardar, psql, psqlEstricto, registrar, SALIDA } from '../pruebas-locales/comun.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const RESETEO = readFileSync(join(aqui, 'reseteo.sql'), 'utf8');
const RESTAURAR = readFileSync(join(aqui, 'restaurar.sql'), 'utf8');

const PLAN = {
  'puntos y sellos': ['point_movements', 'consumiciones', 'encuentros', 'casas_resultados', 'casas_resultado_vistos', 'house_changes', 'stamps', 'sorteo_excluidos', 'sorteos', 'minigame_scores', 'conduces_scores', 'maestro_beers'],
  mensajes: ['user_messages', 'user_notices', 'match_messages', 'match_connection_members', 'match_connections', 'match_votes', 'match_blocks'],
  moderacion: ['match_report_messages', 'match_moderation_log', 'match_reports', 'account_suspensions', 'cana_bans', 'route_bans', 'match_fotos_liberadas', 'avatar_requests'],
};
const BORRADAS = Object.values(PLAN).flat();
const resultados = [];
const paso = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok: Boolean(ok), detalle: String(detalle) });
  console.log(`  ${ok ? 'ok ' : 'MAL'} ${nombre}${detalle ? `\n      ${String(detalle).slice(0, 300)}` : ''}`);
};

// --- huellas: una por tabla, para saber si algo ha cambiado de verdad --------
function huellas(esquema = 'public') {
  const r = psqlEstricto(`
    select string_agg(format('%I|%s|%s', c.relname,
      (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text,
      (xpath('/row/h/text()', query_to_xml(format('select coalesce(md5(string_agg(x::text, ''|'' order by x::text)), '''') as h from %I.%I x', n.nspname, c.relname), false, true, '')))[1]::text),
      E'\\n' order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = '${esquema}' and c.relkind = 'r';`);
  return Object.fromEntries(r.split('\n').filter(Boolean).map((l) => { const [t, n, h] = l.split('|'); return [t, { n: Number(n), h }]; }));
}
const igualesSalvo = (a, b, salvo = []) => Object.keys(a).filter((t) => !salvo.includes(t) && (a[t].h !== b[t]?.h || a[t].n !== b[t]?.n));

/** Ejecuta un fichero SQL en la base local como el SQL Editor (postgres). */
function ejecutar(sql) {
  const r = psql(`\\set ON_ERROR_STOP 1\n${sql}`);
  return { ok: r.status === 0, salida: r.stdout, error: r.stderr };
}
const conConfirmar = (sql, valor) => sql.replace(/(v_confirmar constant text := )'(NO|SI)'/, `$1'${valor}'`);

// ----------------------------------------------------------------------------
console.log('Preparando el mundo (base nueva + flujos + lo que falte)...');
spawnSync('npx', ['-y', 'supabase@latest', 'db', 'reset'], { shell: process.platform === 'win32', stdio: 'ignore' });
const flujos = spawnSync(process.execPath, ['--no-deprecation', join(aqui, '..', 'pruebas-locales', '1-flujos.mjs')], { stdio: 'inherit', env: process.env });
const mundo = JSON.parse(readFileSync(join(SALIDA, 'mundo.json'), 'utf8'));
const U = mundo.usuarios;
const admin = await entrar(U.admin.email);
const cuentas = Object.fromEntries(await Promise.all(Object.entries(U).filter(([k]) => ['ana', 'carla', 'eva', 'fede', 'gema', 'susi', 'dani', 'bea'].includes(k)).map(async ([k, v]) => [k, await entrar(v.email)])));
const rpc = (u, fn, args = {}) => u.c.rpc(fn, args);
const A = mundo.rutas.A;
const B = mundo.rutas.B;
const intento = async (que, p) => { const r = await p; if (r.error) console.log(`    (relleno: ${que}: ${r.error.message})`); return r; };

// Lo que el flujo no deja vivo: se rellena por la API (y por SQL lo que no tiene via de API).
// La Caña: ana y gema se gustan (conexion), se escriben, y ana denuncia a gema CON el chat (copia de mensajes).
await intento('ana->gema me gusta', rpc(cuentas.ana, 'match_set_like', { p_route_id: A, p_target_id: U.gema.id, p_liked: true }));
const conex = await intento('gema->ana me gusta', rpc(cuentas.gema, 'match_set_like', { p_route_id: A, p_target_id: U.ana.id, p_liked: true }));
const idConexion = (Array.isArray(conex.data) ? conex.data[0] : conex.data)?.connection_id;
if (idConexion) {
  await intento('ana pregunta por la cerveza', rpc(cuentas.ana, 'match_ask_beer', { p_connection_id: idConexion }));
  await intento('gema contesta que si', rpc(cuentas.gema, 'match_answer_beer', { p_connection_id: idConexion, p_answer: 'yes' }));
  await intento('texto de ana', rpc(cuentas.ana, 'match_send_text', { p_connection_id: idConexion, p_body: 'Hola, nos vemos en el Hidalgo' }));
  await intento('texto de gema', rpc(cuentas.gema, 'match_send_text', { p_connection_id: idConexion, p_body: 'Vale, voy para alla' }));
  await intento('ana denuncia a gema con el chat', rpc(cuentas.ana, 'match_report', { p_route_id: A, p_target_id: U.gema.id, p_reason: 'otro', p_detail: 'con chat', p_connection_id: idConexion, p_block: false }));
}await intento('un reto', admin.c.from('retos').insert({ route_id: A, nombre: 'Tres bares', tipo: 'bares', objetivo: 3, puntos: 10 }).select());
await intento('una temporada', admin.c.from('temporadas').insert({ nombre: 'Temporada de prueba' }).select());
await intento('suspender a fede', rpc(admin, 'match_admin_suspend', { p_user_id: U.fede.id, p_reason: 'Suspendido para la prueba del reseteo' }));
await intento('veto de La Caña a carla', rpc(admin, 'match_admin_deactivate', { p_user_id: U.carla.id, p_reason: 'Veto para la prueba' }));
await intento('expulsar a eva de B', rpc(admin, 'match_admin_remove_from_route', { p_user_id: U.eva.id, p_route_id: B, p_reason: 'Expulsada para la prueba' }));
await intento('cerrar la ruta B', rpc(admin, 'casas_cerrar_ruta', { p_route_id: B }));
await intento('excluir a gema del sorteo', rpc(admin, 'sorteo_excluir', { p_route_id: A, p_user_id: U.gema.id, p_motivo: 'prueba' }));
await intento('gema bloquea a carla', rpc(cuentas.gema, 'match_block', { p_target_id: U.carla.id }));
await intento('maestro cervecero', rpc(cuentas.gema, 'maestro_submit_beer_v2', { p_route_id: A, p_name: 'Rubia', p_malta: 'palida', p_levadura: 'ale', p_maceracion: 80, p_amargor: 70, p_aroma: 60, p_siembra: 90 }));
await intento('foto pendiente de gema', (async () => {
  const base = `${U.dani.id}/avatar-${Date.now().toString(36)}-r`;
  const d = cuentas.gema;
  const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  for (const r of [`${base}.jpg`, `${base}-mini.jpg`]) await d.c.storage.from('avatars').upload(r, JPEG, { contentType: 'image/jpeg', upsert: false });
  const url = (r) => d.c.storage.from('avatars').getPublicUrl(r).data.publicUrl;
  return d.c.rpc('avatar_request_submit', { p_foto_path: `${base}.jpg`, p_thumb_path: `${base}-mini.jpg`, p_foto_url: url(`${base}.jpg`), p_thumb_url: url(`${base}-mini.jpg`) });
})());
await intento('aviso en cola para un admin', (async () => {
  await rpc(admin, 'push_guardar', { p_endpoint: `https://push.example.com/${U.admin.id}`, p_p256dh: 'p256dh-de-prueba-largo', p_auth: 'auth-de-prueba-largo' });
  return rpc(cuentas.ana, 'send_admin_message', { p_kind: 'contacto', p_body: 'Para que haya un aviso en cola', p_notice_id: null });
})());
psqlEstricto(`
  insert into public.match_fotos_liberadas (path, released_by) values ('${U.ana.id}/prueba-liberada.jpg', '${U.admin.id}') on conflict do nothing;
  insert into public.casas_resultado_vistos (user_id, route_id) values ('${U.ana.id}', '${B}') on conflict do nothing;`);

const antes = huellas();
const vacias = BORRADAS.filter((t) => antes[t]?.n === 0);
paso('el mundo de partida tiene datos en TODAS las tablas que se van a borrar', vacias.length === 0, vacias.length ? `vacias: ${vacias.join(', ')}` : `${BORRADAS.length} tablas, ${BORRADAS.reduce((s, t) => s + antes[t].n, 0)} filas`);
const filasPendientes = Number(psqlEstricto(`select count(*) from public.push_cola where enviada_at is null;`));
paso('hay avisos en cola sin enviar', filasPendientes > 0, `${filasPendientes}`);
const guardadas = ['profiles', 'routes', 'route_bars', 'route_members', 'route_invites', 'user_houses', 'point_rules', 'retos', 'temporadas', 'catalog_bars', 'match_profiles', 'match_tags', 'app_secrets', 'qr_codigos', 'push_suscripciones'];
paso('y las tablas que NO se tocan tambien tienen datos (si no, la prueba no vigilaria nada)', guardadas.filter((t) => (antes[t]?.n ?? 0) === 0).length <= 3, `vacias entre las que se guardan: ${guardadas.filter((t) => (antes[t]?.n ?? 0) === 0).join(', ') || 'ninguna'}`);

// --- 1. Simulacro ------------------------------------------------------------
console.log('\n1. Simulacro (NO)');
let r = ejecutar(RESETEO);
const trasSimulacro = huellas();
paso('el simulacro termina bien y no toca NI UNA fila (huella de cada tabla igual)', r.ok && igualesSalvo(antes, trasSimulacro).length === 0, r.ok ? igualesSalvo(antes, trasSimulacro).join(', ') : r.error);
paso('y no crea ninguna copia', Number(psqlEstricto(`select count(*) from pg_namespace where nspname like 'reseteo\\_%';`)) === 0);
paso('el informe del simulacro cuenta las filas que se borrarian', /SIMULACRO/.test(r.salida) && /point_movements/.test(r.salida), r.salida.split('\n').slice(0, 3).join(' / '));
guardar('reseteo-simulacro.txt', r.salida);

// --- 2. Valor raro en la confirmacion ----------------------------------------
console.log('\n2. Confirmacion invalida');
r = ejecutar(conConfirmar(RESETEO, 'QUIZAS'));
paso("con algo distinto de 'SI' o 'NO' se niega y no toca nada", !r.ok && /tiene que ser/.test(r.error) && igualesSalvo(antes, huellas()).length === 0, r.error.split('\n')[0]);

// --- 3. Lo que sale mal se deshace entero ------------------------------------
console.log('\n3. Si algo sale mal, se deshace todo');
psqlEstricto(`
  create or replace function public.zz_trampa() returns trigger language plpgsql as $f$ begin insert into public.temporadas (nombre) values ('creada por una trampa'); return null; end $f$;
  create trigger zz_trampa after delete on public.stamps for each statement execute function public.zz_trampa();`);
r = ejecutar(conConfirmar(RESETEO, 'SI'));
const tras3 = huellas();
paso('un disparador que cambia otra tabla al borrar: el script se para ("ha cambiado sin que tocase")', !r.ok && /ha cambiado sin que tocase/.test(r.error), r.error.split('\n')[0]);
psqlEstricto(`drop trigger zz_trampa on public.stamps; drop function public.zz_trampa(); delete from public.temporadas where nombre = 'creada por una trampa';`);
paso('y deja TODO como estaba: ninguna tabla cambia, sin copia a medias', igualesSalvo(antes, huellas()).length === 0 && Number(psqlEstricto(`select count(*) from pg_namespace where nspname like 'reseteo\\_%';`)) === 0, igualesSalvo(antes, tras3).join(', '));

// --- 4. El reseteo de verdad -------------------------------------------------
console.log('\n4. Reseteo (SI)');
r = ejecutar(conConfirmar(RESETEO, 'SI'));
paso('termina bien', r.ok, r.error.split('\n').filter((l) => /ERROR|HECHO/.test(l)).join(' / '));
guardar('reseteo-real.txt', r.salida);
const despues = huellas();
const sinBorrar = BORRADAS.filter((t) => despues[t].n !== 0 && !(t === 'push_cola'));
paso(`las ${BORRADAS.length} tablas de datos de prueba quedan a cero`, sinBorrar.length === 0, sinBorrar.map((t) => `${t}=${despues[t].n}`).join(', '));
const pendientes = Number(psqlEstricto(`select count(*) from public.push_cola where enviada_at is null;`));
paso('los avisos pendientes de enviar, fuera', pendientes === 0, `${pendientes} pendientes`);
const cambiadas = igualesSalvo(antes, despues, [...BORRADAS, 'push_cola', 'casas_marcador']);
paso('el resto de tablas, IDENTICAS fila a fila (huella igual)', cambiadas.length === 0, cambiadas.join(', '));
paso('casas_marcador: mismas filas, solo avisadas (cambiado_at)', antes.casas_marcador.n === despues.casas_marcador.n);
const esquema = psqlEstricto(`select nspname from pg_namespace where nspname like 'reseteo\\_%' order by 1 desc limit 1;`);
paso('hay una copia con nombre reseteo_AAAAMMDD_HHMMSS', /^reseteo_\d{8}_\d{6}$/.test(esquema), esquema);
const copia = huellas(esquema);
const malCopia = BORRADAS.filter((t) => copia[t]?.n !== antes[t].n || (t !== 'push_cola' && copia[t].h !== antes[t].h));
paso('la copia tiene TODAS las filas, identicas a lo que habia', malCopia.length === 0, malCopia.join(', '));
paso('la copia no se ve desde la API (esquema no expuesto)', (await rpc(admin, 'is_admin')).data === true && (await admin.c.schema(esquema).from('stamps').select('*').limit(1)).error !== null);
paso('el informe lo cuenta y nombra la copia', new RegExp(esquema).test(r.salida), '');

// --- 5. La app sigue funcionando despues -------------------------------------
console.log('\n5. La app despues del reseteo');
const rank = await rpc(cuentas.ana, 'casas_ranking', { p_route_id: A });
paso('el ranking de casas responde y esta a cero', !rank.error && (rank.data ?? []).every((f) => Number(f.points ?? f.puntos ?? f.total ?? 0) === 0), JSON.stringify(rank.data ?? rank.error).slice(0, 200));
const b0 = mundo.bares.A[0];
const sello = await rpc(cuentas.ana, 'claim_stamp', { p_route_bar_id: b0.id, p_lat: b0.lat, p_lng: b0.lng });
paso('ana puede volver a sellar (sus sellos eran de prueba)', !sello.error, sello.error?.message);
const puntos = psqlEstricto(`select count(*) from public.point_movements;`);
paso('y ese sello vuelve a dar sus puntos (los disparadores siguen vivos)', Number(puntos) > 0, `${puntos} movimientos`);
paso('la casa de cada persona sigue siendo la misma', psqlEstricto(`select count(*) from public.user_houses;`) === String(antes.user_houses.n));
const est = await rpc(cuentas.ana, 'sorteo_estado', { p_route_id: A });
paso('el sorteo vuelve a empezar (sin resultado ni participantes)', !est.error && est.data.resultado === null, JSON.stringify(est.data ?? est.error).slice(0, 150));
const rep = await rpc(cuentas.gema, 'match_report', { p_route_id: A, p_target_id: U.ana.id, p_reason: 'otro', p_detail: 'despues del reseteo', p_connection_id: null, p_block: false });
paso('se puede volver a denunciar, y llega a la bandeja', !rep.error && ((await rpc(admin, 'match_admin_alert_count')).data ?? 0) >= 1, rep.error?.message);
const suspendida = await rpc(cuentas.fede, 'claim_stamp', { p_route_bar_id: b0.id, p_lat: b0.lat, p_lng: b0.lng });
paso('fede (suspendido antes) ya no lo esta: su error ahora es otro (no es miembro), no ACCOUNT_SUSPENDED', suspendida.error && !/SUSPENDED/.test(suspendida.error.message), suspendida.error?.message);
const reentra = await rpc(cuentas.eva, 'redeem_route_invite', { p_token: mundo.otros.tokens.B });
paso('eva (expulsada de B antes) puede volver a entrar: el veto se ha levantado', !reentra.error, reentra.error?.message);

// --- 6. Repetir con todo ya a cero -------------------------------------------
console.log('\n6. Segundo reseteo con la base ya limpia');
// limpiamos lo que acabamos de crear en el punto 5 para volver a "todo a cero"
ejecutar(conConfirmar(RESETEO, 'SI'));
const copiasAntes = Number(psqlEstricto(`select count(*) from pg_namespace where nspname like 'reseteo\\_%';`));
r = ejecutar(conConfirmar(RESETEO, 'SI'));
const copiasDespues = Number(psqlEstricto(`select count(*) from pg_namespace where nspname like 'reseteo\\_%';`));
paso('con todo a cero, no crea otra copia vacia', r.ok && copiasAntes === copiasDespues, `copias: ${copiasAntes} -> ${copiasDespues}`);
const etiquetaVieja = esquema;

// --- 7. Volver atras ---------------------------------------------------------
console.log('\n7. Volver atras con restaurar.sql');
const restaura = (sql, conf) => sql.replace("'reseteo_AAAAMMDD_HHMMSS'", `'${etiquetaVieja}'`).replace(/(v_confirmar constant text := )'(NO|SI)'/, `$1'${conf}'`);
// La copia que usamos es la del reseteo real (punto 4): contiene el mundo original.
const baseVacia = huellas();
r = ejecutar(restaura(RESTAURAR, 'NO'));
paso('simulacro de restaurar: cuenta y no toca nada', r.ok && igualesSalvo(baseVacia, huellas()).length === 0, r.ok ? '' : r.error.split('\n')[0]);
r = ejecutar(restaura(RESTAURAR, 'SI'));
paso('restaurar termina bien', r.ok, r.ok ? '' : r.error.split('\n').filter((l) => /ERROR/.test(l)).join(' / '));
const restaurada = huellas();
const dif = BORRADAS.filter((t) => t !== 'push_cola').filter((t) => restaurada[t].n !== antes[t].n || restaurada[t].h !== antes[t].h);
paso('TODAS las tablas vuelven fila a fila a como estaban antes del reseteo (huella igual)', dif.length === 0, dif.map((t) => `${t}: ${antes[t].n} -> ${restaurada[t].n}`).join(', '));
paso('restaurar no duplica los puntos (los disparadores no se disparan)', restaurada.point_movements.n === antes.point_movements.n, `${restaurada.point_movements.n} vs ${antes.point_movements.n}`);
r = ejecutar(restaura(RESTAURAR, 'SI'));
paso('restaurar dos veces se niega (mezclaria lo viejo con lo viejo)', !r.ok && /ya tiene/.test(r.error), r.error.split('\n')[0]);
r = ejecutar(RESTAURAR);
paso("restaurar sin poner el nombre de la copia se niega con un mensaje claro", !r.ok && /No existe el esquema/.test(r.error), r.error.split('\n')[0]);

// --- limpiar la copia como diria el informe ----------------------------------
psqlEstricto(`drop schema ${etiquetaVieja} cascade;`);
paso('y la copia se borra con el drop schema que dice el script', Number(psqlEstricto(`select count(*) from pg_namespace where nspname = '${etiquetaVieja}';`)) === 0);

guardar('reseteo-pruebas.json', resultados);
const mal = resultados.filter((x) => !x.ok);
console.log(`\nReseteo: ${resultados.length - mal.length}/${resultados.length} comprobaciones bien. Resultado en ${SALIDA}`);
for (const x of mal) console.log(`  MAL ${x.nombre}\n      ${x.detalle}`);
void flujos;
process.exitCode = mal.length ? 1 : 0;
