// Barrido de TODAS las funciones que puede ejecutar la app (o alguien sin sesion),
// como 6 personas distintas y con 5 juegos de argumentos cada una.
//
// Cada llamada va como la hace PostgREST: sesion de `authenticator` (que carga
// safeupdate y supautils, como en produccion), SET LOCAL ROLE al rol del JWT y
// request.jwt.claims con quien es. Despues se DESHACE a proposito (se lanza un
// error dentro del bloque), asi que se pueden probar miles de combinaciones,
// destructivas incluidas (borrar la cuenta, purgar una ruta), sin tocar el mundo.
//
// Lo que se busca: errores INTERNOS (columna o funcion que no existe, UPDATE sin
// WHERE, escribir en una funcion STABLE, tipos que no casan...). Los de negocio
// (FORBIDDEN, NOT_FOUND, INVALID_...) son la respuesta correcta y se cuentan aparte.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { API, clasificarError, guardar, psql, psqlEstricto, SALIDA } from './comun.mjs';

const mundo = JSON.parse(readFileSync(join(SALIDA, 'mundo.json'), 'utf8'));
const U = mundo.usuarios;
const A = mundo.rutas.A;
const barA = mundo.bares.A[0];

// --- Estado persistente que el barrido necesita (se hace UNA vez, con commit) ---
psqlEstricto(`
  select set_config('request.jwt.claims', '{"sub":"${U.admin.id}","role":"authenticated"}', false);
  select public.match_admin_suspend('${U.susi.id}', 'Suspendida para el barrido', null, 'barrido');
`);
const q = (sql) => psqlEstricto(sql) || null;
const extra = {
  aviso: q(`select id from public.user_notices order by created_at limit 1;`),
  solicitudFoto: q(`select id from public.avatar_requests order by created_at limit 1;`),
  movimiento: q(`select id from public.point_movements order by id limit 1;`),
  mensaje: mundo.otros.mensaje,
  denuncia: mundo.otros.denuncia,
  conexion: mundo.otros.conexion,
  tags: q(`select string_agg(id::text, ',') from (select id from public.match_tags order by sort_order limit 2) t;`)?.split(',') ?? [],
};

// --- Autocomprobacion: tres funciones rotas a proposito, que el barrido TIENE que cazar ---
// (si no las marca como bug, el barrido no vale y lo dice). Se borran al final.
const DETECTORES = {
  zz_detector_update_sin_where: '21000', // el fallo de la 0048 (safeupdate)
  zz_detector_stable_que_escribe: '0A000',
  zz_detector_columna_inexistente: '42703',
};
psqlEstricto(`
  create or replace function public.zz_detector_update_sin_where() returns void language plpgsql security definer set search_path = public
    as $f$ begin update public.casas_marcador set cambiado_at = now(); end $f$;
  create or replace function public.zz_detector_stable_que_escribe() returns void language plpgsql stable security definer set search_path = public
    as $f$ begin update public.casas_marcador set cambiado_at = now() where true; end $f$;
  create or replace function public.zz_detector_columna_inexistente() returns void language plpgsql security definer set search_path = public
    as $f$ begin perform no_existe from public.routes limit 1; end $f$;
  grant execute on function public.zz_detector_update_sin_where(), public.zz_detector_stable_que_escribe(),
    public.zz_detector_columna_inexistente() to authenticated;
`);
process.on('exit', () => {
  psql(`drop function if exists public.zz_detector_update_sin_where(); drop function if exists public.zz_detector_stable_que_escribe();
        drop function if exists public.zz_detector_columna_inexistente();`);
});

// --- Las funciones a barrer ---
const funciones = JSON.parse(
  psqlEstricto(`
    select json_agg(f) from (
      select p.proname as nombre, p.oid::regprocedure::text as firma, p.provolatile as volatil,
             coalesce(p.proargnames, '{}') as nombres, coalesce(p.proargmodes::text[], '{}') as modos,
             (select array_agg(format_type(t, null) order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) as tipos,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
        and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
    ) f;`),
);
for (const f of funciones) {
  // Nombres de los argumentos de ENTRADA (proargnames trae tambien los de salida).
  const entrada = f.modos.length === 0 ? f.nombres : f.nombres.filter((_, i) => ['i', 'b', 'v'].includes(f.modos[i]));
  f.args = (f.tipos ?? []).map((tipo, i) => ({ nombre: entrada[i] ?? `$${i + 1}`, tipo }));
}

// --- Quien llama ---
const personas = {
  anonimo: { rol: 'anon', sub: null },
  fuera: { rol: 'authenticated', sub: U.fede.id }, // con cuenta, sin ruta
  participante: { rol: 'authenticated', sub: U.ana.id }, // de A, con La Caña activa
  'otra-ruta': { rol: 'authenticated', sub: U.eva.id }, // solo de B
  suspendida: { rol: 'authenticated', sub: U.susi.id },
  admin: { rol: 'authenticated', sub: U.admin.id },
};

