#!/usr/bin/env node
/**
 * Prueba de COMPORTAMIENTO de Maestro Cervecero en un navegador de verdad: que
 * cada paso con olla (maceracion y hervido del lupulo) CABE en la pantalla sin
 * scroll y con su boton accesible, y que la bolsita de lupulo llega a la olla.
 *
 *   npm run verificar:juego
 *
 * Leer el codigo no demuestra que algo quepa: el alto que le queda al paso
 * depende de la barra de arriba, las pestanas, la cabecera del juego y los
 * botones Siguiente / Atras (ver ALTO_APP_RESERVADO en maceracion.ts). Esto
 * monta el menu de minijuegos en Chrome headless con 120 px de falsa barra y
 * pestanas, recorre el juego hasta el lupulo y mide, en pixeles, en tres
 * alturas de movil:
 *
 *   1. el contenedor del paso no tiene scroll (nada se sale);
 *   2. el boton del paso queda entero y por encima de "Siguiente", no tapado;
 *   3. en el lupulo, un toque a tiempo echa la bolsita y la olla acaba con ella dentro.
 *
 * Tarda ~4 min (un export web y tres recorridos; el reloj del juego va mas
 * lento en headless). Es del carril periodico, no del gate de cada commit:
 * correr antes de subir cambios a esos pasos o a la pantalla de los juegos.
 *
 * Como el del mapa (verificar-mapa-web.mjs): escribe una pantalla de prueba
 * temporal en app/(auth)/ (zona publica, sin login), exporta la web, la BORRA
 * pase lo que pase, la sirve y la abre en Chrome en TIEMPO REAL. Chrome se
 * busca en las rutas habituales o en $CHROME.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANTALLA = join(raiz, 'app', '(auth)', 'verificar-juego.tsx');

/** Alturas de ventana (con barra y pestanas incluidas) y ancho de movil a probar. */
const TAMANOS = [
  { ancho: 390, alto: 740, nombre: 'movil bajo' },
  { ancho: 400, alto: 808, nombre: 'movil normal' },
  { ancho: 412, alto: 915, nombre: 'movil alto' },
];

const CODIGO_PANTALLA = `// GENERADO por scripts/verificar-juego-web.mjs. Se borra solo. No commitear.
import { View } from 'react-native';

import { MenuMinijuegos } from '../../src/features/minijuegos/MenuMinijuegos';

// 56 px de barra de arriba y 64 de pestanas: lo que la app real le quita a la pantalla del juego.
export default function VerificarJuego() {
  return (
    <View style={{ flex: 1, paddingTop: 56, paddingBottom: 64, backgroundColor: '#F7F1E6' }}>
      <MenuMinijuegos rutaId={null} nombreRuta="Prueba" />
    </View>
  );
}
`;

function buscarChrome() {
  const candidatos = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidatos.find((ruta) => existsSync(ruta)) ?? null;
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };

