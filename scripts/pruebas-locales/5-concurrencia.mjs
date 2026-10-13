// Acciones A LA VEZ contra el Postgres real (PGlite, el de los tests, tiene una sola
// conexion y no puede probar esto: el CLAUDE.md lo dice del FOR UPDATE de las
// invitaciones). Cada escenario lanza una rafaga de peticiones en paralelo por la API
// y despues comprueba en la base que los datos quedaron bien.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { clasificarError, entrar, guardar, psqlEstricto, registrar, SALIDA } from './comun.mjs';

const mundo = JSON.parse(readFileSync(join(SALIDA, 'mundo.json'), 'utf8'));
const resultados = [];
const sufijo = Date.now().toString(36);
const hora = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const hoy = new Date().toISOString().slice(0, 10);

async function escenario(nombre, fn) {
  try {
    const r = await fn();
    resultados.push({ nombre, ok: r.ok, detalle: r.detalle });
  } catch (e) {
    resultados.push({ nombre, ok: false, detalle: `la prueba fallo: ${e.message}` });
  }
}
/** Lanza todas a la vez y cuenta respuestas por tipo. */
async function rafaga(promesas) {
  const rs = await Promise.all(promesas);
  const cuenta = {};
  for (const r of rs) {
    const k = r.error ? `${clasificarError(r.error.code, r.error.message)}:${r.error.message}` : 'ok';
    cuenta[k] = (cuenta[k] ?? 0) + 1;
  }
  return { rs, cuenta };
}
const sinFallosInternos = (cuenta) => !Object.keys(cuenta).some((k) => k.startsWith('bug') || k.startsWith('sin-validar') || k.startsWith('restriccion'));
const n = (sql) => Number(psqlEstricto(sql));