// --- Argumentos ---
const lit = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const urlFoto = (sub) => `${API}/storage/v1/object/public/avatars/${sub}/avatar-barrido.jpg`;
function valorValido(nombre, tipo, sub) {
  const n = nombre.toLowerCase();
  if (tipo === 'uuid') {
    if (n.includes('route_bar')) return barA.id;
    if (n.includes('route')) return A;
    if (n.includes('connection')) return extra.conexion;
    if (n.includes('report')) return extra.denuncia;
    if (n.includes('notice')) return extra.aviso;
    if (n.includes('request')) return extra.solicitudFoto;
    if (n === 'p_id') return extra.mensaje;
    if (n.includes('user') || n.includes('target')) return U.gema.id; // de la ruta A y con La Caña activa
    if (n.includes('temporada') || n.includes('beer')) return randomUUID();
    return randomUUID();
  }
  if (tipo === 'text') {
    const fijos = {
      p_house: 'mahou', p_categoria: 'tercio', p_game: 'cana-perfecta', p_reason: 'otro', p_resolution: 'sin_accion',
      p_answer: 'yes', p_kind: 'contacto', p_malta: 'palida', p_levadura: 'ale', p_token: mundo.otros.tokens.A,
      p_action: 'sello', p_consent_version: '2026-09-18', p_version: '2026-10-01', p_endpoint: 'https://push.example/barrido',
      p_p256dh: 'B'.padEnd(87, 'A'), p_auth: 'a'.repeat(22), p_name: 'Barrido', p_bio: 'Hola', p_body: 'Hola',
      p_detail: 'Detalle', p_motivo: 'Motivo de prueba', p_note: 'Nota', p_busqueda: 'a', p_codigo: 'codigo-de-prueba',
      p_premio: 'Camiseta', p_value: 'like',
    };
    if (n in fijos) return fijos[n];
    if (n.includes('path')) return `${sub ?? U.ana.id}/avatar-barrido${n.includes('thumb') ? '-mini' : ''}.jpg`;
    if (n.includes('url')) return urlFoto(sub ?? U.ana.id);
    if (n === 'p_name' || n === 'p_p_name') return 'avatar-barrido.jpg';
    return 'prueba';
  }
  if (tipo === 'text[]') return `{${extra.tags.join(',')}}`;
  if (tipo === 'integer' || tipo === 'smallint' || tipo === 'bigint') {
    const fijos = { p_points: 5, p_max_uses: 3, p_expires_in_hours: 2, p_score: 10, p_ms: 30000, p_limit: 10, p_limite: 10, p_offset: 0, p_level: 1, p_distance: 100, p_days: 30 };
    if (n in fijos) return fijos[n];
    if (n === 'p_id') return extra.movimiento ?? 1;
    return 50;
  }
  if (tipo === 'boolean') return true;
  if (tipo === 'double precision' || tipo === 'numeric') {
    if (n.includes('lat')) return barA.lat;
    if (n.includes('lng') || n.includes('lon')) return barA.lng;
    return 40.48;
  }
  if (tipo.startsWith('timestamp')) return new Date(Date.now() - 3600_000).toISOString();
  if (tipo === 'date') return new Date().toISOString().slice(0, 10);
  if (tipo === 'jsonb' || tipo === 'json') return '{}';
  return null;
}
const variantes = {
  valido: (a, sub) => valorValido(a.nombre, a.tipo, sub),
  nulos: () => null,
  ajenos: (a, sub) => (a.tipo === 'uuid' ? randomUUID() : valorValido(a.nombre, a.tipo, sub)),
  vacios: (a, sub) => {
    if (a.tipo === 'text') return '';
    if (a.tipo === 'text[]') return '{}';
    if (['integer', 'smallint', 'bigint', 'double precision', 'numeric'].includes(a.tipo)) return 0;
    if (a.tipo === 'boolean') return false;
    return valorValido(a.nombre, a.tipo, sub);
  },
  extremos: (a, sub) => {
    if (a.tipo === 'text') return 'x'.repeat(10000);
    if (a.tipo === 'text[]') return `{${Array.from({ length: 200 }, (_, i) => `t${i}`).join(',')}}`;
    if (a.tipo === 'integer') return -2147483648;
    if (a.tipo === 'smallint') return -32768;
    if (a.tipo === 'bigint') return '-9223372036854775808';
    if (a.tipo === 'double precision' || a.tipo === 'numeric') return -1e308;
    if (a.tipo.startsWith('timestamp')) return '1900-01-01T00:00:00Z';
    return valorValido(a.nombre, a.tipo, sub);
  },
};

