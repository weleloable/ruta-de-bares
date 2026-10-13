// Piezas comunes de las pruebas contra el Supabase LOCAL (docs/SETUP.md, seccion 10).
// Nada de esto toca produccion: se niega a arrancar si la URL no es de esta maquina.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';

export const API = process.env.PRUEBAS_API_URL ?? 'http://127.0.0.1:54421';
export const CONTENEDOR = process.env.PRUEBAS_DB_CONTAINER ?? 'supabase_db_ruta-de-bares';
export const SALIDA = process.env.PRUEBAS_SALIDA ?? join(tmpdir(), 'ruta-de-bares-pruebas');
export const CLAVE_USUARIOS = 'password123';

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`STOP: ${API} no es local. Estas pruebas crean y borran datos: solo en esta maquina.`);
  process.exit(1);
}
mkdirSync(SALIDA, { recursive: true });

let estado = null;
/** Claves locales de `supabase status` (cambian por instalacion, no se guardan en ningun sitio). */
export function claves() {
  if (estado) return estado;
  const texto = execFileSync('npx', ['-y', 'supabase@latest', 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  estado = JSON.parse(texto.slice(texto.indexOf('{')));
  return estado;
}

/** Un cliente de la API como lo usa la app: clave publicable, sin guardar sesion. */
export function cliente() {
  return createClient(API, claves().PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Alta por el registro publico (el mismo camino que la pantalla de crear cuenta). */
export async function registrar(email) {
  const c = cliente();
  const { data, error } = await c.auth.signUp({ email, password: CLAVE_USUARIOS });
  if (error) throw new Error(`registro de ${email}: ${error.message}`);
  if (!data.session) throw new Error(`registro de ${email}: sin sesion (¿confirmacion de correo activada?)`);
  return { c, id: data.user.id, email };
}

export async function entrar(email) {
  const c = cliente();
  const { data, error } = await c.auth.signInWithPassword({ email, password: CLAVE_USUARIOS });
  if (error) throw new Error(`entrar como ${email}: ${error.message}`);
  return { c, id: data.user.id, email };
}

/**
 * SQL en la base local. `como`: 'postgres' (superusuario, para preparar datos
 * como haria alguien en el SQL Editor) o 'authenticator' (el rol con el que entra
 * la API: carga `safeupdate` y `supautils`, igual que en produccion).
 */
export function psql(sql, { como = 'postgres' } = {}) {
  const args = ['exec', '-i'];
  if (como === 'authenticator') args.push('-e', 'PGPASSWORD=postgres');
  args.push(CONTENEDOR, 'psql');
  if (como === 'authenticator') args.push('-h', '127.0.0.1', '-U', 'authenticator');
  else args.push('-U', 'postgres');
  args.push('-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0');
  const r = spawnSync('docker', args, { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
}

/** Lo mismo, pero falla si hay cualquier error: para preparar datos. */
export function psqlEstricto(sql) {
  const r = psql(`\\set ON_ERROR_STOP 1\n${sql}`);
  if (r.status !== 0) throw new Error(`SQL fallo:\n${r.stderr}`);
  return r.stdout.trim();
}

export function guardar(nombre, datos) {
  const ruta = join(SALIDA, nombre);
  writeFileSync(ruta, typeof datos === 'string' ? datos : JSON.stringify(datos, null, 2));
  return ruta;
}

/**
 * Codigos de error de Postgres que son un BUG del servidor (y no una respuesta
 * de negocio como FORBIDDEN o NOT_FOUND, que salen con P0001/P0002/22023/42501).
 * Ver https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function clasificarError(sqlstate, mensaje = '') {
  if (!sqlstate) return 'ok';
  // PostgREST (PGRST...) = la llamada no casa con ninguna funcion: fallo de quien llama.
  if (/^PGRST/.test(sqlstate)) return 'bug';
  // Storage (AccessDenied, NoSuchKey...) no usa codigos de Postgres: es su respuesta normal.
  if (!/^[0-9A-Z]{5}$/.test(sqlstate)) return 'negocio';
  if (sqlstate === '42501') return 'negocio'; // sin permiso: la respuesta correcta para quien no debe
  if (sqlstate.startsWith('28')) return 'negocio'; // NOT_AUTHENTICATED (28000): sin sesion
  if (sqlstate === 'P0001' || sqlstate === 'P0002' || sqlstate === '22023') return 'negocio';
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(mensaje.trim())) return 'negocio'; // NOT_FOUND, FORBIDDEN... con otro errcode
  if (sqlstate === '23505' || sqlstate === '23503' || sqlstate === '23514') return 'restriccion';
  if (sqlstate === '23502') return 'sin-validar'; // null en columna obligatoria: falto validar la entrada
  if (sqlstate === '22P02' || sqlstate === '22007' || sqlstate === '22008' || sqlstate === '22003') return 'sin-validar';
  if (sqlstate === '57014') return 'tiempo'; // statement_timeout
  return 'bug'; // 42703 columna, 42883 funcion, 21000 safeupdate, 25006 solo lectura, 0A000, XX000...
}