// --- Preparacion: ruta E abierta ahora, con sorteo, y gente nueva ---
const admin = await entrar(mundo.usuarios.admin.email);
const admin2 = await entrar(mundo.usuarios.admin2.email);
const catalogo = (await admin.c.from('catalog_bars').select('*').order('name')).data;
const ruta = (await admin.c.from('routes').insert({ name: `Concurrencia ${sufijo}`, event_date: hoy, created_by: admin.id }).select().single()).data;
const bares = [];
for (let i = 0; i < 3; i++) {
  const b = catalogo[i];
  const { data, error } = await admin.c.from('route_bars').insert({ route_id: ruta.id, sort_order: i, name: b.name, lat: b.lat, lng: b.lng, radius_m: 120, opens_at: hora(-1), closes_at: hora(5), logo: b.logo }).select().single();
  if (error) throw new Error(error.message);
  bares.push(data);
}
await admin.c.from('routes').update({ is_published: true, sorteo_activo: true, sorteo_premio: 'Pin' }).eq('id', ruta.id);
const invitar = async (plazas) => {
  const { data, error } = await admin.c.rpc('create_route_invite', { p_route_id: ruta.id, p_max_uses: plazas, p_expires_in_hours: 2 });
  if (error) throw new Error(`invitar: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data).invite_token; // TABLE(invite_id, invite_token, invite_expires_at)
};
const gente = [];
for (let i = 0; i < 16; i++) gente.push(await registrar(`conc${i}-${sufijo}@local.test`));
const sellarTodo = async (u) => {
  for (const b of bares) await u.c.rpc('claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng });
};

// C1. Quince personas canjean a la vez una invitacion de 3 plazas.
await escenario('C1 15 canjes a la vez de una invitacion de 3 plazas: entran exactamente 3', async () => {
  const token = await invitar(3);
  const { cuenta } = await rafaga(gente.slice(0, 15).map((u) => u.c.rpc('redeem_route_invite', { p_token: token })));
  const dentro = n(`select count(*) from public.route_members m join public.route_invites i on i.id = m.invite_id where i.token = '${token}';`);
  const usos = n(`select count(*) from public.route_members m join public.route_invites i on i.id = m.invite_id where i.token = '${token}';`);
  return { ok: dentro === 3 && (cuenta.ok ?? 0) === 3 && sinFallosInternos(cuenta), detalle: `miembros por esa invitacion: ${dentro} (usos ${usos}); respuestas: ${JSON.stringify(cuenta)}` };
});
// Resto de la gente, dentro por otra invitacion
const tokenGrande = await invitar(50);
for (const u of gente) await u.c.rpc('redeem_route_invite', { p_token: tokenGrande });

// C2. Doble (decuple) toque en "sellar".
await escenario('C2 10 toques a la vez en "sellar" el mismo bar: un solo sello y ningun error', async () => {
  const u = gente[0];
  const b = bares[0];
  const { cuenta } = await rafaga(Array.from({ length: 10 }, () => u.c.rpc('claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng })));
  const sellos = n(`select count(*) from public.stamps where user_id = '${u.id}' and route_bar_id = '${b.id}';`);
  return { ok: sellos === 1 && (cuenta.ok ?? 0) === 10, detalle: `sellos: ${sellos}; respuestas: ${JSON.stringify(cuenta)}` };
});

// C3. Doble toque en "registrar consumicion".
await escenario('C3 10 toques a la vez en "consumicion": puntua una sola vez', async () => {
  const u = gente[1];
  await sellarTodo(u);
  const ultimo = bares[2];
  const antes = n(`select count(*) from public.consumiciones where user_id = '${u.id}';`);
  const { cuenta } = await rafaga(Array.from({ length: 10 }, () => u.c.rpc('registrar_consumicion', { p_route_bar_id: ultimo.id, p_categoria: 'tercio' })));
  const despues = n(`select count(*) from public.consumiciones where user_id = '${u.id}';`);
  return { ok: despues - antes === 1 && sinFallosInternos(cuenta), detalle: `consumiciones nuevas: ${despues - antes}; respuestas: ${JSON.stringify(cuenta)}` };
});

// C4. Me gusta cruzado en el mismo instante.
await escenario('C4 Me gusta cruzado a la vez (5 parejas): una conexion por pareja', async () => {
  const activar = (u) =>
    u.c.rpc('match_activate_en_ruta', { p_route_id: ruta.id, p_lat: bares[0].lat, p_lng: bares[0].lng, p_adult_confirmed: true, p_bio: 'hola', p_tag_ids: [], p_consent_version: '2026-09-18' });
  const parejas = [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];
  for (const [a, b] of parejas) {
    const r1 = await activar(gente[a]);
    const r2 = await activar(gente[b]);
    if (r1.error || r2.error) throw new Error(`activar: ${(r1.error ?? r2.error).message}`);
  }
  const { cuenta } = await rafaga(
    parejas.flatMap(([a, b]) => [
      gente[a].c.rpc('match_set_like', { p_route_id: ruta.id, p_target_id: gente[b].id, p_liked: true }),
      gente[b].c.rpc('match_set_like', { p_route_id: ruta.id, p_target_id: gente[a].id, p_liked: true }),
    ]),
  );
  const conexiones = parejas.map(([a, b]) =>
    n(`select count(*) from public.match_connection_members m1 join public.match_connection_members m2 on m1.connection_id = m2.connection_id
       where m1.user_id = '${gente[a].id}' and m2.user_id = '${gente[b].id}';`),
  );
  return { ok: conexiones.every((c) => c === 1) && sinFallosInternos(cuenta), detalle: `conexiones por pareja: ${conexiones.join(', ')}; respuestas: ${JSON.stringify(cuenta)}` };
});

// C5. Dos personas de la misma casa se escanean el QR la una a la otra a la vez.
await escenario('C5 QR cruzado a la vez entre dos de la misma casa: el encuentro cuenta una vez', async () => {
  const casas = Object.fromEntries(
    psqlEstricto(`select user_id || '=' || house from public.user_houses where user_id in (${gente.map((g) => `'${g.id}'`).join(',')});`)
      .split('\n').map((l) => l.split('=')),
  );
  let par = null;
  for (const a of gente) for (const b of gente) if (!par && a !== b && casas[a.id] === casas[b.id]) par = [a, b];
  if (!par) return { ok: true, detalle: 'nadie comparte casa: no aplica' };
  const codigo = async (u) => {
    const { data } = await u.c.rpc('qr_mi_codigo');
    return typeof data === 'string' ? data : data.codigo ?? data.code;
  };
  const [ca, cb] = [await codigo(par[0]), await codigo(par[1])];
  const { cuenta } = await rafaga([
    par[0].c.rpc('qr_escanear', { p_route_id: ruta.id, p_codigo: cb }),
    par[1].c.rpc('qr_escanear', { p_route_id: ruta.id, p_codigo: ca }),
    par[0].c.rpc('qr_escanear', { p_route_id: ruta.id, p_codigo: cb }),
    par[1].c.rpc('qr_escanear', { p_route_id: ruta.id, p_codigo: ca }),
  ]);
  const encuentros = n(
    `select count(*) from public.encuentros where route_id = '${ruta.id}' and puntua
       and usuarios @> array['${par[0].id}', '${par[1].id}']::uuid[];`,
  );
  return { ok: encuentros === 1 && sinFallosInternos(cuenta), detalle: `encuentros que puntuan: ${encuentros}; respuestas: ${JSON.stringify(cuenta)}` };
});

// C6. Dos admins pulsan "sortear" a la vez.
await escenario('C6 Dos admins sortean a la vez: un solo sorteo', async () => {
  for (const u of gente.slice(12, 15)) await sellarTodo(u);
  const { cuenta } = await rafaga([
    admin.c.rpc('sorteo_realizar', { p_route_id: ruta.id }),
    admin2.c.rpc('sorteo_realizar', { p_route_id: ruta.id }),
    admin.c.rpc('sorteo_realizar', { p_route_id: ruta.id }),
  ]);
  const sorteos = n(`select count(*) from public.sorteos where route_id = '${ruta.id}';`);
  return { ok: sorteos === 1 && (cuenta.ok ?? 0) === 1, detalle: `sorteos guardados: ${sorteos}; respuestas: ${JSON.stringify(cuenta)}` };
});

// C7. Rafaga de puntuaciones de un minijuego.
await escenario('C7 10 notas del mismo juego a la vez: una fila, la mejor nota, sin errores internos', async () => {
  const u = gente[15];
  const { cuenta } = await rafaga(Array.from({ length: 10 }, (_, i) => u.c.rpc('minigame_submit_score', { p_route_id: ruta.id, p_game: 'cana-perfecta', p_score: 10 + i, p_ms: 30000 })));
  const filas = n(`select count(*) from public.minigame_scores where user_id = '${u.id}' and route_id = '${ruta.id}';`);
  const mejor = n(`select coalesce(max(best_score), 0) from public.minigame_scores where user_id = '${u.id}' and route_id = '${ruta.id}';`);
  return { ok: filas === 1 && mejor === 19 && sinFallosInternos(cuenta), detalle: `filas: ${filas}, mejor guardada: ${mejor} (la mejor enviada: 19); respuestas: ${JSON.stringify(cuenta)}` };
});

// C7b. Lo mismo en Conduces (otra tabla, mismo patron "si no existe, inserta").
await escenario('C7b 10 distancias de Conduces a la vez: una fila con la mejor, sin errores internos', async () => {
  const u = gente[14];
  const { cuenta } = await rafaga(Array.from({ length: 10 }, (_, i) => u.c.rpc('conduces_submit_score', { p_route_id: ruta.id, p_level: 1, p_distance: 100 + i * 10 })));
  const fila = psqlEstricto(`select count(*) || ',' || coalesce(max(best_distance), 0) from public.conduces_scores where user_id = '${u.id}' and route_id = '${ruta.id}';`);
  const [filas, mejor] = fila.split(',').map(Number);
  return { ok: filas === 1 && mejor === 190 && sinFallosInternos(cuenta), detalle: `filas: ${filas}, mejor guardada: ${mejor} (la mejor enviada: 190); respuestas: ${JSON.stringify(cuenta)}` };
});

// C8. Dos admins cambian la misma regla de puntos a la vez (el fallo de la 0048 era aqui).
await escenario('C8 Dos admins cambian la misma regla de puntos a la vez', async () => {
  const { cuenta } = await rafaga([
    admin.c.rpc('casas_admin_regla', { p_action: 'sello', p_points: 11 }),
    admin2.c.rpc('casas_admin_regla', { p_action: 'sello', p_points: 12 }),
  ]);
  const valor = n(`select points from public.point_rules where action = 'sello';`);
  await admin.c.rpc('casas_admin_regla', { p_action: 'sello', p_points: 10 });
  return { ok: (cuenta.ok ?? 0) === 2 && [11, 12].includes(valor), detalle: `queda ${valor} (gana la ultima); respuestas: ${JSON.stringify(cuenta)}` };
});

// C9. Expulsar a alguien mientras canjea la invitacion otra vez.
await escenario('C9 Expulsion y re-canje a la vez: el veto gana', async () => {
  const u = gente[13];
  const { cuenta } = await rafaga([
    admin.c.rpc('match_admin_remove_from_route', { p_user_id: u.id, p_route_id: ruta.id, p_reason: 'Prueba de concurrencia' }),
    u.c.rpc('redeem_route_invite', { p_token: tokenGrande }),
    u.c.rpc('redeem_route_invite', { p_token: tokenGrande }),
  ]);
  const dentro = n(`select count(*) from public.route_members where user_id = '${u.id}' and route_id = '${ruta.id}';`);
  return { ok: dentro === 0 && sinFallosInternos(cuenta), detalle: `sigue dentro: ${dentro}; respuestas: ${JSON.stringify(cuenta)}` };
});

// Limpiar: la ruta E se borra (y con ella todo lo suyo).
await admin.c.from('routes').delete().eq('id', ruta.id);

guardar('concurrencia.json', resultados);
const mal = resultados.filter((r) => !r.ok);
console.log(`Concurrencia: ${resultados.length - mal.length}/${resultados.length} escenarios bien`);
for (const r of resultados) console.log(`  ${r.ok ? 'ok ' : 'MAL'} ${r.nombre}\n      ${r.detalle}`);
