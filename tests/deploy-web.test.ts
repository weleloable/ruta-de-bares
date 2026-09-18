/**
 * Invariantes del despliegue web en GitHub Pages.
 *
 * El despliegue real solo se ve despues de mergear, asi que aqui se fija lo
 * que lo rompe en silencio: la subruta, el fallback SPA, de donde salen las
 * variables de Supabase, y que el baseUrl no se cuele en desarrollo ni en
 * los builds nativos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { INVITE_PATH, WEB_APP_URL, buildInviteUrl } from '../src/features/invites/link.ts';

const TOKEN = 'aB3-_dEfGhIjKlMnOpQrStUvWxYz0123456789abcde';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const workflow = readFileSync(`${raiz}.github/workflows/deploy-web.yml`, 'utf8');
// Sin comentarios, para que una linea comentada no haga pasar un test.
const codigo = workflow
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

test('workflow: se dispara en push a master y a mano', () => {
  assert.match(codigo, /on:\s*\n\s+push:\s*\n\s+branches:\s*\[master\]/);
  assert.match(codigo, /^\s+workflow_dispatch:/m);
});

test('workflow: permisos minimos para Pages', () => {
  assert.match(codigo, /^permissions:\s*\n\s+contents: read\s*\n\s+pages: write\s*\n\s+id-token: write\s*$/m);
});

test('workflow: exporta web con la subruta exacta /ruta-de-bares', () => {
  const baseUrls = [...codigo.matchAll(/WEB_BASE_URL:\s*(\S+)/g)].map((m) => m[1]);
  assert.deepEqual(baseUrls, ['/ruta-de-bares']);
  assert.match(codigo, /npx expo export --platform web --output-dir dist/);
});

test('workflow: fallback SPA (404.html) y .nojekyll que si llega al artefacto', () => {
  assert.match(codigo, /cp dist\/index\.html dist\/404\.html/);
  assert.match(codigo, /touch dist\/\.nojekyll/);
  assert.match(codigo, /actions\/upload-pages-artifact@v\d+\s*\n\s+with:\s*\n\s+path: dist/);
  // upload-pages-artifact excluye los ficheros con punto por defecto.
  assert.match(codigo, /include-hidden-files: true/);
  assert.match(codigo, /actions\/deploy-pages@v\d+/);
});

test('workflow: las variables de Supabase salen de vars. y se comprueban antes de exportar', () => {
  for (const nombre of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
    assert.match(codigo, new RegExp(`${nombre}: \\$\\{\\{ vars\\.${nombre} \\}\\}`));
    assert.match(codigo, new RegExp(`if \\[ -z "\\$${nombre}" \\]`));
  }
  assert.ok(
    codigo.indexOf('Comprobar variables') < codigo.indexOf('npx expo export'),
    'la comprobacion tiene que ir antes del export',
  );
  assert.doesNotMatch(workflow, /secrets\./);
});

test('workflow: no necesita la clave de Google Maps', () => {
  assert.doesNotMatch(workflow, /GOOGLE_MAPS/);
});

test('el enlace de invitacion apunta a la subruta que exporta el workflow', () => {
  // Si se cambia WEB_BASE_URL (o el dominio de Pages) y no WEB_APP_URL, todos
  // los enlaces que se repartan llevarian a una pagina que no existe.
  const subruta = /WEB_BASE_URL:\s*(\S+)/.exec(codigo)?.[1];
  assert.ok(subruta, 'el workflow define WEB_BASE_URL');
  const url = new URL(buildInviteUrl(TOKEN));
  assert.equal(url.origin + url.pathname, `${WEB_APP_URL}/invitacion`);
  assert.equal(new URL(WEB_APP_URL).pathname, subruta);
  assert.equal(url.pathname, `${subruta}/invitacion`);
});

test('la pagina de invitacion existe como ruta del router (app/invitacion.tsx)', () => {
  // El enlace compartido acaba en /invitacion: si se renombra la pantalla el
  // enlace cae en "no encontrada" sin que ningun otro test lo note.
  assert.ok(existsSync(`${raiz}app/invitacion.tsx`));
  assert.equal(INVITE_PATH, 'invitacion');
});

let importaciones = 0;
async function cargarConfig(baseUrl: string | undefined): Promise<{ experiments?: Record<string, unknown> }> {
  const antes = process.env.WEB_BASE_URL;
  if (baseUrl === undefined) delete process.env.WEB_BASE_URL;
  else process.env.WEB_BASE_URL = baseUrl;
  try {
    // La query fuerza a evaluar el modulo otra vez con el entorno nuevo.
    const url = `${pathToFileURL(`${raiz}app.config.ts`).href}?n=${importaciones++}`;
    const mod = await import(url);
    return mod.default;
  } finally {
    if (antes === undefined) delete process.env.WEB_BASE_URL;
    else process.env.WEB_BASE_URL = antes;
  }
}

test('app.config: sin WEB_BASE_URL no hay baseUrl (desarrollo local y nativo intactos)', async () => {
  const config = await cargarConfig(undefined);
  assert.equal(config.experiments?.typedRoutes, true);
  assert.equal('baseUrl' in (config.experiments ?? {}), false);
  assert.equal('baseUrl' in (await cargarConfig('')).experiments!, false);
});

test('app.config: con WEB_BASE_URL aplica exactamente ese baseUrl', async () => {
  const config = await cargarConfig('/ruta-de-bares');
  assert.equal(config.experiments?.baseUrl, '/ruta-de-bares');
  assert.equal(config.experiments?.typedRoutes, true);
});

test('app.config: rechaza un WEB_BASE_URL sin barra inicial o con barra final', async () => {
  for (const malo of ['ruta-de-bares', '/ruta-de-bares/', '/', 'https://x.io/ruta']) {
    await assert.rejects(cargarConfig(malo), /WEB_BASE_URL invalido/, malo);
  }
});