function servir(carpeta) {
  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = normalize(join(carpeta, decodeURIComponent(new URL(peticion.url, 'http://x').pathname)));
    const fichero = ruta.startsWith(carpeta) && existsSync(ruta) && statSync(ruta).isFile() ? ruta : join(carpeta, 'index.html');
    respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(fichero)] ?? 'application/octet-stream' });
    respuesta.end(readFileSync(fichero));
  });
  return new Promise((resolver) => servidor.listen(0, '127.0.0.1', () => resolver(servidor)));
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Cierra Chrome con todos sus procesos (en Windows `kill()` solo cierra el principal). */
function cerrarArbol(hijo) {
  if (hijo.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
  else hijo.kill('SIGKILL');
}

/** Abre Chrome y devuelve una pequena API sobre el protocolo DevTools. */
async function abrirChrome(chrome, perfil, url, { ancho, alto }) {
  const hijo = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${perfil}`,
    `--window-size=${ancho},${alto}`,
    '--remote-debugging-port=0',
    'about:blank',
  ]);
  let stderr = '';
  const urlNavegador = await new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error('Chrome no abrio DevTools en 30 s')), 30000);
    hijo.stderr.on('data', (trozo) => {
      stderr += trozo;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (m) {
        clearTimeout(reloj);
        resolver(m[1]);
      }
    });
  });
  const paginas = await (await fetch(`http://127.0.0.1:${new URL(urlNavegador).port}/json/list`)).json();
  const ws = new WebSocket(paginas.find((p) => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolver) => (ws.onopen = resolver));
  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (pendientes.has(m.id)) {
      pendientes.get(m.id)(m);
      pendientes.delete(m.id);
    }
  };
  const cdp = (method, params = {}) =>
    new Promise((resolver) => {
      const n = ++id;
      pendientes.set(n, resolver);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const ev = async (expression) => (await cdp('Runtime.evaluate', { expression, returnByValue: true })).result.result?.value;

  /** Centro de lo que lleva ese texto o ese aria-label. El elemento mas profundo: un clic ahi sube hasta el Pressable. */
  const centro = (txt) =>
    ev(`(() => {
      const q = ${JSON.stringify(txt)};
      let e = [...document.querySelectorAll('[aria-label]')].find((x) => x.getAttribute('aria-label').trim().startsWith(q));
      if (!e) {
        const todos = [...document.querySelectorAll('body *')].filter((x) => (x.innerText || '').trim().startsWith(q));
        e = todos.find((x) => ![...x.children].some((h) => (h.innerText || '').trim().startsWith(q)));
      }
      if (!e) return null;
      const c = e.getBoundingClientRect();
      return c.width && c.height ? [c.left + c.width / 2, c.top + c.height / 2] : null;
    })()`);

  const api = {
    ev,
    async navegar() {
      await cdp('Page.enable');
      await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
      await cdp('Page.navigate', { url });
    },
    /** Un clic de raton completo (movimiento, pulsar, soltar): RN Web ignora un clic sintetico a medias. */
    async clic(txt, reintentos = 40) {
      for (let i = 0; i < reintentos; i++) {
        const p = await centro(txt);
        if (p) {
          const [x, y] = p;
          await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
          await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
          await esperar(50);
          await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
          return;
        }
        await esperar(250);
      }
      throw new Error(`no encuentro "${txt}" en la pantalla`);
    },
    texto: () => ev('document.body.innerText'),
    /** Espera a que el texto de la pagina case. Con `tocar`, mientras espera va pulsando ese boton. */
    async hasta(re, { tocar, limite = 90000 } = {}) {
      const ini = Date.now();
      while (Date.now() - ini < limite) {
        if (new RegExp(re).test(await api.texto())) return true;
        if (tocar) await api.clic(tocar, 2).catch(() => {});
        await esperar(tocar ? 90 : 300);
      }
      return false;
    },
    cerrar() {
      ws.close();
      cerrarArbol(hijo);
    },
    stderr: () => stderr,
  };
  return api;
}

/** Mide un boton del paso: si el contenedor con scroll tiene algo de mas y si "Siguiente" lo tapa. */
const medir = (etiquetaBoton) => `(() => {
  const b = [...document.querySelectorAll('[aria-label]')].find((x) => /${etiquetaBoton}/.test(x.getAttribute('aria-label')));
  const sig = [...document.querySelectorAll('[role="button"]')].find((x) => (x.innerText || '').trim().startsWith('Siguiente'));
  if (!b || !sig) return null;
  let sc = null;
  for (let e = b; e && !sc; e = e.parentElement) {
    if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) sc = e;
  }
  const r = b.getBoundingClientRect();
  return { botonAbajo: Math.round(r.bottom), siguienteArriba: Math.round(sig.getBoundingClientRect().top), scrollDeMas: sc ? sc.scrollHeight - sc.clientHeight : 0 };
})()`;

/** Recorre el juego hasta el lupulo en un tamano de ventana y devuelve las medidas. */
async function recorrer(chrome, perfil, url, tamano) {
  const c = await abrirChrome(chrome, perfil, url, tamano);
  try {
    await c.navegar();
    await c.clic('Maestro Cervecero', 80);
    await c.clic('Pálida');
    await c.clic('Siguiente');
    await c.clic('Seguir');

    // Maceracion: se calienta hasta que el juego dice que acabo.
    await esperar(600);
    const maceracionEmpezada = await c.hasta('Maceración terminada', { tocar: 'Calentar' });
    if (!maceracionEmpezada) throw new Error('la maceracion no termino (¿el boton Calentar esta tapado?)');
    const maceracion = await c.ev(medir('^Calentar$'));
    await c.clic('Siguiente');
    await c.clic('Seguir');

    await esperar(1200);
    const lupulo = await c.ev(medir('Empezar el hervido|Echar lúpulo'));
    await c.clic('Empezar el hervido');
    await esperar(900);
    // Se toca cuando el juego lo acepta (su reloj va mas lento que el real en headless).
    const echada = await c.hasta('Amargor: \\d+ %', { tocar: 'Echar lúpulo', limite: 30000 });
    await esperar(1800); // lo que tarda en caer
    // La bolsa en la olla: su etiqueta de papel esta dentro de la olla (cerca de ella), no en la fila de arriba.
    const bolsasEnOlla = await c.ev(`(() => {
      const fila = [...document.querySelectorAll('body *')].find((x) => /^Amargor$/.test((x.innerText || '').trim()) && x.children.length === 0);
      const barraY = fila ? fila.getBoundingClientRect().top : 0;
      const boton = [...document.querySelectorAll('[aria-label]')].find((x) => /Echar lúpulo/.test(x.getAttribute('aria-label')));
      return { barraY: Math.round(barraY), botonY: Math.round(boton.getBoundingClientRect().top) };
    })()`);
    return { maceracion, lupulo, echada, bolsasEnOlla, stderr: c.stderr() };
  } finally {
    c.cerrar();
    // taskkill vuelve antes de que los procesos hijos suelten el perfil.
    await esperar(1500);
  }
}

async function main() {
  const chrome = buscarChrome();
  if (!chrome) {
    console.error('No se encuentra Chrome. Indica la ruta con la variable CHROME.');
    process.exit(2);
  }
  if (existsSync(PANTALLA)) {
    console.error(`Ya existe ${PANTALLA}: quedo de una ejecucion anterior. Borrala y repite.`);
    process.exit(2);
  }

  const salida = mkdtempSync(join(tmpdir(), 'rb-verificar-juego-'));
  try {
    writeFileSync(PANTALLA, CODIGO_PANTALLA);
    console.log('Exportando la web (1 min aprox)...');
    const entorno = { ...process.env };
    delete entorno.WEB_BASE_URL;
    const exportacion = spawnSync(`npx expo export --platform web --output-dir "${salida}"`, {
      cwd: raiz,
      env: entorno,
      shell: true,
      encoding: 'utf8',
    });
    if (exportacion.status !== 0) {
      console.error((exportacion.stdout ?? '') + (exportacion.stderr ?? ''));
      throw new Error('fallo el export web');
    }
  } finally {
    rmSync(PANTALLA, { force: true });
  }

  const servidor = await servir(salida);
  const { port } = servidor.address();
  let fallos = 0;
  try {
    // `npm run verificar:juego -- 740` repite solo ese alto (para comprobar un arreglo sin esperar los tres).
    const solo = process.argv[2] ? Number(process.argv[2]) : null;
    for (const tamano of TAMANOS.filter((t) => solo === null || t.alto === solo)) {
      const perfil = mkdtempSync(join(tmpdir(), 'rb-chrome-'));
      console.log(`\n${tamano.nombre} (${tamano.ancho}x${tamano.alto}): recorriendo el juego (~1 min)...`);
      let r;
      try {
        r = await recorrer(chrome, perfil, `http://127.0.0.1:${port}/verificar-juego`, tamano);
      } catch (e) {
        console.log(`FALLA  no se pudo recorrer el juego: ${e.message}`);
        fallos += 1;
        continue;
      }
      const comprobaciones = [
        ['maceracion: sin scroll', r.maceracion && r.maceracion.scrollDeMas === 0],
        ['maceracion: el boton Calentar no queda tapado por Siguiente', r.maceracion && r.maceracion.botonAbajo <= r.maceracion.siguienteArriba],
        ['lupulo: sin scroll', r.lupulo && r.lupulo.scrollDeMas === 0],
        ['lupulo: el boton no queda tapado por Siguiente', r.lupulo && r.lupulo.botonAbajo <= r.lupulo.siguienteArriba],
        // Entre la barra (su etiqueta "Amargor") y el boton cabe la olla entera, que mide al menos ~80 px.
        ['lupulo: el boton esta debajo de la olla', r.bolsasEnOlla && r.bolsasEnOlla.botonY > r.bolsasEnOlla.barraY + 80],
        ['lupulo: un toque a tiempo echa la bolsita', r.echada],
      ];
      console.log(JSON.stringify({ maceracion: r.maceracion, lupulo: r.lupulo }));
      for (const [nombre, ok] of comprobaciones) {
        console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
        if (!ok) fallos += 1;
      }
    }
  } finally {
    servidor.close();
    rmSync(salida, { recursive: true, force: true });
  }

  console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} comprobacion(es) fallaron.`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((error) => {
  rmSync(PANTALLA, { force: true });
  console.error(error);
  process.exit(1);
});