// --- Generar el SQL ---
const casos = [];
const bloques = [];
for (const f of funciones) {
  for (const [persona, p] of Object.entries(personas)) {
    if (p.rol === 'anon' && !f.anon) continue; // sin EXECUTE: la API ni la encuentra
    if (p.rol === 'authenticated' && !f.auth) continue;
    for (const [variante, gen] of Object.entries(variantes)) {
      if (f.args.length === 0 && variante !== 'valido') continue;
      const id = casos.length;
      const args = f.args.map((a) => {
        const v = gen(a, p.sub);
        return { nombre: a.nombre, tipo: a.tipo, valor: v };
      });
      const lista = args.map((a) => `${a.nombre.startsWith('$') ? '' : `${a.nombre} => `}${lit(a.valor)}::${a.tipo}`).join(', ');
      casos.push({ id, funcion: f.nombre, firma: f.firma, volatil: f.volatil, persona, variante, args: args.map((a) => `${a.nombre}=${String(a.valor).slice(0, 40)}`) });
      const claims = JSON.stringify(p.sub ? { sub: p.sub, role: p.rol } : { role: p.rol });
      bloques.push(`do $b$
declare st text := ''; msg text := '';
begin
  perform set_config('request.jwt.claims', ${lit(claims)}, true);
  perform set_config('request.jwt.claim.sub', ${lit(p.sub ?? '')}, true);
  perform set_config('request.jwt.claim.role', ${lit(p.rol)}, true);
  perform set_config('statement_timeout', '8s', true);
  begin
    execute 'set local role ${p.rol}';
    perform public.${f.nombre}(${lista});
    raise exception using errcode = 'ZZ999', message = 'deshacer';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
  end;
  raise notice 'R|${id}|%|%', st, replace(replace(msg, E'\\n', ' '), '|', '/');
end $b$;`);
    }
  }
}
guardar('barrido.sql', bloques.join('\n'));

// --- Ejecutar en tandas como authenticator ---
const salida = [];
const TANDA = 400;
const t0 = Date.now();
for (let i = 0; i < bloques.length; i += TANDA) {
  const r = psql(bloques.slice(i, i + TANDA).join('\n'), { como: 'authenticator' });
  salida.push(r.stderr);
  if (r.stderr.includes('FATAL') || r.stderr.includes('could not connect')) throw new Error(r.stderr.slice(0, 500));
  process.stdout.write(`\r  ${Math.min(i + TANDA, bloques.length)}/${bloques.length} llamadas`);
}
process.stdout.write('\n');

const respuesta = new Map();
for (const linea of salida.join('\n').split('\n')) {
  const m = /NOTICE:\s+R\|(\d+)\|([^|]*)\|(.*)$/.exec(linea);
  if (m) respuesta.set(Number(m[1]), { sqlstate: m[2], mensaje: m[3].trim() });
}
for (const c of casos) {
  const r = respuesta.get(c.id);
  if (!r) {
    c.clase = 'sin-respuesta';
    continue;
  }
  c.sqlstate = r.sqlstate === 'ZZ999' ? '' : r.sqlstate;
  c.mensaje = r.sqlstate === 'ZZ999' ? '' : r.mensaje;
  c.clase = clasificarError(c.sqlstate, c.mensaje);
}
const otrosErrores = salida.join('\n').split('\n').filter((l) => /^(psql:)?.*ERROR:/.test(l)).slice(0, 20);

// Autocomprobacion: cada detector, cazado con SU codigo por todas las personas con sesion.
const autocomprobacion = Object.entries(DETECTORES).map(([fn, esperado]) => {
  const suyos = casos.filter((c) => c.funcion === fn);
  const cazados = suyos.filter((c) => c.clase === 'bug' && c.sqlstate === esperado).length;
  return { funcion: fn, esperado, llamadas: suyos.length, cazados, ok: suyos.length > 0 && cazados === suyos.length };
});
const reales = casos.filter((c) => !(c.funcion in DETECTORES));
casos.length = 0;
casos.push(...reales);

const resumen = {
  llamadas: casos.length, funciones: funciones.length - Object.keys(DETECTORES).length,
  segundos: Math.round((Date.now() - t0) / 1000), porClase: {}, autocomprobacion,
};
for (const c of casos) resumen.porClase[c.clase] = (resumen.porClase[c.clase] ?? 0) + 1;
guardar('barrido.json', { resumen, casos, otrosErrores });
for (const a of autocomprobacion) {
  console.log(`  autocomprobacion ${a.ok ? 'OK ' : 'MAL'} ${a.funcion}: ${a.cazados}/${a.llamadas} cazadas con ${a.esperado}`);
}
if (autocomprobacion.some((a) => !a.ok)) {
  console.log('  EL BARRIDO NO DETECTA LO QUE DEBE: sus resultados no valen.');
  process.exitCode = 1;
}

console.log(`Barrido: ${casos.length} llamadas a ${funciones.length} funciones en ${resumen.segundos} s`);
console.log(`  por clase: ${JSON.stringify(resumen.porClase)}`);
const graves = casos.filter((c) => ['bug', 'sin-respuesta', 'sin-validar', 'tiempo'].includes(c.clase));
const agrupado = new Map();
for (const c of graves) {
  const k = `${c.clase} | ${c.funcion} | ${c.sqlstate} ${c.mensaje?.slice(0, 120)}`;
  agrupado.set(k, [...(agrupado.get(k) ?? []), `${c.persona}/${c.variante}`]);
}
for (const [k, v] of [...agrupado].sort()) console.log(`  ${k}\n      <- ${v.join(', ')}`);
if (otrosErrores.length) console.log('  errores fuera de los bloques:\n   ' + otrosErrores.join('\n   '));
