// Flujos completos por la API real (PostgREST + GoTrue + Storage del Supabase local),
// como los haria la gente con la app: cada cuenta entra con su correo y su contrasena.
// Construye a la vez el "mundo" sintetico que usan el barrido y la matriz de permisos
// (mundo.json). Cada paso se apunta (bien / mal / por que) y nada se para al primer fallo.
import { clasificarError, entrar, guardar, psqlEstricto, registrar, SALIDA } from './comun.mjs';

const resultados = [];
const mundo = { usuarios: {}, rutas: {}, bares: {}, otros: {} };

async function paso(flujo, nombre, fn) {
  const t0 = Date.now();
  try {
    const detalle = await fn();
    resultados.push({ flujo, nombre, ok: true, detalle: detalle ?? '', ms: Date.now() - t0 });
  } catch (e) {
    resultados.push({ flujo, nombre, ok: false, detalle: e.message, ms: Date.now() - t0 });
  }
}

/** Tiene que ir bien. */
function ok({ data, error }, que) {
  if (error) throw new Error(`${que}: ${error.code ?? ''} ${error.message}`);
  return data;
}
/** Tiene que fallar, y con un error de negocio (no un fallo interno del servidor). */
function falla({ data, error }, patron, que) {
  if (!error) throw new Error(`${que}: tenia que fallar${patron ? ` (${patron})` : ''} y fue bien: ${JSON.stringify(data)?.slice(0, 160)}`);
  const clase = clasificarError(error.code, error.message);
  if (clase === 'bug') throw new Error(`${que}: fallo INTERNO ${error.code} ${error.message}`);
  if (patron && !new RegExp(patron, 'i').test(`${error.code} ${error.message}`)) {
    throw new Error(`${que}: fallo, pero con otro motivo: ${error.code} ${error.message}`);
  }
  return `${error.code} ${error.message}`;
}
function igual(a, b, que) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${que}: esperaba ${JSON.stringify(b)} y es ${JSON.stringify(a)}`);
}
function cierto(v, que) {
  if (!v) throw new Error(que);
}
const rpc = (u, fn, args = {}) => u.c.rpc(fn, args);
const codigoDe = (d) => (typeof d === 'string' ? d : d?.codigo ?? d?.code ?? Object.values(d ?? {}).find((v) => typeof v === 'string'));
const hora = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const hoy = new Date().toISOString().slice(0, 10);
const ayer = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const U = mundo.usuarios;

// ---------------------------------------------------------------------------
// F1. Alta abierta y nombre visible unico
// ---------------------------------------------------------------------------
const correos = ['admin', 'admin2', 'ana', 'bea', 'carla', 'dani', 'eva', 'fede', 'susi', 'gema'];
for (const n of correos) {
  await paso('F1 Alta', `registro de ${n}@local.test`, async () => {
    U[n] = await registrar(`${n}@local.test`);
    return U[n].id;
  });
}
await paso('F1 Alta', 'nombre visible por defecto = parte del correo', async () => {
  const p = ok(await U.ana.c.from('profiles').select('display_name, role').eq('id', U.ana.id).single(), 'leer perfil');
  igual(p, { display_name: 'ana', role: 'user' }, 'perfil de ana');
});
await paso('F1 Alta', 'el mismo nombre con otro correo no tumba el alta (ana -> ana-2)', async () => {
  U.ana2 = await registrar('ana@otro.test');
  const p = ok(await U.ana2.c.from('profiles').select('display_name').eq('id', U.ana2.id).single(), 'perfil');
  igual(p.display_name, 'ana-2', 'nombre de la segunda ana');
});
await paso('F1 Alta', 'cambiar el nombre a uno cogido (sin mirar mayusculas) falla', async () =>
  falla(await U.bea.c.from('profiles').update({ display_name: 'ANA' }).eq('id', U.bea.id).select(), 'duplicate|unique|23505', 'renombrar'),
);
await paso('F1 Alta', 'un nombre con espacios no vale', async () =>
  falla(await U.bea.c.from('profiles').update({ display_name: 'bea luna' }).eq('id', U.bea.id).select(), 'check|23514', 'renombrar'),
);

// ---------------------------------------------------------------------------
// F2. Admins: solo a mano en la base, nunca desde la app
// ---------------------------------------------------------------------------
await paso('F2 Admins', 'nadie se hace admin desde la API', async () => {
  const r = await U.fede.c.from('profiles').update({ role: 'admin' }).eq('id', U.fede.id).select();
  if (!r.error) {
    const p = ok(await U.fede.c.from('profiles').select('role').eq('id', U.fede.id).single(), 'releer');
    cierto(p.role !== 'admin', 'fede consiguio ser admin');
    return 'el UPDATE no da error pero el rol no cambia';
  }
  return falla(r, null, 'subir a admin');
});
await paso('F2 Admins', 'crear admins por SQL (como el SQL Editor)', async () => {
  psqlEstricto(`update public.profiles set role = 'admin' where id in ('${U.admin.id}', '${U.admin2.id}');`);
  igual(ok(await rpc(U.admin, 'is_admin'), 'is_admin'), true, 'admin es admin');
  igual(ok(await rpc(U.ana, 'is_admin'), 'is_admin'), false, 'ana no es admin');
});

// ---------------------------------------------------------------------------
// F3. Rutas y paradas desde el catalogo (como el editor)
// ---------------------------------------------------------------------------
let catalogo = [];
await paso('F3 Rutas', 'un participante no ve el catalogo de bares', async () => {
  const r = await U.ana.c.from('catalog_bars').select('id');
  if (r.error) return falla(r, null, 'catalogo');
  igual(r.data.length, 0, 'filas de catalogo que ve ana');
});
await paso('F3 Rutas', 'el admin ve los 14 bares del catalogo', async () => {
  catalogo = ok(await U.admin.c.from('catalog_bars').select('*').order('name'), 'catalogo');
  igual(catalogo.length, 14, 'bares en catalogo');
});
async function crearRuta(clave, nombre, fecha, nBares, { abre = -2, cierra = 6 } = {}) {
  const ruta = ok(
    await U.admin.c.from('routes').insert({ name: nombre, description: 'Prueba', event_date: fecha, created_by: U.admin.id }).select('*').single(),
    `crear ${nombre}`,
  );
  mundo.rutas[clave] = ruta.id;
  mundo.bares[clave] = [];
  for (let i = 0; i < nBares; i++) {
    const b = catalogo[i];
    const bar = ok(
      await U.admin.c
        .from('route_bars')
        .insert({
          route_id: ruta.id, sort_order: i, name: b.name, address: '', lat: b.lat, lng: b.lng, radius_m: 120,
          opens_at: hora(abre), closes_at: hora(cierra), notes: '', logo: b.logo ?? null, tipo: 'bar', margen_min: 0,
        })
        .select('*')
        .single(),
      `parada ${i} de ${nombre}`,
    );
    mundo.bares[clave].push({ id: bar.id, lat: bar.lat, lng: bar.lng, name: bar.name });
  }
  return ruta;
}
await paso('F3 Rutas', 'un participante no puede crear rutas', async () =>
  falla(await U.ana.c.from('routes').insert({ name: 'Mia', event_date: hoy, created_by: U.ana.id }).select(), null, 'crear ruta'),
);
await paso('F3 Rutas', 'ruta A (hoy, 8 bares abiertos ahora)', async () => (await crearRuta('A', 'Ruta de Bares 26', hoy, 8)).id);
await paso('F3 Rutas', 'ruta B (hoy, 3 bares)', async () => (await crearRuta('B', 'Ruta B', hoy, 3)).id);
await paso('F3 Rutas', 'ruta C (borrador, sin publicar)', async () => (await crearRuta('C', 'Ruta borrador', hoy, 2)).id);
await paso('F3 Rutas', 'ruta D (de ayer, ya cerrada)', async () => (await crearRuta('D', 'Ruta de ayer', ayer, 2, { abre: -30, cierra: -22 })).id);
await paso('F3 Rutas', 'una parada fuera del catalogo con logo invalido se rechaza', async () =>
  falla(
    await U.admin.c.from('route_bars').insert({
      route_id: mundo.rutas.A, sort_order: 99, name: 'X', lat: 40, lng: -3, opens_at: hora(0), closes_at: hora(1), logo: 'no-es-una-data-url',
    }).select(),
    'check|23514|logo',
    'logo invalido',
  ),
);
await paso('F3 Rutas', 'cierre antes que apertura se rechaza', async () =>
  falla(
    await U.admin.c.from('route_bars').insert({ route_id: mundo.rutas.A, sort_order: 98, name: 'X', lat: 40, lng: -3, opens_at: hora(2), closes_at: hora(1) }).select(),
    'check|23514',
    'ventana al reves',
  ),
);
await paso('F3 Rutas', 'reordenar paradas como el editor (todas a +1000 y luego a su sitio)', async () => {
  // Mismo patron que reorderBars en routes/api.ts: cada UPDATE va en su propia
  // peticion, asi que el "deferrable" no ayuda entre peticiones; el OFFSET si.
  const [b0, b1] = mundo.bares.A;
  const mover = async (b, n) => ok(await U.admin.c.from('route_bars').update({ sort_order: n }).eq('id', b.id), `mover a ${n}`);
  await mover(b0, 1000); await mover(b1, 1001);
  await mover(b1, 0); await mover(b0, 1); // intercambiadas
  const orden = ok(await U.admin.c.from('route_bars').select('id, sort_order').in('id', [b0.id, b1.id]), 'leer');
  igual(orden.find((x) => x.id === b1.id).sort_order, 0, 'b1 primera');
  await mover(b0, 1000); await mover(b1, 1001);
  await mover(b0, 0); await mover(b1, 1); // como estaban
});
await paso('F3 Rutas', 'mover una parada a una posicion ocupada falla limpio (23505), sin romper nada', async () => {
  const [b0, b1] = mundo.bares.A;
  return falla(await U.admin.c.from('route_bars').update({ sort_order: 0 }).eq('id', b1.id), '23505', 'posicion ocupada');
});
await paso('F3 Rutas', 'publicar A, B y D (C se queda en borrador)', async () => {
  for (const k of ['A', 'B', 'D']) {
    ok(await U.admin.c.from('routes').update({ is_published: true, updated_at: new Date().toISOString() }).eq('id', mundo.rutas[k]).select('*').single(), `publicar ${k}`);
  }
});
await paso('F3 Rutas', 'activar el sorteo de A (premio camiseta)', async () => {
  ok(await U.admin.c.from('routes').update({ sorteo_activo: true, sorteo_premio: 'Una camiseta' }).eq('id', mundo.rutas.A).select().single(), 'sorteo');
});

// ---------------------------------------------------------------------------
// F4. Invitaciones por ruta
// ---------------------------------------------------------------------------
const tokens = {};
const tokenDe = (d) => {
  const fila = Array.isArray(d) ? d[0] : d;
  return fila?.token ?? fila?.invite_token ?? Object.values(fila ?? {}).find((v) => typeof v === 'string' && v.length > 30);
};
await paso('F4 Invitaciones', 'un participante no puede crear invitaciones', async () =>
  falla(await rpc(U.ana, 'create_route_invite', { p_route_id: mundo.rutas.A, p_max_uses: 5, p_expires_in_hours: 2 }), null, 'invitar'),
);
await paso('F4 Invitaciones', 'el admin crea invitaciones (A de 3 plazas, A de 20, B, D)', async () => {
  const crear = async (ruta, plazas) => {
    const d = ok(await rpc(U.admin, 'create_route_invite', { p_route_id: ruta, p_max_uses: plazas, p_expires_in_hours: 2 }), 'invitacion');
    const fila = Array.isArray(d) ? d[0] : d;
    return fila.token ?? fila.invite_token ?? Object.values(fila).find((v) => typeof v === 'string' && v.length > 30);
  };
  tokens.A3 = await crear(mundo.rutas.A, 3);
  tokens.A = await crear(mundo.rutas.A, 20);
  tokens.B = await crear(mundo.rutas.B, 5);
  tokens.D = await crear(mundo.rutas.D, 5);
  cierto(tokens.A3 && tokens.A && tokens.B && tokens.D, `no salio el token: ${JSON.stringify(tokens)}`);
  mundo.otros.tokens = tokens;
});
await paso('F4 Invitaciones', 'una invitacion de 3 plazas: entran 3 y la cuarta persona no', async () => {
  for (const n of ['ana', 'bea', 'carla']) ok(await rpc(U[n], 'redeem_route_invite', { p_token: tokens.A3 }), `canje de ${n}`);
  return falla(await rpc(U.dani, 'redeem_route_invite', { p_token: tokens.A3 }), null, 'cuarto canje');
});
await paso('F4 Invitaciones', 'canjear dos veces no gasta dos plazas (idempotente)', async () => {
  ok(await rpc(U.ana, 'redeem_route_invite', { p_token: tokens.A3 }), 'segundo canje de ana');
});
await paso('F4 Invitaciones', 'token inventado y sin sesion fallan', async () => {
  falla(await rpc(U.dani, 'redeem_route_invite', { p_token: 'x'.repeat(43) }), null, 'token falso');
  const { cliente } = await import('./comun.mjs');
  return falla(await cliente().rpc('redeem_route_invite', { p_token: tokens.A }), null, 'sin sesion');
});
await paso('F4 Invitaciones', 'resto de altas: dani, susi, gema a A; eva a B; ana y fede a D', async () => {
  for (const n of ['dani', 'susi', 'gema', 'admin', 'admin2']) ok(await rpc(U[n], 'redeem_route_invite', { p_token: tokens.A }), `${n} en A`);
  ok(await rpc(U.eva, 'redeem_route_invite', { p_token: tokens.B }), 'eva en B');
  ok(await rpc(U.ana, 'redeem_route_invite', { p_token: tokens.D }), 'ana en D');
});
await paso('F4 Invitaciones', 'revocar una invitacion la deja inservible', async () => {
  const tok = tokenDe(ok(await rpc(U.admin, 'create_route_invite', { p_route_id: mundo.rutas.B, p_max_uses: 5, p_expires_in_hours: 2 }), 'nueva'));
  const revocadas = ok(await U.admin.c.from('route_invites').update({ revoked_at: new Date().toISOString() }).eq('token', tok).select('id'), 'revocar');
  igual(revocadas.length, 1, 'invitaciones revocadas');
  return falla(await rpc(U.fede, 'redeem_route_invite', { p_token: tok }), null, 'canjear revocada');
});
await paso('F4 Invitaciones', 'invitar a un borrador: entrar se puede, sellar no', async () => {
  const tok = tokenDe(ok(await rpc(U.admin, 'create_route_invite', { p_route_id: mundo.rutas.C, p_max_uses: 2, p_expires_in_hours: 2 }), 'invitacion a C'));
  const r = await rpc(U.fede, 'redeem_route_invite', { p_token: tok });
  if (r.error) return `canjear un borrador se rechaza: ${r.error.message}`;
  const b = mundo.bares.C[0];
  falla(await rpc(U.fede, 'claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng }), 'ROUTE_NOT_PUBLISHED', 'sellar borrador');
  igual(ok(await U.fede.c.from('routes').select('id').eq('id', mundo.rutas.C), 'ver C').length, 0, 'fede ve el borrador');
  // fede sale de C para seguir siendo "la persona sin ruta" del resto de pruebas
  psqlEstricto(`delete from public.route_members where user_id = '${U.fede.id}';`);
  return 'canje aceptado, sellar ROUTE_NOT_PUBLISHED, el borrador no se ve';
});
await paso('F4 Invitaciones', 'un participante no ve los tokens de las invitaciones', async () => {
  const r = await U.ana.c.from('route_invites').select('token');
  if (r.error) return falla(r, null, 'leer invitaciones');
  igual(r.data.length, 0, 'tokens visibles para ana');
});

// ---------------------------------------------------------------------------
// F5. Quien ve que
// ---------------------------------------------------------------------------
await paso('F5 Visibilidad', 'fede (sin ruta) no ve ninguna ruta ni parada', async () => {
  igual(ok(await U.fede.c.from('routes').select('id'), 'rutas').length, 0, 'rutas de fede');
  igual(ok(await U.fede.c.from('route_bars').select('id'), 'paradas').length, 0, 'paradas de fede');
});
await paso('F5 Visibilidad', 'ana ve A y D, no B ni el borrador C', async () => {
  const ids = ok(await U.ana.c.from('routes').select('id'), 'rutas').map((r) => r.id).sort();
  igual(ids, [mundo.rutas.A, mundo.rutas.D].sort(), 'rutas de ana');
});
await paso('F5 Visibilidad', 'sin sesion no se ve nada', async () => {
  const { cliente } = await import('./comun.mjs');
  const c = cliente();
  const r = await c.from('routes').select('id');
  if (r.error) return falla(r, null, 'anon');
  igual(r.data.length, 0, 'rutas sin sesion');
  const p = await c.from('profiles').select('id');
  if (!p.error) igual(p.data.length, 0, 'perfiles sin sesion');
});

// ---------------------------------------------------------------------------
// F6. Sellar: miembro + publicada + horario + radio
// ---------------------------------------------------------------------------
const bA = () => mundo.bares.A;
await paso('F6 Sellar', 'ana sella el bar 1 estando en la puerta', async () => {
  const s = ok(await rpc(U.ana, 'claim_stamp', { p_route_bar_id: bA()[0].id, p_lat: bA()[0].lat, p_lng: bA()[0].lng }), 'sellar');
  cierto(s && (s.id || s[0]?.id), 'no devolvio el sello');
});
await paso('F6 Sellar', 'sellar el mismo bar otra vez no duplica', async () => {
  const r = await rpc(U.ana, 'claim_stamp', { p_route_bar_id: bA()[0].id, p_lat: bA()[0].lat, p_lng: bA()[0].lng });
  const n = ok(await U.ana.c.from('stamps').select('id').eq('route_bar_id', bA()[0].id), 'contar').length;
  igual(n, 1, 'sellos de ana en el bar 1');
  return r.error ? `responde ${r.error.message}` : 'devuelve el sello existente';
});
await paso('F6 Sellar', 'a 1 km del bar no deja', async () =>
  falla(await rpc(U.ana, 'claim_stamp', { p_route_bar_id: bA()[1].id, p_lat: bA()[1].lat + 0.009, p_lng: bA()[1].lng }), null, 'lejos'),
);
await paso('F6 Sellar', 'coordenadas imposibles (lat 200) no revientan', async () =>
  falla(await rpc(U.ana, 'claim_stamp', { p_route_bar_id: bA()[1].id, p_lat: 200, p_lng: 0 }), null, 'lat 200'),
);
await paso('F6 Sellar', 'fede (no es de la ruta) no puede sellar', async () =>
  falla(await rpc(U.fede, 'claim_stamp', { p_route_bar_id: bA()[1].id, p_lat: bA()[1].lat, p_lng: bA()[1].lng }), null, 'fede'),
);
await paso('F6 Sellar', 'en la ruta de ayer (cerrada) no deja', async () => {
  const b = mundo.bares.D[0];
  return falla(await rpc(U.ana, 'claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng }), null, 'cerrada');
});
await paso('F6 Sellar', 'un participante no sella un bar del borrador', async () => {
  const b = mundo.bares.C[0];
  return falla(await rpc(U.ana, 'claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng }), null, 'borrador');
});
await paso('F6 Sellar', 'un admin SI sella en un borrador sin ser miembro (a proposito: claim_stamp lo exime)', async () => {
  const b = mundo.bares.C[1];
  ok(await rpc(U.admin, 'claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng }), 'admin en borrador');
});
await paso('F6 Sellar', 'nadie escribe un sello a mano saltandose claim_stamp', async () =>
  falla(await U.ana.c.from('stamps').insert({ user_id: U.ana.id, route_bar_id: bA()[2].id, lat: 0, lng: 0, distance_m: 0 }).select(), null, 'insert directo'),
);
await paso('F6 Sellar', 'bea, carla, dani, gema y susi sellan varios bares (para medallas y sorteo)', async () => {
  const cuantos = { bea: 8, carla: 6, dani: 3, gema: 8, susi: 2 };
  for (const [n, k] of Object.entries(cuantos)) {
    for (const b of bA().slice(0, k)) ok(await rpc(U[n], 'claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng }), `${n} sella ${b.name}`);
  }
  for (const b of bA().slice(1, 8)) ok(await rpc(U.ana, 'claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng }), `ana sella ${b.name}`);
});
await paso('F6 Sellar', 'cada cual ve solo sus sellos', async () => {
  const s = ok(await U.dani.c.from('stamps').select('user_id'), 'sellos de dani');
  cierto(s.every((x) => x.user_id === U.dani.id), 'dani ve sellos de otros');
});

// ---------------------------------------------------------------------------
// F7. Casas, consumiciones, QR y retos
// ---------------------------------------------------------------------------
await paso('F7 Casas', 'todos los de la ruta tienen casa, y se reparten', async () => {
  const filas = ok(await U.admin.c.from('user_houses').select('user_id, house'), 'casas');
  const deA = ['ana', 'bea', 'carla', 'dani', 'susi', 'gema'].map((n) => U[n].id);
  cierto(deA.every((id) => filas.some((f) => f.user_id === id)), 'alguien de A sin casa');
  const casas = new Set(filas.filter((f) => deA.includes(f.user_id)).map((f) => f.house));
  cierto(casas.size >= 3, `6 personas en solo ${casas.size} casas`);
  mundo.otros.casaDe = Object.fromEntries(filas.map((f) => [f.user_id, f.house]));
  return [...casas].join(', ');
});
await paso('F7 Casas', 'nadie se cambia de casa desde la app', async () => {
  const r = await U.ana.c.from('user_houses').update({ house: 'alhambra' }).eq('user_id', U.ana.id).select();
  if (r.error) return falla(r, null, 'cambiar casa');
  igual(r.data.length, 0, 'filas cambiadas por ana');
});
await paso('F7 Casas', 'ranking, puntos, estadisticas, historico y palmares responden', async () => {
  ok(await rpc(U.ana, 'casas_ranking', { p_route_id: mundo.rutas.A }), 'ranking');
  ok(await rpc(U.ana, 'casas_puntos'), 'puntos');
  ok(await rpc(U.ana, 'casas_estadisticas', { p_route_id: mundo.rutas.A }), 'estadisticas');
  ok(await rpc(U.ana, 'casas_historico', {}), 'historico');
  ok(await rpc(U.ana, 'casas_palmares', {}), 'palmares');
  ok(await rpc(U.ana, 'casa_marcar_vista'), 'marcar vista');
});
await paso('F7 Casas', 'consumicion en un bar que no es el ultimo sellado: NOT_LAST_BAR', async () =>
  falla(await rpc(U.ana, 'registrar_consumicion', { p_route_bar_id: bA()[0].id, p_categoria: 'tercio' }), 'NOT_LAST_BAR', 'bar viejo'),
);
await paso('F7 Casas', 'consumicion en el ultimo bar sellado, y repetirla enseguida', async () => {
  const ultimo = bA()[7].id; // ana sello el 0 y luego del 1 al 7: el ultimo es el 7
  const d = ok(await rpc(U.ana, 'registrar_consumicion', { p_route_bar_id: ultimo, p_categoria: 'tercio' }), 'primera');
  const r2 = await rpc(U.ana, 'registrar_consumicion', { p_route_bar_id: ultimo, p_categoria: 'jarra' });
  if (r2.error) falla(r2, null, 'segunda');
  return `puntos=${d.puntos} nueva=${d.categoria_nueva}; segunda al momento: ${r2.error ? r2.error.message : 'aceptada'}`;
});
await paso('F7 Casas', 'categoria inventada se rechaza', async () =>
  falla(await rpc(U.ana, 'registrar_consumicion', { p_route_bar_id: bA()[7].id, p_categoria: 'absenta' }), null, 'categoria'),
);
await paso('F7 Casas', 'consumicion en un bar NO sellado se rechaza', async () =>
  falla(await rpc(U.dani, 'registrar_consumicion', { p_route_bar_id: bA()[7].id, p_categoria: 'vino' }), null, 'sin sello'),
);
await paso('F7 Casas', 'QR con alguien de OTRA casa: QR_OTHER_HOUSE', async () => {
  const casa = mundo.otros.casaDe;
  const otra = ['bea', 'carla', 'gema', 'susi'].find((n) => casa[U[n].id] !== casa[U.ana.id]);
  if (!otra) return 'todas de la misma casa que ana: no se puede probar';
  const codigo = ok(await rpc(U[otra], 'qr_mi_codigo'), `codigo de ${otra}`);
  return falla(await rpc(U.ana, 'qr_escanear', { p_route_id: mundo.rutas.A, p_codigo: codigoDe(codigo) }), 'QR_OTHER_HOUSE', 'otra casa');
});
await paso('F7 Casas', 'QR con alguien de la MISMA casa puntua; repetir no puntua dos veces', async () => {
  const casa = mundo.otros.casaDe;
  const ids = ['ana', 'bea', 'carla', 'gema', 'susi', 'dani'];
  let par = null;
  for (const a of ids) for (const b of ids) if (!par && a !== b && casa[U[a].id] === casa[U[b].id]) par = [a, b];
  if (!par) return 'nadie comparte casa en este reparto: no se puede probar';
  const codigo = ok(await rpc(U[par[1]], 'qr_mi_codigo'), 'codigo');
  const texto = codigoDe(codigo);
  const d = ok(await rpc(U[par[0]], 'qr_escanear', { p_route_id: mundo.rutas.A, p_codigo: texto }), 'escanear');
  const r2 = await rpc(U[par[0]], 'qr_escanear', { p_route_id: mundo.rutas.A, p_codigo: texto });
  if (r2.error) falla(r2, null, 'segunda');
  return `${par[0]} escanea a ${par[1]}: ${JSON.stringify(d)}; segunda: ${r2.error ? r2.error.message : JSON.stringify(r2.data)}`;
});
await paso('F7 Casas', 'escanear tu propio QR no vale', async () => {
  const codigo = ok(await rpc(U.ana, 'qr_mi_codigo'), 'codigo');
  const texto = codigoDe(codigo) ?? Object.values(codigo).find((v) => typeof v === 'string');
  return falla(await rpc(U.ana, 'qr_escanear', { p_route_id: mundo.rutas.A, p_codigo: texto }), null, 'propio');
});
await paso('F7 Casas', 'retos de la ruta', async () => JSON.stringify(ok(await rpc(U.ana, 'retos_mios', { p_route_id: mundo.rutas.A }), 'retos')).slice(0, 120));

// ---------------------------------------------------------------------------
// F8. La Caña
// ---------------------------------------------------------------------------
let etiquetas = [];
await paso('F8 La Caña', 'catalogo de etiquetas (30)', async () => {
  etiquetas = ok(await U.ana.c.from('match_tags').select('id').order('sort_order'), 'etiquetas').map((t) => t.id);
  igual(etiquetas.length, 30, 'etiquetas');
});
const activar = (n, extra = {}) =>
  rpc(U[n], 'match_activate_en_ruta', {
    p_route_id: mundo.rutas.A, p_lat: bA()[0].lat, p_lng: bA()[0].lng, p_adult_confirmed: true,
    p_bio: `Hola, soy ${n}`, p_tag_ids: etiquetas.slice(0, 3), p_consent_version: '2026-09-18', ...extra,
  });
await paso('F8 La Caña', 'activar lejos del primer bar (20 km) no deja', async () =>
  falla(await activar('ana', { p_lat: bA()[0].lat + 0.2 }), null, 'lejos'),
);
await paso('F8 La Caña', 'activar sin confirmar mayoria de edad no deja', async () =>
  falla(await activar('ana', { p_adult_confirmed: false }), null, 'menor'),
);
await paso('F8 La Caña', 'ana, bea, carla y gema activan La Caña en A', async () => {
  for (const n of ['ana', 'bea', 'carla', 'gema']) ok(await activar(n), `activar ${n}`);
});
await paso('F8 La Caña', 'fede (sin ruta) no puede activarla en A', async () => falla(await activar('fede'), null, 'fede'));
await paso('F8 La Caña', 'la vieja match_activate() pide actualizar la app', async () =>
  falla(await rpc(U.dani, 'match_activate', { p_adult_confirmed: true }), 'APP_UPDATE_REQUIRED', 'vieja'),
);
await paso('F8 La Caña', 'la cuadricula de ana enseña a los activados, no a si misma', async () => {
  const g = ok(await rpc(U.ana, 'match_grid', { p_route_id: mundo.rutas.A }), 'grid');
  const ids = g.map((x) => x.user_id ?? x.target_id ?? x.id);
  cierto(!ids.includes(U.ana.id), 'ana se ve a si misma');
  return `${g.length} perfiles`;
});
let conexion = null;
await paso('F8 La Caña', 'Me gusta mutuo ana-bea crea una conexion', async () => {
  ok(await rpc(U.ana, 'match_set_like', { p_route_id: mundo.rutas.A, p_target_id: U.bea.id, p_liked: true }), 'ana->bea');
  const d = ok(await rpc(U.bea, 'match_set_like', { p_route_id: mundo.rutas.A, p_target_id: U.ana.id, p_liked: true }), 'bea->ana');
  conexion = (Array.isArray(d) ? d[0] : d)?.connection_id;
  cierto(conexion, `sin conexion: ${JSON.stringify(d)}`);
  mundo.otros.conexion = conexion;
});
await paso('F8 La Caña', 'Me gusta a alguien que no la tiene activada (dani) falla', async () =>
  falla(await rpc(U.ana, 'match_set_like', { p_route_id: mundo.rutas.A, p_target_id: U.dani.id, p_liked: true }), null, 'dani'),
);
await paso('F8 La Caña', 'Me gusta a ti misma falla', async () =>
  falla(await rpc(U.ana, 'match_set_like', { p_route_id: mundo.rutas.A, p_target_id: U.ana.id, p_liked: true }), null, 'yo'),
);
await paso('F8 La Caña', 'la pregunta de la cerveza: ana pregunta, bea dice que si, chatean', async () => {
  ok(await rpc(U.ana, 'match_ask_beer', { p_connection_id: conexion }), 'preguntar');
  falla(await rpc(U.ana, 'match_answer_beer', { p_connection_id: conexion, p_answer: 'yes' }), null, 'contestarse a si misma');
  ok(await rpc(U.bea, 'match_answer_beer', { p_connection_id: conexion, p_answer: 'yes' }), 'bea contesta');
  ok(await rpc(U.ana, 'match_send_text', { p_connection_id: conexion, p_body: 'Nos vemos en el Hidalgo' }), 'texto');
  const m = ok(await rpc(U.bea, 'match_fetch_messages', { p_connection_id: conexion }), 'leer');
  cierto(m.length >= 2, `bea ve ${m.length} mensajes`);
  ok(await rpc(U.bea, 'match_mark_seen', { p_route_id: mundo.rutas.A, p_target_id: U.ana.id }), 'visto');
  ok(await rpc(U.ana, 'match_inbox', { p_route_id: mundo.rutas.A }), 'bandeja');
  ok(await rpc(U.ana, 'match_get_connection', { p_connection_id: conexion }), 'conexion');
});
await paso('F8 La Caña', 'carla no puede leer ni escribir en el chat de ana y bea', async () => {
  falla(await rpc(U.carla, 'match_fetch_messages', { p_connection_id: conexion }), null, 'leer ajeno');
  return falla(await rpc(U.carla, 'match_send_text', { p_connection_id: conexion, p_body: 'hola' }), null, 'escribir ajeno');
});
await paso('F8 La Caña', 'un mensaje vacio o enorme se rechaza', async () => {
  falla(await rpc(U.ana, 'match_send_text', { p_connection_id: conexion, p_body: '   ' }), null, 'vacio');
  return falla(await rpc(U.ana, 'match_send_text', { p_connection_id: conexion, p_body: 'x'.repeat(5000) }), null, 'enorme');
});
await paso('F8 La Caña', 'ni un admin lee los mensajes por la tabla', async () => {
  const r = await U.admin.c.from('match_messages').select('*');
  if (r.error) return falla(r, null, 'tabla');
  igual(r.data.length, 0, 'mensajes que ve el admin');
});
await paso('F8 La Caña', 'bloquear y desbloquear', async () => {
  ok(await rpc(U.gema, 'match_block', { p_target_id: U.carla.id }), 'bloquear');
  const l = ok(await rpc(U.gema, 'match_blocked_list'), 'lista');
  cierto(l.length === 1, `lista de bloqueados: ${l.length}`);
  ok(await rpc(U.gema, 'match_unblock', { p_target_id: U.carla.id }), 'desbloquear');
});
await paso('F8 La Caña', 'carla denuncia a bea (acoso) y la bloquea', async () => {
  const id = ok(
    await rpc(U.carla, 'match_report', { p_route_id: mundo.rutas.A, p_target_id: U.bea.id, p_reason: 'acoso', p_detail: 'Me escribe sin parar', p_connection_id: null, p_block: true }),
    'denunciar',
  );
  mundo.otros.denuncia = id;
  cierto(id, 'sin id de denuncia');
});
await paso('F8 La Caña', 'un motivo inventado no vale', async () =>
  falla(await rpc(U.carla, 'match_report', { p_route_id: mundo.rutas.A, p_target_id: U.gema.id, p_reason: 'me cae mal' }), null, 'motivo'),
);
await paso('F8 La Caña', 'actualizar frase y etiquetas; demasiadas etiquetas se rechaza', async () => {
  ok(await rpc(U.ana, 'match_update_profile', { p_bio: 'Nueva frase', p_tag_ids: etiquetas.slice(3, 5) }), 'actualizar');
  return falla(await rpc(U.ana, 'match_update_profile', { p_bio: 'x', p_tag_ids: etiquetas }), null, '30 etiquetas');
});

// ---------------------------------------------------------------------------
// F9. Moderacion: bandeja, expulsar con veto, suspender, avisos, reclamar
// ---------------------------------------------------------------------------
await paso('F9 Moderación', 'un participante no entra en la bandeja', async () =>
  falla(await rpc(U.ana, 'match_admin_reports', { p_solo_pendientes: true }), 'FORBIDDEN|NOT_ADMIN', 'bandeja'),
);
await paso('F9 Moderación', 'el admin ve la denuncia, la reclama y la lee', async () => {
  const l = ok(await rpc(U.admin, 'match_admin_reports', { p_solo_pendientes: true }), 'bandeja');
  cierto(l.some((x) => x.id === mundo.otros.denuncia || x.report_id === mundo.otros.denuncia), 'la denuncia no esta en la bandeja');
  ok(await rpc(U.admin, 'match_admin_take', { p_report_id: mundo.otros.denuncia }), 'reclamar');
  ok(await rpc(U.admin, 'match_admin_report', { p_report_id: mundo.otros.denuncia }), 'ficha');
  ok(await rpc(U.admin, 'match_admin_report_messages', { p_report_id: mundo.otros.denuncia }), 'mensajes de la denuncia');
  ok(await rpc(U.admin, 'match_admin_fotos_denuncia', { p_report_id: mundo.otros.denuncia }), 'fotos');
  ok(await rpc(U.admin, 'match_admin_alert_count'), 'contador');
});
await paso('F9 Moderación', 'sancionar sin motivo se rechaza (REASON_REQUIRED)', async () =>
  falla(await rpc(U.admin, 'match_admin_remove_from_route', { p_user_id: U.bea.id, p_route_id: mundo.rutas.A, p_reason: '' }), 'REASON', 'sin motivo'),
);
await paso('F9 Moderación', 'a un admin no se le veta (TARGET_IS_ADMIN)', async () =>
  falla(await rpc(U.admin, 'match_admin_remove_from_route', { p_user_id: U.admin2.id, p_route_id: mundo.rutas.A, p_reason: 'prueba' }), 'TARGET_IS_ADMIN', 'admin2'),
);
await paso('F9 Moderación', 'expulsar a bea de A: deja de ver la ruta y no puede volver con el enlace', async () => {
  ok(
    await rpc(U.admin, 'match_admin_remove_from_route', { p_user_id: U.bea.id, p_route_id: mundo.rutas.A, p_reason: 'Acoso en La Caña', p_report_id: mundo.otros.denuncia, p_note: 'interna' }),
    'expulsar',
  );
  igual(ok(await U.bea.c.from('routes').select('id').eq('id', mundo.rutas.A), 'rutas').length, 0, 'bea sigue viendo A');
  return falla(await rpc(U.bea, 'redeem_route_invite', { p_token: tokens.A }), null, 'volver a entrar');
});
await paso('F9 Moderación', 'bea lee su aviso con el motivo (art. 17 DSA)', async () => {
  const a = ok(await rpc(U.bea, 'my_notices'), 'avisos');
  cierto(a.length > 0 && JSON.stringify(a).includes('Acoso en La Caña'), `avisos de bea: ${JSON.stringify(a).slice(0, 200)}`);
  ok(await rpc(U.bea, 'my_notice_count'), 'contador');
  ok(await rpc(U.bea, 'my_restrictions'), 'restricciones');
  ok(await rpc(U.bea, 'mark_notices_read'), 'marcar leidos');
});
await paso('F9 Moderación', 'bea reclama la decision por el canal de contacto', async () => {
  const a = ok(await rpc(U.bea, 'my_notices'), 'avisos');
  const id = ok(await rpc(U.bea, 'send_admin_message', { p_kind: 'reclamacion', p_body: 'No fue asi', p_notice_id: a[0].id }), 'reclamar');
  mundo.otros.mensaje = id;
});
await paso('F9 Moderación', 'el admin contesta la reclamacion', async () => {
  ok(await rpc(U.admin, 'admin_messages', { p_solo_pendientes: true }), 'bandeja de mensajes');
  ok(await rpc(U.admin, 'admin_take_message', { p_id: mundo.otros.mensaje }), 'reclamar mensaje');
  ok(await rpc(U.admin, 'admin_answer_message', { p_id: mundo.otros.mensaje, p_answer: 'Revisado, se mantiene' }), 'contestar');
  ok(await rpc(U.bea, 'my_admin_messages'), 'bea lee la respuesta');
});
await paso('F9 Moderación', 'levantar el veto: bea puede volver a entrar', async () => {
  ok(await rpc(U.admin, 'match_admin_lift_route_ban', { p_user_id: U.bea.id, p_route_id: mundo.rutas.A, p_note: 'reclamacion aceptada' }), 'levantar');
  ok(await rpc(U.bea, 'redeem_route_invite', { p_token: tokens.A }), 'volver');
});
await paso('F9 Moderación', 'suspender a susi: entra y lee, pero no sella ni denuncia', async () => {
  ok(await rpc(U.admin, 'match_admin_suspend', { p_user_id: U.susi.id, p_reason: 'Insultos a la organizacion' }), 'suspender');
  const b = bA()[5];
  falla(await rpc(U.susi, 'claim_stamp', { p_route_bar_id: b.id, p_lat: b.lat, p_lng: b.lng }), null, 'sellar suspendida');
  falla(await rpc(U.susi, 'match_report', { p_route_id: mundo.rutas.A, p_target_id: U.ana.id, p_reason: 'otro' }), null, 'denunciar suspendida');
  ok(await rpc(U.susi, 'send_admin_message', { p_kind: 'contacto', p_body: '¿Por que?' }), 'escribir a la organizacion');
  ok(await rpc(U.susi, 'export_my_data'), 'descargar sus datos');
});
await paso('F9 Moderación', 'la lista de moderaciones y levantar la suspension', async () => {
  ok(await rpc(U.admin, 'match_admin_moderaciones'), 'lista');
  ok(await rpc(U.admin, 'match_admin_unsuspend', { p_user_id: U.susi.id, p_note: 'cumplida' }), 'levantar');
});
await paso('F9 Moderación', 'resolver la denuncia', async () => {
  ok(await rpc(U.admin, 'match_admin_resolve', { p_report_id: mundo.otros.denuncia, p_resolution: 'expulsada_de_ruta', p_note: 'fin' }), 'resolver');
});

// ---------------------------------------------------------------------------
// F10. Panel de casas (admin) -- incluye el fallo arreglado en la #44 (0065)
// ---------------------------------------------------------------------------
await paso('F10 Panel casas', 'cambiar los puntos de una accion (el fallo de la 0048)', async () => {
  const reglas = ok(await rpc(U.admin, 'casas_admin_reglas'), 'reglas');
  const r = reglas.find((x) => x.action === 'consumicion') ?? reglas[0];
  ok(await rpc(U.admin, 'casas_admin_regla', { p_action: r.action, p_points: r.points + 1 }), 'subir');
  ok(await rpc(U.admin, 'casas_admin_regla', { p_action: r.action, p_points: r.points }), 'devolver');
  return `${r.action}: ${r.points} -> ${r.points + 1} -> ${r.points}`;
});
await paso('F10 Panel casas', 'ajuste a mano, anularlo, movimientos y estadisticas', async () => {
  const id = ok(await rpc(U.admin, 'casas_admin_ajuste', { p_route_id: mundo.rutas.A, p_house: 'mahou', p_points: 15, p_motivo: 'premio del concurso' }), 'ajuste');
  ok(await rpc(U.admin, 'casas_admin_anular', { p_id: id, p_motivo: 'era de broma' }), 'anular');
  ok(await rpc(U.admin, 'casas_admin_movimientos', { p_route_id: mundo.rutas.A }), 'movimientos');
  ok(await rpc(U.admin, 'casas_admin_estadisticas', { p_route_id: mundo.rutas.A }), 'estadisticas');
  ok(await rpc(U.admin, 'casas_admin_personas', { p_busqueda: 'an' }), 'personas');
  ok(await rpc(U.admin, 'casas_aportes', { p_route_id: mundo.rutas.A, p_house: 'mahou' }), 'aportes');
  ok(await rpc(U.admin, 'casas_aportes_detalle', { p_route_id: mundo.rutas.A, p_house: 'mahou', p_user_id: U.ana.id }), 'aportes detalle');
});
await paso('F10 Panel casas', 'cambiar de casa a gema (con motivo) queda apuntado', async () => {
  const actual = mundo.otros.casaDe?.[U.gema.id];
  const nueva = ['mahou', 'cruzcampo', 'estrella', 'alhambra'].find((c) => c !== actual);
  ok(await rpc(U.admin, 'casas_admin_cambiar_casa', { p_user_id: U.gema.id, p_house: nueva, p_motivo: 'se lo pidio' }), 'cambiar');
  cierto(ok(await rpc(U.admin, 'casas_admin_cambios'), 'cambios').length > 0, 'no quedo apuntado');
  return `${actual} -> ${nueva}`;
});
await paso('F10 Panel casas', 'casa inventada y puntos fuera de rango se rechazan', async () => {
  falla(await rpc(U.admin, 'casas_admin_ajuste', { p_route_id: mundo.rutas.A, p_house: 'heineken', p_points: 1, p_motivo: 'x' }), null, 'casa');
  return falla(await rpc(U.admin, 'casas_admin_regla', { p_action: 'sello', p_points: 5000 }), 'INVALID_POINTS', 'rango');
});
await paso('F10 Panel casas', 'un participante no toca el panel', async () =>
  falla(await rpc(U.ana, 'casas_admin_regla', { p_action: 'sello', p_points: 100 }), 'FORBIDDEN', 'regla'),
);

// ---------------------------------------------------------------------------
// F11. Minijuegos (por ruta)
// ---------------------------------------------------------------------------
await paso('F11 Minijuegos', 'puntuaciones de los 4 juegos y ranking', async () => {
  for (const [g, p] of [['cana-perfecta', 80], ['conga-cervecera', 40], ['quien-quiere-ser-cervecero', 4], ['tapon-al-vuelo', 20]]) {
    ok(await rpc(U.ana, 'minigame_submit_score', { p_route_id: mundo.rutas.A, p_game: g, p_score: p, p_ms: 30000 }), `nota ${g}`);
    ok(await rpc(U.ana, 'minigame_ranking', { p_route_id: mundo.rutas.A, p_game: g }), `ranking ${g}`);
  }
});
await paso('F11 Minijuegos', 'juego inventado, nota negativa y nota imposible se rechazan', async () => {
  falla(await rpc(U.ana, 'minigame_submit_score', { p_route_id: mundo.rutas.A, p_game: 'pacman', p_score: 1 }), null, 'juego');
  falla(await rpc(U.ana, 'minigame_submit_score', { p_route_id: mundo.rutas.A, p_game: 'cana-perfecta', p_score: -5 }), null, 'negativa');
  return falla(await rpc(U.ana, 'minigame_submit_score', { p_route_id: mundo.rutas.A, p_game: 'quien-quiere-ser-cervecero', p_score: 999 }), null, 'imposible');
});
await paso('F11 Minijuegos', 'fede (sin ruta) no puntua en A', async () =>
  falla(await rpc(U.fede, 'minigame_submit_score', { p_route_id: mundo.rutas.A, p_game: 'cana-perfecta', p_score: 10 }), null, 'fede'),
);
await paso('F11 Minijuegos', 'Maestro Cervecero: guardar, listar y borrar una cerveza', async () => {
  const d = ok(
    await rpc(U.carla, 'maestro_submit_beer_v2', { p_route_id: mundo.rutas.A, p_name: 'La Rubia', p_malta: 'palida', p_levadura: 'ale', p_maceracion: 80, p_amargor: 70, p_aroma: 60, p_siembra: 90 }),
    'guardar',
  );
  const l = ok(await rpc(U.carla, 'maestro_list_beers', { p_route_id: mundo.rutas.A }), 'listar');
  cierto(l.length > 0, 'lista vacia');
  const id = d.id ?? d.beer_id ?? l[0].id;
  falla(await rpc(U.ana, 'maestro_delete_beer', { p_beer_id: id }), null, 'borrar la de otra');
  return `borrar la propia: ${JSON.stringify(ok(await rpc(U.carla, 'maestro_delete_beer', { p_beer_id: id }), 'borrar'))}`;
});
await paso('F11 Minijuegos', 'Maestro: malta inventada y porcentaje > 100 se rechazan', async () => {
  falla(await rpc(U.carla, 'maestro_submit_beer_v2', { p_route_id: mundo.rutas.A, p_name: 'X', p_malta: 'chocolate', p_levadura: 'ale', p_maceracion: 1, p_amargor: 1, p_aroma: 1, p_siembra: 1 }), null, 'malta');
  return falla(await rpc(U.carla, 'maestro_submit_beer_v2', { p_route_id: mundo.rutas.A, p_name: 'X', p_malta: 'palida', p_levadura: 'ale', p_maceracion: 500, p_amargor: 1, p_aroma: 1, p_siembra: 1 }), null, '500 %');
});
await paso('F11 Minijuegos', 'Conduces: puntuacion por nivel y ranking', async () => {
  ok(await rpc(U.gema, 'conduces_submit_score', { p_route_id: mundo.rutas.A, p_level: 1, p_distance: 1200 }), 'nota');
  ok(await rpc(U.gema, 'conduces_ranking', { p_route_id: mundo.rutas.A, p_level: 1 }), 'ranking');
});

// ---------------------------------------------------------------------------
// F12. Sorteo
// ---------------------------------------------------------------------------
await paso('F12 Sorteo', 'estado: bea y gema (8/8) dentro, dani (3/8) fuera', async () => {
  const e = ok(await rpc(U.gema, 'sorteo_estado', { p_route_id: mundo.rutas.A }), 'estado gema');
  const d = ok(await rpc(U.dani, 'sorteo_estado', { p_route_id: mundo.rutas.A }), 'estado dani');
  igual([e.dentro, d.dentro], [true, false], 'dentro gema/dani');
  return `participantes=${e.participantes}`;
});
await paso('F12 Sorteo', 'un participante no puede sortear', async () =>
  falla(await rpc(U.ana, 'sorteo_realizar', { p_route_id: mundo.rutas.A }), null, 'sortear'),
);
await paso('F12 Sorteo', 'excluir a gema, volver a incluirla, y sortear', async () => {
  ok(await rpc(U.admin, 'sorteo_personas', { p_route_id: mundo.rutas.A }), 'personas');
  ok(await rpc(U.admin, 'sorteo_excluir', { p_route_id: mundo.rutas.A, p_user_id: U.gema.id, p_motivo: 'lo pidio' }), 'excluir');
  ok(await rpc(U.admin, 'sorteo_incluir', { p_route_id: mundo.rutas.A, p_user_id: U.gema.id }), 'incluir');
  const r = ok(await rpc(U.admin, 'sorteo_realizar', { p_route_id: mundo.rutas.A }), 'sortear');
  return JSON.stringify(r).slice(0, 160);
});
await paso('F12 Sorteo', 'repetir el sorteo exige motivo', async () => {
  falla(await rpc(U.admin, 'sorteo_realizar', { p_route_id: mundo.rutas.A }), 'ALREADY_DRAWN', 'repetir sin motivo');
  ok(await rpc(U.admin, 'sorteo_realizar', { p_route_id: mundo.rutas.A, p_motivo: 'la ganadora no aparecio' }), 'repetir con motivo');
});

// ---------------------------------------------------------------------------
// F13. Avisos al movil, politica, estadisticas
// ---------------------------------------------------------------------------
await paso('F13 Avisos', 'guardar suscripcion push, preferencias y borrarla', async () => {
  ok(await rpc(U.ana, 'push_guardar', { p_endpoint: 'https://push.example/abc', p_p256dh: 'BPk'.padEnd(87, 'A'), p_auth: 'aaaaaaaaaaaaaaaaaaaaaa' }), 'guardar');
  ok(await rpc(U.ana, 'push_preferencias_guardar', { p_paradas: true, p_sorteo: false, p_cana: true }), 'prefs');
  ok(await rpc(U.ana, 'push_preferencias_leer'), 'leer');
  ok(await rpc(U.ana, 'push_borrar', { p_endpoint: 'https://push.example/abc' }), 'borrar');
});
await paso('F13 Avisos', 'marcar la politica vista', async () => {
  ok(await rpc(U.ana, 'politica_marcar_vista', { p_version: '2026-10-01' }), 'politica');
});
await paso('F13 Estadísticas', 'las estadisticas de admin no llevan ningun id de persona', async () => {
  const ids = Object.values(U).map((u) => u.id);
  for (const fn of ['admin_estadisticas_ruta', 'admin_estadisticas_actividad', 'admin_estadisticas_auditoria']) {
    const d = ok(await rpc(U.admin, fn, { p_route_id: mundo.rutas.A }), fn);
    const texto = JSON.stringify(d);
    const fuga = ids.find((id) => texto.includes(id));
    cierto(!fuga, `${fn} devuelve el id ${fuga}`);
  }
  ok(await rpc(U.admin, 'admin_estadisticas_global', {}), 'global');
});

// ---------------------------------------------------------------------------
// F14. Foto de perfil: bucket privado, revision de admin, URL firmadas
// ---------------------------------------------------------------------------
await paso('F14 Fotos', 'ana sube foto + miniatura y la manda a revision', async () => {
  const base = `${U.ana.id}/avatar-${Date.now().toString(36)}-prueba1`;
  const subir = async (ruta) => ok(await U.ana.c.storage.from('avatars').upload(ruta, JPEG, { contentType: 'image/jpeg', upsert: false }), `subir ${ruta}`);
  await subir(`${base}.jpg`);
  await subir(`${base}-mini.jpg`);
  const url = (r) => U.ana.c.storage.from('avatars').getPublicUrl(r).data.publicUrl;
  const id = ok(await rpc(U.ana, 'avatar_request_submit', { p_foto_path: `${base}.jpg`, p_thumb_path: `${base}-mini.jpg`, p_foto_url: url(`${base}.jpg`), p_thumb_url: url(`${base}-mini.jpg`) }), 'enviar');
  mundo.otros.fotoAna = { base, id };
  return id;
});
await paso('F14 Fotos', 'ana no puede subir a la carpeta de otra persona', async () =>
  falla(await U.ana.c.storage.from('avatars').upload(`${U.bea.id}/intrusa.jpg`, JPEG, { contentType: 'image/jpeg' }), null, 'carpeta ajena'),
);
await paso('F14 Fotos', 'una foto enviada no se puede sobrescribir', async () =>
  falla(await U.ana.c.storage.from('avatars').upload(`${mundo.otros.fotoAna.base}.jpg`, JPEG, { contentType: 'image/jpeg', upsert: true }), null, 'sobrescribir'),
);
await paso('F14 Fotos', 'el admin aprueba la foto', async () => {
  const l = ok(await rpc(U.admin, 'avatar_admin_requests', { p_solo_pendientes: true }), 'pendientes');
  const s = l.find((x) => x.user_id === U.ana.id) ?? l[0];
  cierto(s, 'no hay solicitud pendiente');
  // Como la pantalla del admin: la solicitud guarda RUTAS y el admin pasa las URL (0020).
  const url = (r) => U.admin.c.storage.from('avatars').getPublicUrl(r).data.publicUrl;
  const base = mundo.otros.fotoAna.base;
  ok(await rpc(U.admin, 'avatar_admin_decide', { p_request_id: s.id ?? s.request_id, p_approve: true, p_reason: null, p_foto_url: url(`${base}.jpg`), p_thumb_url: url(`${base}-mini.jpg`) }), 'aprobar');
  const p = ok(await U.ana.c.from('profiles').select('avatar_url').eq('id', U.ana.id).single(), 'perfil');
  cierto(p.avatar_url, 'avatar_url vacio tras aprobar');
});
await paso('F14 Fotos', 'gema (misma ruta) firma la foto de ana; fede (otra) no', async () => {
  const ruta = `${mundo.otros.fotoAna.base}.jpg`;
  const g = ok(await U.gema.c.storage.from('avatars').createSignedUrl(ruta, 60), 'firma de gema');
  cierto(g?.signedUrl, 'gema sin URL');
  const descarga = await fetch(g.signedUrl);
  igual(descarga.status, 200, 'descargar con la URL firmada');
  const f = await U.fede.c.storage.from('avatars').createSignedUrl(ruta, 60);
  cierto(f.error || !f.data?.signedUrl, 'fede pudo firmar la foto de alguien de otra ruta');
});
await paso('F14 Fotos', 'sin sesion la URL publica no descarga (bucket privado)', async () => {
  const url = U.ana.c.storage.from('avatars').getPublicUrl(`${mundo.otros.fotoAna.base}.jpg`).data.publicUrl;
  const r = await fetch(url);
  cierto(r.status >= 400, `la URL publica devolvio ${r.status}`);
  return `HTTP ${r.status}`;
});

// ---------------------------------------------------------------------------
// F15. Tus datos: exportar y borrar cuenta
// ---------------------------------------------------------------------------
await paso('F15 Datos', 'exportar: lleva tus sellos y no los correos de otros', async () => {
  const d = ok(await rpc(U.ana, 'export_my_data'), 'exportar');
  const texto = JSON.stringify(d);
  cierto(texto.includes(bA()[0].id) || texto.includes('stamps') || texto.includes('sellos'), 'no salen los sellos');
  const otros = ['bea@local.test', 'carla@local.test', 'gema@local.test'];
  const fuga = otros.find((e) => texto.includes(e));
  cierto(!fuga, `la exportacion lleva el correo de ${fuga}`);
  ok(await rpc(U.ana, 'match_export_my_data'), 'exportar la cana');
  return `${Math.round(texto.length / 1024)} KB`;
});
await paso('F15 Datos', 'un admin no puede borrarse la cuenta (ADMIN_CANNOT_DELETE)', async () => {
  const b = ok(await rpc(U.admin, 'delete_my_account_blockers'), 'impedimentos');
  cierto(JSON.stringify(b).includes('ADMIN_CANNOT_DELETE'), `impedimentos: ${JSON.stringify(b)}`);
  return falla(await rpc(U.admin, 'delete_my_account'), null, 'borrar admin');
});
await paso('F15 Datos', 'dani se borra la cuenta: desaparece y no puede volver a entrar', async () => {
  igual(ok(await rpc(U.dani, 'delete_my_account_blockers'), 'impedimentos'), [], 'impedimentos de dani');
  ok(await rpc(U.dani, 'delete_my_account'), 'borrar');
  let entro = true;
  try {
    await entrar('dani@local.test');
  } catch {
    entro = false;
  }
  cierto(!entro, 'dani sigue pudiendo entrar');
  const quedan = psqlEstricto(`select count(*) from public.stamps where user_id = '${U.dani.id}';`);
  igual(quedan, '0', 'sellos de dani tras borrarse');
  delete U.dani;
});
await paso('F15 Datos', 'dani puede volver a registrarse con el mismo correo', async () => {
  U.dani = await registrar('dani@local.test');
  return U.dani.id;
});

// ---------------------------------------------------------------------------
// F16. Ciclo de vida de una ruta: cerrar casas, terminar y borrar
// ---------------------------------------------------------------------------
await paso('F16 Rutas', 'cerrar y reabrir el marcador de casas de B', async () => {
  ok(await rpc(U.admin, 'casas_cerrar_ruta', { p_route_id: mundo.rutas.B }), 'cerrar');
  ok(await rpc(U.eva, 'casas_resultado', { p_route_id: mundo.rutas.B }), 'resultado');
  ok(await rpc(U.eva, 'casas_resultado_visto', { p_route_id: mundo.rutas.B }), 'visto');
  ok(await rpc(U.admin, 'casas_reabrir_ruta', { p_route_id: mundo.rutas.B }), 'reabrir');
});
await paso('F16 Rutas', 'aviso de ruta terminada: el admin la marca como vista', async () => {
  ok(await U.admin.c.from('admin_rutas_terminadas_vistas').insert({ route_id: mundo.rutas.D, admin_id: U.admin.id }).select(), 'marcar vista');
});
await paso('F16 Rutas', 'borrar la ruta D se lleva sus paradas, sellos y pertenencias', async () => {
  ok(await U.admin.c.from('routes').delete().eq('id', mundo.rutas.D), 'borrar');
  const q = psqlEstricto(
    `select (select count(*) from public.route_bars where route_id = '${mundo.rutas.D}') || ',' ||
            (select count(*) from public.route_members where route_id = '${mundo.rutas.D}') || ',' ||
            (select count(*) from public.route_invites where route_id = '${mundo.rutas.D}');`,
  );
  igual(q, '0,0,0', 'restos de D (paradas, miembros, invitaciones)');
  delete mundo.rutas.D;
});
await paso('F16 Rutas', 'un participante no puede borrar una ruta', async () => {
  const r = await U.ana.c.from('routes').delete().eq('id', mundo.rutas.A).select();
  if (r.error) return falla(r, null, 'borrar');
  igual(r.data.length, 0, 'rutas borradas por ana');
});

// ---------------------------------------------------------------------------
// F17. Combinacion: se borra la cuenta alguien con conexion, chat, denuncia y sorteo ganado
// ---------------------------------------------------------------------------
const ganadora = psqlEstricto(`select ganador from public.sorteos where route_id = '${mundo.rutas.A}' and vigente limit 1;`);
await paso('F17 Combinaciones', 'bea (conexion + chat + denunciada + quiza ganadora) se borra la cuenta', async () => {
  igual(ok(await rpc(U.bea, 'delete_my_account_blockers'), 'impedimentos'), [], 'impedimentos de bea');
  ok(await rpc(U.bea, 'delete_my_account'), 'borrar bea');
  return `ganador del sorteo era ${ganadora || '(nadie)'}`;
});
await paso('F17 Combinaciones', 'ana sigue usando La Caña: bandeja y chat con alguien que ya no existe', async () => {
  ok(await rpc(U.ana, 'match_inbox', { p_route_id: mundo.rutas.A }), 'bandeja');
  const c = await rpc(U.ana, 'match_get_connection', { p_connection_id: conexion });
  const m = await rpc(U.ana, 'match_fetch_messages', { p_connection_id: conexion });
  if (c.error) falla(c, null, 'conexion');
  if (m.error) falla(m, null, 'mensajes');
  ok(await rpc(U.ana, 'match_grid', { p_route_id: mundo.rutas.A }), 'cuadricula');
  return `conexion: ${c.error ? c.error.message : 'se abre'}; mensajes: ${m.error ? m.error.message : `${m.data.length}`}`;
});
await paso('F17 Combinaciones', 'el admin sigue leyendo la denuncia con el nombre de entonces (0017)', async () => {
  const d = ok(await rpc(U.admin, 'match_admin_report', { p_report_id: mundo.otros.denuncia }), 'ficha');
  cierto(JSON.stringify(d).includes('bea'), `la ficha ya no dice quien era: ${JSON.stringify(d).slice(0, 200)}`);
  ok(await rpc(U.admin, 'match_admin_moderaciones'), 'moderaciones');
});
await paso('F17 Combinaciones', 'sorteo, ranking de casas y estadisticas siguen respondiendo', async () => {
  const e = ok(await rpc(U.gema, 'sorteo_estado', { p_route_id: mundo.rutas.A }), 'sorteo');
  ok(await rpc(U.gema, 'casas_ranking', { p_route_id: mundo.rutas.A }), 'ranking');
  ok(await rpc(U.admin, 'admin_estadisticas_ruta', { p_route_id: mundo.rutas.A }), 'estadisticas');
  ok(await rpc(U.admin, 'sorteo_personas', { p_route_id: mundo.rutas.A }), 'personas del sorteo');
  return `resultado del sorteo que ve gema: ${JSON.stringify(e.resultado)?.slice(0, 160)}`;
});
await paso('F17 Combinaciones', 'bea vuelve con el mismo correo: empieza de cero, sin conexion ni sellos', async () => {
  U.bea = await registrar('bea@local.test');
  igual(psqlEstricto(`select count(*) from public.stamps where user_id = '${U.bea.id}';`), '0', 'sellos de la nueva bea');
  igual(ok(await U.bea.c.from('routes').select('id'), 'rutas').length, 0, 'rutas de la nueva bea');
});

// ---------------------------------------------------------------------------
mundo.usuarios = Object.fromEntries(Object.entries(U).map(([k, u]) => [k, { id: u.id, email: u.email }]));
guardar('mundo.json', mundo);
guardar('flujos.json', resultados);
const fallos = resultados.filter((r) => !r.ok);
console.log(`Flujos: ${resultados.length - fallos.length}/${resultados.length} pasos bien. Resultado en ${SALIDA}`);
for (const f of fallos) console.log(`  MAL  [${f.flujo}] ${f.nombre}\n       ${f.detalle}`);
