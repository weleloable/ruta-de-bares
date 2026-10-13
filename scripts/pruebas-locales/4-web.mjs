// La web, pantalla a pantalla, en Chrome headless contra el servidor de Expo
// (`npx expo start --web --port 8091`, apuntando al Supabase local por .env.local).
// Tres perfiles: sin sesion, participante (ana) y admin. En cada pantalla se cazan:
// excepciones de JavaScript, console.error, peticiones a la API que fallan (>= 400,
// salvo las que la app espera) y la pantalla roja de error de Expo. Captura de cada una.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLAVE_USUARIOS, guardar, psqlEstricto, SALIDA } from './comun.mjs';

const WEB = process.env.PRUEBAS_WEB_URL ?? 'http://localhost:8091';
const mundo = JSON.parse(readFileSync(join(SALIDA, 'mundo.json'), 'utf8'));
const U = mundo.usuarios;
const A = mundo.rutas.A;
const solicitudFoto = psqlEstricto(`select id from public.avatar_requests order by created_at limit 1;`);
const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync);
if (!chrome) throw new Error('No encuentro Chrome');
const CAPTURAS = join(SALIDA, 'web');
mkdirSync(CAPTURAS, { recursive: true });

const PANTALLAS = {
  anonimo: ['/login', '/registro', '/privacidad', `/invitacion?token=${mundo.otros.tokens.A}`, '/', '/admin/alertas'],
  participante: [
    '/', '/ruta', '/casas', '/cana', '/minijuegos', '/perfil', '/avisos', '/contacto', '/privacidad', '/casas/historico',
    '/cana/bloqueados', '/cana/condiciones', '/cana/presentacion', `/cana/chat/${mundo.otros.conexion}`, `/cana/persona/${U.gema.id}`,
    `/invitacion?token=${mundo.otros.tokens.A}`,
    // Pantallas de admin entrando como participante: tienen que negarse con buenas maneras.
    '/admin/alertas', '/admin/casas', '/editor', `/editor/${A}`, '/invitaciones',
  ],
  admin: [
    '/', '/ruta', '/casas', '/cana', '/minijuegos', '/perfil', '/admin/alertas', '/admin/casas', '/admin/estadisticas',
    '/admin/moderacion', `/admin/alerta/${mundo.otros.denuncia}`, `/admin/foto/${solicitudFoto}`, `/admin/mensaje/${mundo.otros.mensaje}`,
    '/editor', `/editor/${A}`, `/editor/${A}/bar-nuevo`, `/editor/${A}/bar?barId=${mundo.bares.A[0].id}`, '/invitaciones',
    // Ids que no existen: la pantalla tiene que decirlo, no romperse.
    '/admin/alerta/00000000-0000-4000-8000-000000000000', '/editor/00000000-0000-4000-8000-000000000000',
    '/cana/chat/00000000-0000-4000-8000-000000000000',
  ],
};
const CUENTA = { participante: U.ana.email, admin: U.admin.email };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirChrome(puerto) {
  const perfil = mkdtempSync(join(tmpdir(), 'pruebas-web-'));
  const hijo = spawn(chrome, ['--headless=new', '--disable-gpu', `--user-data-dir=${perfil}`, `--remote-debugging-port=${puerto}`, 'about:blank'], { stdio: 'ignore' });
  let objetivos = [];
  for (let i = 0; i < 60 && !objetivos.some((t) => t.type === 'page'); i++) {
    try {
      objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
    } catch {
      await dormir(250);
    }
  }
  const ws = new WebSocket(objetivos.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0;
  const pendientes = new Map();
  const oyentes = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pendientes.has(d.id)) {
      pendientes.get(d.id)(d);
      pendientes.delete(d.id);
    } else if (d.method) oyentes.forEach((f) => f(d));
  };
  const cdp = (method, params = {}) =>
    new Promise((r) => {
      const id = ++n;
      pendientes.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  return { cdp, ev, oyentes, cerrar: () => { ws.close(); hijo.kill(); } };
}

const resultados = [];
let puerto = 9400;
for (const [persona, rutas] of Object.entries(PANTALLAS)) {
  const b = await abrirChrome(puerto++);
  const eventos = [];
  b.oyentes.push((d) => eventos.push(d));
  await b.cdp('Page.enable');
  await b.cdp('Runtime.enable');
  await b.cdp('Network.enable');
  await b.cdp('Log.enable');
  await b.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  if (CUENTA[persona]) {
    await b.cdp('Page.navigate', { url: `${WEB}/login` });
    await dormir(7000);
    const poner = (i, v) => `(() => { const e = document.querySelectorAll('input')[${i}]; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, ${JSON.stringify(v)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`;
    await b.ev(poner(0, CUENTA[persona]));
    await b.ev(poner(1, CLAVE_USUARIOS));
    await dormir(300);
    await b.ev(`[...document.querySelectorAll('div')].find((x) => (x.innerText || '').trim() === 'Entrar')?.click()`);
    await dormir(6000);
  }

  for (const ruta of rutas) {
    eventos.length = 0;
    await b.cdp('Page.navigate', { url: `${WEB}${ruta}` });
    await dormir(6500);
    const texto = (await b.ev('document.body.innerText')) ?? '';
    const errores = [];
    for (const d of eventos) {
      if (d.method === 'Runtime.exceptionThrown') errores.push(`EXCEPCION ${d.params.exceptionDetails.exception?.description?.split('\n')[0] ?? d.params.exceptionDetails.text}`);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
        errores.push(`console.error ${d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 220)}`);
      }
      if (d.method === 'Network.responseReceived') {
        const { url, status } = d.params.response;
        if (status >= 400 && /\/(rest|auth|storage)\/v1\//.test(url)) errores.push(`HTTP ${status} ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`);
      }
    }
    const pantallaRoja = /Uncaught Error|Something went wrong|Render Error|Unmatched Route/i.test(texto);
    if (pantallaRoja) errores.push(`PANTALLA DE ERROR: ${texto.slice(0, 160).replace(/\n/g, ' | ')}`);
    const nombre = `${persona}${ruta.replace(/[/?=&]/g, '_').slice(0, 80)}.png`;
    const img = await b.cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(CAPTURAS, nombre), Buffer.from(img.result.data, 'base64'));
    const url = await b.ev('location.pathname + location.search');
    resultados.push({ persona, ruta, acabaEn: url, errores, captura: nombre, texto: texto.slice(0, 300).replace(/\n+/g, ' | ') });
    process.stdout.write(`  ${errores.length ? 'MAL' : 'ok '} ${persona} ${ruta}${url !== ruta ? `  -> ${url}` : ''}\n`);
  }
  b.cerrar();
}

guardar('web.json', resultados);
const conErrores = resultados.filter((r) => r.errores.length);
console.log(`Web: ${resultados.length} pantallas, ${conErrores.length} con errores. Capturas en ${CAPTURAS}`);
for (const r of conErrores) console.log(`  [${r.persona}] ${r.ruta}\n     ${[...new Set(r.errores)].join('\n     ')}`);
