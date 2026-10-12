/**
 * Siembra el Supabase LOCAL con el escenario de los videos (reparto.mjs).
 *
 * Parte de una base recien reseteada (`supabase db reset`, todas las
 * migraciones aplicadas) y pasa por las MISMAS funciones que usa la app
 * siempre que puede (match_activate_en_ruta, avatar_request_submit,
 * avatar_admin_decide, minigame_submit_score...): si una migracion cambia una
 * regla, la semilla falla aqui en vez de grabar una demo que miente. Solo lo
 * que la app no deja hacer a nadie desde fuera (crear el admin, sellos ya
 * puestos de hace horas) se escribe con la clave de servicio.
 *
 * Se niega a correr contra algo que no sea 127.0.0.1 / localhost.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { svgAvatar } from './avatares.mjs';
import {
  ADMIN,
  CLAVE_DEMO,
  GENTE,
  PARADA_FOTO,
  PARADAS,
  PROTA,
  RUTA,
  SELLADAS_POR_PROTA,
  SORTEO,
  VENTANAS,
  correo,
} from './reparto.mjs';

const CONSENTIMIENTO_VERSION = '2026-09-18'; // src/features/match/reglas.ts

export function comprobarLocal(url) {
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`La semilla solo corre contra un Supabase local, no contra ${host}.`);
  }
}

function ok({ data, error }, que) {
  if (error) throw new Error(`${que}: ${error.message}`);
  return data;
}

/** La version de la politica que la app da por vigente (src/features/legal/responsable.ts). */
export function versionPolitica(codigo = readFileSync(new URL('../../src/features/legal/responsable.ts', import.meta.url), 'utf8')) {
  const m = /VERSION_POLITICA\s*=\s*'([^']+)'/.exec(codigo);
  if (!m) throw new Error('No encuentro VERSION_POLITICA en src/features/legal/responsable.ts');
  return m[1];
}

/**
 * Argumentos de match_activate_en_ruta (0040): la primera activacion lleva el
 * perfil entero, y la ubicacion junto al primer bar (tiene que estar a <= 3 km).
 */
export function argsActivar(rutaId, primerBar, persona) {
  return {
    p_route_id: rutaId,
    p_lat: primerBar.lat + 0.0002,
    p_lng: primerBar.lng,
    p_adult_confirmed: true,
    p_bio: persona.cana.bio,
    p_tag_ids: persona.cana.tags,
    p_consent_version: CONSENTIMIENTO_VERSION,
  };
}

/** Cliente con sesion de una persona de la demo (sin guardar sesion en disco). */
async function entrarComo(url, clavePublica, nombre) {
  const cli = createClient(url, clavePublica, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await cli.auth.signInWithPassword({ email: correo(nombre), password: CLAVE_DEMO }), `entrar como ${nombre}`);
  return cli;
}

/**
 * @param {{url:string, clavePublica:string, claveServicio:string,
 *          rasterizar:(svg:string, lado:number)=>Promise<Buffer>, ahora?:Date}} cfg
 */
