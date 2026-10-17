/**
 * Lo que el grabador necesita del mundo: el Supabase local (claves y como
 * resetearlo), Chrome, ffmpeg y la web exportada contra ese Supabase.
 *
 * El proyecto de Supabase local NO vive en el repo (su config.toml lleva
 * puertos y servicios de esta maquina): se crea en SUPABASE_WORKDIR (por
 * defecto ~/.ruta-de-bares-videos/sb) copiando supabase/migrations.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = join(AQUI, '..', '..');
export const TRABAJO = process.env.VIDEOS_WORKDIR ?? join(homedir(), '.ruta-de-bares-videos');
export const SUPABASE_WORKDIR = process.env.SUPABASE_WORKDIR ?? join(TRABAJO, 'sb');
export const WEB = join(TRABAJO, 'web');
export const SALIDA = process.env.VIDEOS_SALIDA ?? join(RAIZ, 'videos');

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function supabase(args, opciones = {}) {
  const r = spawnSync(NPX, ['-y', 'supabase@2.120.0', ...args], {
    cwd: SUPABASE_WORKDIR,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opciones,
  });
  if (r.status !== 0) throw new Error(`supabase ${args.join(' ')} fallo:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/** Crea (una vez) el proyecto local y copia las migraciones del repo. */
export function prepararSupabase() {
  const config = join(SUPABASE_WORKDIR, 'supabase', 'config.toml');
  if (!existsSync(config)) {
    mkdirSync(SUPABASE_WORKDIR, { recursive: true });
    supabase(['init', '--yes']);
    let c = readFileSync(config, 'utf8');
    c = c.replace(/project_id = ".*"/, 'project_id = "rdb-videos"');
    // Solo lo que usa la app: base, auth, storage y la API. Arranca antes.
    for (const seccion of ['realtime', 'studio', 'storage.s3_protocol', 'storage.vector', 'edge_runtime', 'analytics', 'experimental.pgdelta']) {
      c = c.replace(new RegExp(`(\\[${seccion.replace('.', '\\.')}\\]\\s*\\r?\\nenabled = )true`), '$1false');
    }
    writeFileSync(config, c);
  }
  const destino = join(SUPABASE_WORKDIR, 'supabase', 'migrations');
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  for (const f of readdirSync(join(RAIZ, 'supabase', 'migrations'))) {
    if (f.endsWith('.sql')) copyFileSync(join(RAIZ, 'supabase', 'migrations', f), join(destino, f));
  }
}

/** Arranca el stack si no lo esta y devuelve url y claves. */
export function arrancarSupabase() {
  prepararSupabase();
  let estado;
  try {
    estado = JSON.parse(supabase(['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch {
    supabase(['start']);
    estado = JSON.parse(supabase(['status', '-o', 'json']));
  }
  return { url: estado.API_URL, clavePublica: estado.PUBLISHABLE_KEY, claveServicio: estado.SECRET_KEY };
}

/** Base limpia con TODAS las migraciones del repo: cada video parte de aqui. */
export function resetearBase() {
  supabase(['db', 'reset', '--local', '--yes']);
}

export function buscarChrome() {
  const candidatos = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const chrome = candidatos.find((r) => existsSync(r));
  if (!chrome) throw new Error('No encuentro Chrome. Pon su ruta en $CHROME.');
  return chrome;
}

/**
 * Exporta la web apuntando al Supabase local (las EXPO_PUBLIC_ se hornean al exportar).
 *
 * EXPO_NO_DOTENV: sin el, Expo leia el `.env` del repo (el de PRODUCCION) por
 * encima de estas variables y la web salia apuntando al Supabase de verdad.
 * Grabar asi daria de alta cuentas reales (el video de registro crea a Pablo).
 */
export function exportarWeb({ url, clavePublica }) {
  execFileSync(NPX, ['expo', 'export', '-p', 'web', '--output-dir', WEB, '--clear'], {
    cwd: RAIZ,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: clavePublica,
    },
  });
  comprobarWebLocal(url);
}

/** Supabase a los que apunta la web exportada (las URL horneadas en el JS). */
export function supabasesDeLaWeb(textoJs) {
  // localhost:NNNN no cuenta: alguna libreria trae uno por defecto (:9999) que no es nuestro Supabase.
  return [...new Set(textoJs.match(/https?:\/\/[a-z0-9-]+\.supabase\.co|http:\/\/127\.0\.0\.1:\d+/g) ?? [])];
}

/** Se niega a seguir si la web exportada habla con algo que no sea el Supabase local. */
export function comprobarWebLocal(url) {
  const js = join(WEB, '_expo', 'static', 'js', 'web');
  const texto = readdirSync(js).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(js, f), 'utf8')).join('\n');
  const vistos = supabasesDeLaWeb(texto);
  const ajenos = vistos.filter((u) => u !== url);
  if (!vistos.includes(url) || ajenos.length) {
    throw new Error(`La web exportada no apunta (solo) al Supabase local ${url}: ${vistos.join(', ') || 'ninguno'}. No se graba.`);
  }
}