export async function sembrar(cfg) {
  const { url, clavePublica, claveServicio, rasterizar } = cfg;
  comprobarLocal(url);
  const ahora = cfg.ahora ?? new Date();
  const servicio = createClient(url, claveServicio, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Cuentas. email_confirm: el alta de verdad la graba el video de Crear cuenta.
  const ids = {};
  for (const nombre of [ADMIN.nombre, ...GENTE.map((g) => g.nombre)]) {
    const creado = ok(
      await servicio.auth.admin.createUser({
        email: correo(nombre),
        password: CLAVE_DEMO,
        email_confirm: true,
        user_metadata: { display_name: nombre },
      }),
      `crear ${nombre}`,
    );
    ids[nombre] = creado.user.id;
  }
  // El primer admin se hace a mano (0002 lo deja a la service_role).
  ok(await servicio.from('profiles').update({ role: 'admin' }).eq('id', ids[ADMIN.nombre]), 'hacer admin');

  // 2. La ruta con paradas COPIADAS del catalogo, como hace el editor.
  const hoy = ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const ruta = ok(
    await servicio
      .from('routes')
      .insert({
        name: RUTA.nombre, description: RUTA.descripcion, event_date: hoy, is_published: true, created_by: ids[ADMIN.nombre],
        sorteo_activo: true, sorteo_premio: SORTEO.premio,
      })
      .select()
      .single(),
    'crear ruta',
  );
  const catalogo = ok(await servicio.from('catalog_bars').select('*').in('name', PARADAS), 'leer catalogo');
  const min = (m) => new Date(ahora.getTime() + m * 60000).toISOString();
  const filas = PARADAS.map((nombre, i) => {
    const c = catalogo.find((b) => b.name === nombre);
    if (!c) throw new Error(`El catalogo no tiene "${nombre}"`);
    return {
      route_id: ruta.id,
      // Hueco para la parada de foto detras del bar `despuesDelBar`.
      sort_order: i > PARADA_FOTO.despuesDelBar ? i + 1 : i,
      name: c.name,
      address: c.address ?? '',
      lat: c.lat,
      lng: c.lng,
      logo: c.logo,
      tipo: 'bar',
      radius_m: 60,
      opens_at: min(VENTANAS[i][0]),
      closes_at: min(VENTANAS[i][1]),
    };
  });
  filas.push({
    route_id: ruta.id,
    sort_order: PARADA_FOTO.despuesDelBar + 1,
    name: PARADA_FOTO.nombre,
    address: '',
    logo: null,
    lat: PARADA_FOTO.lat,
    lng: PARADA_FOTO.lng,
    tipo: 'foto',
    radius_m: 60,
    opens_at: min(PARADA_FOTO.ventana[0]),
    closes_at: min(PARADA_FOTO.ventana[1]),
  });
  const paradas = ok(await servicio.from('route_bars').insert(filas).select().order('sort_order'), 'crear paradas');
  // Los guiones cuentan en BARES (los que se sellan), como la app.
  const bares = paradas.filter((p) => p.tipo === 'bar');

  // 3. Todos dentro de la ruta (como si hubieran canjeado la invitacion).
  ok(
    await servicio.from('route_members').insert(GENTE.map((g) => ({ route_id: ruta.id, user_id: ids[g.nombre] }))),
    'meter en la ruta',
  );

  // 4. Sellos de antes de grabar: la hora es de hace un rato, cosa que
  // claim_stamp (con su now()) no puede escribir. Distancias pequenas y reales.
  const sellos = [];
  const sellar = (nombre, i, minutos) =>
    sellos.push({
      user_id: ids[nombre],
      route_bar_id: bares[i].id,
      stamped_at: min(minutos),
      lat: bares[i].lat + 0.0001,
      lng: bares[i].lng,
      distance_m: 11,
    });
  for (let i = 0; i < SELLADAS_POR_PROTA; i++) sellar(PROTA, i, VENTANAS[i][0] + 25);
  const otros = { Dani: 3, Lucia: 2, Sergio: 4, Paula: 3, Javi: 1, Irene: 4, Carlos: 2, Nerea: 3, Alex: 1 };
  for (const [nombre, n] of Object.entries(otros)) for (let i = 0; i < n; i++) sellar(nombre, i, VENTANAS[i][0] + 10 + i * 3);
  ok(await servicio.from('stamps').insert(sellos), 'sellos previos');

  // 5. Fotos: cada cual sube la suya y la manda a revision; el admin aprueba.
  const admin = await entrarComo(url, clavePublica, ADMIN.nombre);
  const clientes = {};
  for (const g of GENTE) {
    const cli = await entrarComo(url, clavePublica, g.nombre);
    clientes[g.nombre] = cli;
    const svg = svgAvatar(g.avatar);
    const base = `${ids[g.nombre]}/avatar-demo-${g.nombre.toLowerCase()}`;
    const rutas = { foto: `${base}.jpg`, mini: `${base}-mini.jpg` };
    for (const [clave, lado] of [['foto', 512], ['mini', 160]]) {
      ok(
        await cli.storage.from('avatars').upload(rutas[clave], await rasterizar(svg, lado), { contentType: 'image/jpeg', upsert: false }),
        `subir foto de ${g.nombre}`,
      );
    }
    const publica = (r) => `${url}/storage/v1/object/public/avatars/${r}`;
    ok(
      await cli.rpc('avatar_request_submit', { p_foto_path: rutas.foto, p_thumb_path: rutas.mini }),
      `enviar foto de ${g.nombre}`,
    );
    // Devuelve el estado, no el id: el id se lee como lo lee Mi perfil (RLS: solo las suyas).
    const [{ id: idSolicitud }] = ok(
      await cli.from('avatar_requests').select('id').eq('status', 'pendiente').order('created_at', { ascending: false }).limit(1),
      `leer solicitud de ${g.nombre}`,
    );
    ok(
      await admin.rpc('avatar_admin_decide', {
        p_request_id: idSolicitud,
        p_approve: true,
        p_foto_url: publica(rutas.foto),
        p_thumb_url: publica(rutas.mini),
      }),
      `aprobar foto de ${g.nombre}`,
    );
  }

  // 6. La Caña: todos menos Marta la tienen activada EN ESTA RUTA (0040); su
  // video la activa. Activar exige estar cerca del primer bar: se manda su sitio.
  for (const g of GENTE) {
    if (g.nombre === PROTA) continue;
    ok(await clientes[g.nombre].rpc('match_activate_en_ruta', argsActivar(ruta.id, bares[0], g)), `activar La Caña de ${g.nombre}`);
  }
  // Un poco de vida entre ellos, para que la grilla no sea un desierto.
  const gustos = [
    ['Dani', 'Lucia'], ['Lucia', 'Dani'], ['Carlos', 'Nerea'], ['Irene', 'Alex'], ['Paula', 'Javi'],
  ];
  for (const [de, a] of gustos) {
    ok(await clientes[de].rpc('match_set_like', { p_route_id: ruta.id, p_target_id: ids[a], p_liked: true }), `${de} -> ${a}`);
  }

  // 7. Casas (0043-0061): que la clasificacion tenga puntos de TODAS las
  // formas, para que el video de Casas lo pueda ensenar. Los sellos ya puntuan
  // solos (disparador); lo demas, por las mismas funciones que la app.
  await sembrarCasas({ servicio, admin, clientes, ruta, sellos, ids });

  // La politica vigente, vista por todo el reparto (0063): son gente que ya
  // usaba la app, y si no el aviso de "politica nueva" sale en mitad de un video.
  const version = versionPolitica();
  for (const g of GENTE) ok(await clientes[g.nombre].rpc('politica_marcar_vista', { p_version: version }), `politica de ${g.nombre}`);

  // 8. La invitacion que abre Pablo en el video de Crear cuenta.
  const invitacion = ok(
    await admin.rpc('create_route_invite', { p_route_id: ruta.id, p_max_uses: 20, p_expires_in_hours: 8 }),
    'crear invitacion',
  );
  const token = invitacion?.[0]?.invite_token;
  if (!token) throw new Error(`create_route_invite no devolvio token: ${JSON.stringify(invitacion)}`);

  return { ids, rutaId: ruta.id, bares, token };
}

/**
 * Retos, consumiciones, encuentros por QR y notas de minijuegos (podios).
 * Marta no hace nada aqui: lo suyo lo hace en los videos.
 */
async function sembrarCasas({ servicio, admin, clientes, ruta, sellos, ids }) {
  // Retos de la ruta, creados por la organizacion (RLS: solo admins escriben).
  ok(
    await admin.from('retos').insert([
      { route_id: ruta.id, nombre: 'Tres de tres', descripcion: 'Sella tres bares.', tipo: 'bares', objetivo: 3, puntos: 15 },
      { route_id: ruta.id, nombre: 'Catador', descripcion: 'Apunta dos tipos de bebida distintos.', tipo: 'categorias', objetivo: 2, puntos: 10 },
      { route_id: ruta.id, nombre: 'Rompehielos', descripcion: 'Conoce a alguien por QR.', tipo: 'encuentros_qr', objetivo: 1, puntos: 8, max_personas: 20 },
    ]),
    'crear retos',
  );

  // Una consumicion por persona, en el ULTIMO bar que sello (la regla de la 0045).
  const categorias = ['jarra', 'tercio', 'sin_alcohol', 'vino', 'sidra', 'copa', 'tercio', 'jarra', 'sin_alcohol'];
  const otros = GENTE.filter((g) => g.nombre !== PROTA);
  for (const [i, g] of otros.entries()) {
    const suyos = sellos.filter((s) => s.user_id === ids[g.nombre]);
    const ultimo = suyos.sort((a, b) => a.stamped_at.localeCompare(b.stamped_at)).at(-1);
    if (!ultimo) continue;
    ok(
      await clientes[g.nombre].rpc('registrar_consumicion', { p_route_bar_id: ultimo.route_bar_id, p_categoria: categorias[i % categorias.length] }),
      `consumicion de ${g.nombre}`,
    );
  }

  // Encuentros por QR: una ensena su codigo y la otra lo escanea. Solo entre
  // gente de la MISMA casa (QR_OTHER_HOUSE), y la casa se reparte sola al
  // entrar en la ruta: se empareja segun lo que haya tocado.
  const casas = ok(await servicio.from('user_houses').select('user_id, house'), 'leer casas');
  const casaDe = (nombre) => casas.find((c) => c.user_id === ids[nombre])?.house;
  const parejas = [];
  const libres = otros.map((g) => g.nombre);
  while (libres.length && parejas.length < 3) {
    const a = libres.shift();
    const j = libres.findIndex((b) => casaDe(b) === casaDe(a));
    if (j >= 0) parejas.push([a, libres.splice(j, 1)[0]]);
  }
  for (const [ensena, escanea] of parejas) {
    const codigo = ok(await clientes[ensena].rpc('qr_mi_codigo'), `QR de ${ensena}`);
    const valor = typeof codigo === 'string' ? codigo : (codigo?.codigo ?? codigo?.[0]?.codigo);
    ok(await clientes[escanea].rpc('qr_escanear', { p_route_id: ruta.id, p_codigo: valor }), `${escanea} escanea a ${ensena}`);
  }

  // Notas de minijuegos: de ahi salen los podios (se calculan en vivo).
  const notas = [['cana-perfecta', { Sergio: 97, Irene: 91, Dani: 86, Paula: 70 }], ['conga-cervecera', { Javi: 640, Dani: 515, Nerea: 430 }]];
  for (const [juego, porPersona] of notas) {
    for (const [nombre, nota] of Object.entries(porPersona)) {
      ok(await clientes[nombre].rpc('minigame_submit_score', { p_route_id: ruta.id, p_game: juego, p_score: nota }), `${juego} de ${nombre}`);
    }
  }
}

/** Acciones de "el resto del mundo" que el grabador dispara EN MITAD de un video. */
export async function titiritero(cfg, rutaId, ids) {
  const cache = {};
  const como = async (nombre) => (cache[nombre] ??= await entrarComo(cfg.url, cfg.clavePublica, nombre));
  const servicio = createClient(cfg.url, cfg.claveServicio, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    /** La Caña de alguien que aun no la tenia (para el trailer, que no ensena la activacion). */
    async activarCana(nombre) {
      const g = GENTE.find((x) => x.nombre === nombre);
      const [primero] = ok(
        await servicio.from('route_bars').select('lat, lng').eq('route_id', rutaId).order('sort_order').limit(1),
        'leer primer bar',
      );
      ok(await (await como(nombre)).rpc('match_activate_en_ruta', argsActivar(rutaId, primero, g)), `activar La Caña de ${nombre}`);
    },
    /**
     * "Unas horas despues": los sellos que le faltan, con la clave de servicio
     * (sus bares aun no han abierto de verdad, claim_stamp los rechazaria).
     * Se usa detras de una tarjeta que lo dice: el video no finge que sea en directo.
     */
    async sellarResto(nombre) {
      // Solo bares: una parada de foto no se sella (claim_stamp la rechaza, NOT_STAMPABLE).
      const bares = ok(await servicio.from('route_bars').select('*').eq('route_id', rutaId).eq('tipo', 'bar').order('sort_order'), 'leer paradas');
      const hechos = ok(await servicio.from('stamps').select('route_bar_id').eq('user_id', ids[nombre]), 'leer sellos');
      const faltan = bares.filter((b) => !hechos.some((h) => h.route_bar_id === b.id));
      ok(
        await servicio.from('stamps').insert(
          faltan.map((b) => ({ user_id: ids[nombre], route_bar_id: b.id, stamped_at: b.opens_at, lat: b.lat, lng: b.lng, distance_m: 9 })),
        ),
        'sellar el resto',
      );
    },
    async meGusta(de, a) {
      ok(await (await como(de)).rpc('match_set_like', { p_route_id: rutaId, p_target_id: ids[a], p_liked: true }), `${de} -> ${a}`);
    },
    async conexionCon(de, a) {
      const inbox = ok(await (await como(de)).rpc('match_inbox', { p_route_id: rutaId }), 'inbox');
      const fila = (inbox ?? []).find((c) => c.other_user_id === ids[a]);
      if (!fila) throw new Error(`${de} no tiene conexion con ${a}: ${JSON.stringify(inbox)}`);
      return fila.connection_id;
    },
    async preguntarCerveza(de, a) {
      const id = await this.conexionCon(de, a);
      ok(await (await como(de)).rpc('match_ask_beer', { p_connection_id: id }), 'preguntar cerveza');
    },
    /**
     * La organizacion aprueba la foto que `nombre` acaba de mandar a revision,
     * por la misma funcion que el boton de Alertas de administracion.
     */
    async aprobarFoto(nombre) {
      const [pendiente] = ok(
        await servicio.from('avatar_requests').select('*').eq('user_id', ids[nombre]).eq('status', 'pendiente')
          .order('created_at', { ascending: false }).limit(1),
        'leer foto pendiente',
      );
      if (!pendiente) throw new Error(`${nombre} no tiene ninguna foto en revision`);
      const publica = (r) => `${cfg.url}/storage/v1/object/public/avatars/${r}`;
      ok(
        await (await como(ADMIN.nombre)).rpc('avatar_admin_decide', {
          p_request_id: pendiente.id, p_approve: true,
          p_foto_url: publica(pendiente.foto_path), p_thumb_url: publica(pendiente.thumb_path),
        }),
        `aprobar foto de ${nombre}`,
      );
    },
    /** respuesta: 'yes' | 'no' | 'later' (match_answer_beer). */
    async responderCerveza(de, a, respuesta) {
      const id = await this.conexionCon(de, a);
      ok(await (await como(de)).rpc('match_answer_beer', { p_connection_id: id, p_answer: respuesta }), 'responder cerveza');
    },
    async escribir(de, a, texto) {
      const id = await this.conexionCon(de, a);
      ok(await (await como(de)).rpc('match_send_text', { p_connection_id: id, p_body: texto }), 'escribir');
    },
  };
}
