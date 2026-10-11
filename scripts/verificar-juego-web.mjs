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
 *   3. en el lupulo, un toque a tiempo echa la bolsita y la olla acaba con ella dentro;
 *   4. en la siembra se mantiene el grifo, avisa de soltar (inercia), se siembra
 *      y la tarjeta final ensena la fermentacion;
 *   5. La Cana Perfecta con tactil y acelerometro emulados: el sensor inclina el
 *      vaso hacia el lado en que se inclina el movil y de forma fluida, se sirve con un dedo mientras otro mueve el deslizador, salirse del
 *      boton no suelta y levantar el dedo si (ver `recorrerCana`). Y el chorro acaba
 *      DENTRO de la jarra, inclinada y recta (antes, inclinada, la atravesaba);
 *   6. Ocupado en horizontal, con un juego de mentira (ver `recorrerOcupado`): la
 *      capa tapa la ventana, solo cuenta el aviso de SU iframe, sale el resultado
 *      (tambien saliendo con la X tras ganar) y salir quita el iframe.
 *
 * `SOLO_CANA=1` se salta Maestro Cervecero; `SOLO_OCUPADO=1`, Maestro y La Cana. `CAPTURAS=<carpeta>` guarda capturas de
 * La Cana (inclinada, recta y derramando) para revisar el dibujo a ojo.
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

function servir(carpeta, puerto = 0) {
  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = normalize(join(carpeta, decodeURIComponent(new URL(peticion.url, 'http://x').pathname)));
    const fichero = ruta.startsWith(carpeta) && existsSync(ruta) && statSync(ruta).isFile() ? ruta : join(carpeta, 'index.html');
    respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(fichero)] ?? 'application/octet-stream' });
    respuesta.end(readFileSync(fichero));
  });
  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(puerto, '127.0.0.1', () => resolver(servidor));
  });
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
      // Los ultimos juegos del menu quedan debajo del pliegue en un movil bajo. 'nearest' no
      // mueve nada si ya se ve, asi que no cambia las medidas de los otros recorridos.
      e.scrollIntoView({ block: 'nearest' });
      const c = e.getBoundingClientRect();
      return c.width && c.height ? [c.left + c.width / 2, c.top + c.height / 2] : null;
    })()`);

  const api = {
    ev,
    async navegar({ movil = false } = {}) {
      await cdp('Page.enable');
      await cdp('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: movil });
      if (movil) {
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        // El acelerometro, como el panel "Sensors" de DevTools.
        for (const type of ['accelerometer', 'linear-acceleration', 'gravity', 'gyroscope']) {
          await cdp('Emulation.setSensorOverrideEnabled', { enabled: true, type });
        }
        await api.inclinarMovil(0);
      }
      await cdp('Page.navigate', { url });
    },
    /**
     * El movil girado `grados` de lado (como un volante), en vertical: positivo = a la DERECHA.
     * Con las lecturas de Android (en vertical y = +g y a la derecha x es NEGATIVA); iOS las da
     * las dos al reves, y la formula del juego da lo mismo (ver `inclinacionConSigno`).
     */
    async inclinarMovil(grados) {
      const rad = (grados * Math.PI) / 180;
      const xyz = { x: -9.81 * Math.sin(rad), y: 9.81 * Math.cos(rad), z: 0 };
      await cdp('Emulation.setSensorOverrideReadings', { type: 'accelerometer', reading: { xyz } });
      await cdp('Emulation.setSensorOverrideReadings', { type: 'gravity', reading: { xyz } });
      await cdp('Emulation.setSensorOverrideReadings', { type: 'linear-acceleration', reading: { xyz: { x: 0, y: 0, z: 0 } } });
      await cdp('Emulation.setSensorOverrideReadings', { type: 'gyroscope', reading: { xyz: { x: 0, y: 0, z: 0 } } });
    },
    /** Rectangulo de lo que lleva ese aria-label (o texto): [izq, arriba, ancho, alto]. */
    rect: (txt) =>
      ev(`(() => {
        const q = ${JSON.stringify(txt)};
        const e = [...document.querySelectorAll('[aria-label], [role="button"]')].find((x) => (x.getAttribute('aria-label') || x.innerText || '').includes(q));
        if (!e) return null;
        const c = e.getBoundingClientRect();
        return [c.left, c.top, c.width, c.height];
      })()`),
    /** Toques con varios dedos a la vez: `puntos` = [{ x, y, id }]. Vacio = levantar todos. */
    async dedos(tipo, puntos) {
      await cdp('Input.dispatchTouchEvent', { type: tipo, touchPoints: puntos });
    },
    /** El giro con el que se dibuja el vaso (grados), o null. */
    giroVaso: () =>
      ev(`(() => {
        const v = document.querySelector('[data-testid="vaso-cana"]');
        return v && /rotate\\(/.test(v.style.transform) ? parseFloat(v.style.transform.replace('rotate(', '')) : null;
      })()`),
    /**
     * ¿El chorro acaba DENTRO de la jarra? Mira que hay justo encima de su punta: si es el
     * interior de la jarra (o algo suyo), choca dentro; si no, el chorro la atraviesa.
     * Null si no hay chorro.
     */
    chorroDentro: () =>
      ev(`(() => {
        const ch = document.querySelector('[data-testid="chorro-cana"]');
        const dentro = document.querySelector('[data-testid="vaso-cana-interior"]');
        if (!ch || !dentro) return null;
        const c = ch.getBoundingClientRect();
        // La escena es pointerEvents="none" y elementsFromPoint se salta lo que no se puede tocar:
        // se hace tocable solo el interior, un instante. Respeta su giro y su recorte.
        const antes = dentro.style.getPropertyValue('pointer-events');
        dentro.style.setProperty('pointer-events', 'auto', 'important');
        const ok = document.elementsFromPoint(c.left + c.width / 2, c.bottom - 3).includes(dentro);
        dentro.style.setProperty('pointer-events', antes);
        return ok;
      })()`),
    /** Captura PNG de la pantalla en `ruta` (para revisar el dibujo a ojo). */
    async captura(ruta) {
      const r = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(ruta, Buffer.from(r.result.data, 'base64'));
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
    /** Aprieta y NO suelta (para el grifo de la siembra). Devuelve la funcion que suelta. */
    async mantener(txt) {
      const p = await centro(txt);
      if (!p) throw new Error(`no encuentro "${txt}" en la pantalla`);
      const [x, y] = p;
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      return () => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    },
    /** Lo que marca el termometro ("57 °C" junto al carril), o null. */
    temperatura: () =>
      ev(`(() => {
        const t = [...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && /^\\d+ °C$/.test((x.innerText || '').trim()));
        return t ? Number(t.innerText.trim().split(' ')[0]) : null;
      })()`),
    texto: () => ev('document.body.innerText'),
    /** Espera a que el texto de la pagina case. Con `tocar`, mientras espera va pulsando ese boton. */
    async hasta(re, { tocar, limite = 90000 } = {}) {
      const ini = Date.now();
      while (Date.now() - ini < limite) {
        // Sin distinguir mayusculas: un `textTransform: uppercase` cambia lo que devuelve innerText.
        if (new RegExp(re, 'i').test(await api.texto())) return true;
        if (tocar) await api.clic(tocar, 2).catch(() => {});
        await esperar(tocar ? 90 : 300);
      }
      return false;
    },
    /** Con `FOTOS=<carpeta>` guarda una captura con ese nombre; sin ella, no hace nada. */
    async foto(nombre) {
      if (!process.env.FOTOS) return;
      const { result } = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(process.env.FOTOS, `${alto}-${nombre}.png`), Buffer.from(result.data, 'base64'));
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
  const sig = [...document.querySelectorAll('[role="button"]')].find((x) => /^(Siguiente|Ver mi cerveza)/.test((x.innerText || '').trim()));
  if (!b || !sig) return null;
  let sc = null;
  for (let e = b; e && !sc; e = e.parentElement) {
    if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) sc = e;
  }
  const r = b.getBoundingClientRect();
  return { botonAbajo: Math.round(r.bottom), siguienteArriba: Math.round(sig.getBoundingClientRect().top), scrollDeMas: sc ? sc.scrollHeight - sc.clientHeight : 0 };
})()`;

/** Recorre el juego entero en un tamano de ventana y devuelve las medidas. */
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

    // Paso 4: enfriar y sembrar.
    await c.hasta('Hervido terminado', { limite: 40000 });
    await c.clic('Siguiente');
    await c.clic('Seguir');
    await esperar(1200);
    await c.clic('Ale');
    await esperar(400);
    const siembra = await c.ev(medir('^Enfriar$'));
    const soltar = await c.mantener('Enfriar');
    // Se suelta cuando el juego avisa de que la inercia ya llega (la pista que lo ensena).
    const pista = await c.hasta('¡Suelta!', { limite: 40000 });
    await c.foto('siembra-enfriando');
    await soltar();
    // Y se echa cuando el termometro entra en la ventana de la ale (o ya se paso).
    const ini = Date.now();
    while (Date.now() - ini < 30000) {
      const t = await c.temperatura();
      if (t !== null && t <= 22) break;
      await esperar(120);
    }
    const tempAlEchar = await c.temperatura();
    await c.clic('Echar levadura');
    const sembradaFoto = c.foto('siembra-echada');
    const sembrada = await c.hasta('· \\d+ %', { limite: 5000 });
    const resultadoSiembra = (await c.texto()).split('\n').find((l) => /· \d+ %/.test(l)) ?? '';
    // "Ver mi cerveza" lleva primero al dato curioso; "Seguir", a la tarjeta.
    await c.clic('Ver mi cerveza');
    await c.clic('Seguir');
    const tarjeta = await c.hasta('Fermentación', { limite: 8000 });
    await sembradaFoto;
    await c.foto('tarjeta');
    return { maceracion, lupulo, echada, bolsasEnOlla, siembra, pista, tempAlEchar, sembrada, resultadoSiembra, tarjeta, stderr: c.stderr() };
  } finally {
    c.cerrar();
    // taskkill vuelve antes de que los procesos hijos suelten el perfil.
    await esperar(1500);
  }
}

/**
 * La Cana Perfecta en un movil emulado (tactil y acelerometro):
 *  - inclinar el movil a 30 grados inclina el vaso 30 grados (sensor web);
 *  - con el deslizador, un dedo mantiene "servir" y OTRO mueve el deslizador a
 *    la vez: sigue sirviendo y el vaso se inclina (con Pressable, no se podia);
 *  - el dedo que se sale del boton sin levantarse sigue sirviendo;
 *  - levantar el dedo deja de servir.
 */
async function recorrerCana(chrome, perfil, url, tamano) {
  const c = await abrirChrome(chrome, perfil, url, tamano);
  try {
    await c.navegar({ movil: true });
    await c.clic('La Caña Perfecta', 80);
    await c.clic('Empezar');
    await esperar(800);
    await c.inclinarMovil(30);
    await esperar(1200);
    const giroCon30 = await c.giroVaso();
    const enSensor = /Usar deslizador/.test(await c.texto());

    // El chorro cae en vertical y la jarra esta inclinada: tiene que chocar dentro (con la
    // jarra vacia a 30 grados, contra la pared baja), no atravesarla. Y recto, en la cerveza.
    const capturas = process.env.CAPTURAS;
    const servirUnRato = async (ms, nombre) => {
      const s = await c.rect('servir');
      const dedo = { x: s[0] + s[2] / 2, y: s[1] + s[3] / 2, id: 1 };
      await c.dedos('touchStart', [dedo]);
      await esperar(ms);
      const dentro = await c.chorroDentro();
      if (capturas) await c.captura(join(capturas, `cana-${tamano.alto}-${nombre}.png`));
      await c.dedos('touchEnd', []);
      await esperar(300);
      return dentro;
    };
    const chorroDentroInclinado = await servirUnRato(400, 'inclinada');
    await c.inclinarMovil(0);
    await esperar(1500);
    const chorroDentroRecto = await servirUnRato(900, 'recta');
    await c.inclinarMovil(30);
    await esperar(1200);

    // A la IZQUIERDA el vaso gira a la izquierda (signo negativo), y de forma fluida: un escalon de
    // 0 a 30 grados se reparte en fotogramas. Se graba desde dentro de la pagina (con CDP iria a saltos).
    await c.inclinarMovil(0);
    await esperar(1500);
    await c.ev(`window.__g = []; window.__grabando = true; (function f() {
      const v = document.querySelector('[data-testid="vaso-cana"]');
      window.__g.push(v ? parseFloat(v.style.transform.replace('rotate(', '')) : 0);
      if (window.__grabando) requestAnimationFrame(f);
    })(); true`);
    await esperar(200);
    await c.inclinarMovil(-30);
    await esperar(1200);
    await c.ev('window.__grabando = false; true');
    const serie = await c.ev('window.__g');
    const giroIzquierda = serie.at(-1);
    const saltos = serie.slice(1).map((v, i) => Math.abs(v - serie[i]));
    const mayorSalto = Math.max(...saltos);
    const intermedios = serie.filter((v) => v < -3 && v > -27).length;
    await c.inclinarMovil(30);
    await esperar(1200);

    await c.clic('Usar deslizador');
    await esperar(600);
    const b = await c.rect('servir');
    const d = await c.rect('Inclinación del vaso');
    const dedo1 = { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2, id: 1 };
    await c.dedos('touchStart', [dedo1]);
    await esperar(500);
    const sirveConUnDedo = /Sirviendo/.test(await c.texto());
    // Segundo dedo: arrastra el deslizador mientras el primero sigue sirviendo.
    const dedo2 = { x: d[0] + 30, y: d[1] + d[3] / 2, id: 2 };
    await c.dedos('touchStart', [dedo1, dedo2]);
    for (let i = 1; i <= 8; i++) {
      await c.dedos('touchMove', [dedo1, { ...dedo2, x: dedo2.x + i * 20 }]);
      await esperar(50);
    }
    await esperar(300);
    const textoDosDedos = await c.texto();
    const sirveConDosDedos = /Sirviendo/.test(textoDosDedos);
    const inclinacionManual = Number((/Inclinación: (\d+)°/.exec(textoDosDedos) ?? [])[1] ?? 0);
    // El primer dedo se va 150 px hacia arriba, fuera del boton, sin levantarse. (El segundo
    // sigue puesto: en el protocolo de DevTools, `touchEnd` levanta TODOS los dedos a la vez.)
    await c.dedos('touchMove', [{ ...dedo1, y: dedo1.y - 150 }, { ...dedo2, x: dedo2.x + 160 }]);
    await esperar(400);
    const sirveFuera = /Sirviendo/.test(await c.texto());
    await c.dedos('touchEnd', []);
    await esperar(400);
    // Tras mantener mas de un segundo: el `click` que manda el navegador al levantar no puede reabrir.
    const paraAlLevantar = !/Sirviendo/.test(await c.texto());
    // Lector de pantalla: su doble toque es un `click` sin dedo detras. Alterna: abre y cierra.
    await esperar(900);
    const clicLector = `[...document.querySelectorAll('[aria-label]')].find((x) => /servir/.test(x.getAttribute('aria-label'))).click()`;
    await c.ev(clicLector);
    await esperar(300);
    const lectorAbre = /Sirviendo/.test(await c.texto());
    await c.ev(clicLector);
    await esperar(300);
    const lectorCierra = !/Sirviendo/.test(await c.texto());
    // Solo para revisar el dibujo: llenar hasta que se derrame (el goteo por el borde y el charco).
    if (capturas) {
      const s = await c.rect('servir');
      await c.dedos('touchStart', [{ x: s[0] + s[2] / 2, y: s[1] + s[3] / 2, id: 1 }]);
      for (let i = 0; i < 60 && !/derramando/.test(await c.texto()); i++) await esperar(200);
      await esperar(300);
      await c.captura(join(capturas, `cana-${tamano.alto}-derrame.png`));
      await c.dedos('touchEnd', []);
    }
    return { chorroDentroInclinado, chorroDentroRecto, giroCon30, giroIzquierda, mayorSalto, intermedios, enSensor, sirveConUnDedo, sirveConDosDedos, inclinacionManual, sirveFuera, paraAlLevantar, lectorAbre, lectorCierra };
  } finally {
    c.cerrar();
    await esperar(1500);
  }
}

/**
 * Un "Ocupado" de mentira: la app lo carga en el iframe en vez del juego de Godot (40 MB
 * y depende de GitHub Pages). Avisa de que se gano como el juego real
 * (scripts/core/app_bridge.gd en weleloable/ocupado): 4,5 °C -> 90 puntos. Se sirve en
 * el MISMO origen que la app, como publicado (los dos en weleloable.github.io): ahi el
 * origen no distingue al juego de la propia app, y lo que tiene que frenar un aviso
 * falso es que la app mire que lo mande SU iframe.
 */
// Un fichero y no una carpeta: `servir` no busca index.html dentro, cae al de la app.
const RUTA_OCUPADO_FALSO = 'ocupado-de-prueba.html';
const JUEGO_OCUPADO_FALSO = `<!doctype html><meta charset="utf-8"><title>Ocupado (prueba)</title>
<body style="margin:0;background:#1d2a33;color:#fff;font:16px sans-serif">Juego de prueba
<script>setTimeout(() => parent.postMessage({ tipo: 'ocupado:fin', version: 1, final: 'door', segundos: 95, temperatura: 4.5, pistas: 1 }, '*'), 800);</script>`;

/**
 * Ocupado en un movil en horizontal (el juego se juega asi):
 *  - abrir la ficha NO monta el iframe (no se descarga el juego hasta pulsar Jugar);
 *  - al pulsar Jugar, la capa tapa la ventana entera y queda por encima de todo;
 *  - un aviso de la propia app (mismo origen, no su iframe) no da record;
 *  - el aviso del juego saca "Ver resultado" y la tarjeta ensena puntos y detalle;
 *  - ganar y salir con la X tambien entrega el resultado (antes se perdia, o su
 *    temporizador cortaba la partida siguiente);
 *  - salir sin ganar cierra la capa y quita el iframe.
 */
async function recorrerOcupado(chrome, perfil, url, tamano) {
  // En horizontal: el ancho del alto y al reves.
  const c = await abrirChrome(chrome, perfil, url, { ancho: tamano.alto, alto: tamano.ancho });
  const abrirYJugar = async () => {
    await c.clic('Jugar a Ocupado', 80);
    await esperar(800);
    const iframes = await c.ev('document.querySelectorAll("iframe").length');
    await c.clic('Jugar');
    await esperar(300);
    return iframes;
  };
  try {
    await c.navegar({ movil: true });
    const iframeAntes = await abrirYJugar();
    // La propia app haciendose pasar por el juego, ya con el iframe puesto: 2 °C = 100 puntos.
    await c.ev(`window.postMessage({ tipo: 'ocupado:fin', version: 1, final: 'door', segundos: 1, temperatura: 2, pistas: 0 }, '*'); true`);
    const capa = await c.ev(`(() => {
      const f = document.querySelector('iframe');
      if (!f) return null;
      const r = f.getBoundingClientRect();
      return { ancho: Math.round(r.width), alto: Math.round(r.height), ventana: [innerWidth, innerHeight],
        encima: document.elementFromPoint(innerWidth / 2, innerHeight - 4) === f };
    })()`);
    const boton = await c.hasta('Ver resultado · ', { limite: 20000 });
    if (!boton) {
      throw new Error(`no llego el aviso del juego: ${JSON.stringify(await c.ev(`({ src: document.querySelector('iframe')?.src, texto: document.body.innerText.slice(0, 200) })`))}`);
    }
    const textoBoton = ((await c.texto()).match(/Ver resultado · \d+ puntos/) ?? [''])[0];
    await c.foto('ocupado-ganado');
    await c.clic('Ver resultado');
    const tarjeta = await c.hasta('Cerveza a 4,5 °C · 1:35 · 1 pista', { limite: 8000 });
    const iframeDespues = await c.ev('document.querySelectorAll("iframe").length');
    await c.foto('ocupado-tarjeta');

    // Ganar y salir con la X sin pulsar "Ver resultado": el resultado llega igual.
    await c.clic('Volver');
    await abrirYJugar();
    await c.hasta('Ver resultado · ', { limite: 20000 });
    await c.clic('Salir del juego');
    const tarjetaAlSalir = await c.hasta('Cerveza a 4,5 °C', { limite: 4000 });
    const iframeTrasSalirGanado = await c.ev('document.querySelectorAll("iframe").length');

    // Salir sin ganar (el juego avisa a los 800 ms de cargar): cierra la capa y quita el iframe.
    await c.clic('Volver');
    await abrirYJugar();
    const conIframe = await c.ev('document.querySelectorAll("iframe").length');
    await c.clic('Salir del juego');
    await esperar(1500);
    // La capa se oculta (display: none), no se desmonta: su boton de salir deja de pintarse
    // y lo que hay en el centro de la pantalla vuelve a ser la app. Y un aviso tardio no cuenta.
    const salida = await c.ev(`(() => {
      const x = document.querySelector('[aria-label="Salir del juego"]');
      const capa = x && x.parentElement;
      const centro = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return { iframes: document.querySelectorAll('iframe').length, resultado: /Cerveza a/.test(document.body.innerText),
        capaOculta: !!capa && x.getClientRects().length === 0 && !capa.contains(centro) };
    })()`);
    return { iframeAntes, capa, textoBoton, tarjeta, iframeDespues, tarjetaAlSalir, iframeTrasSalirGanado, conIframe, salida };
  } finally {
    c.cerrar();
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
  // Se sirve ANTES de exportar (lee cada fichero al pedirlo) porque la URL del juego
  // de mentira lleva su puerto y se incrusta al exportar.
  const servidor = await servir(salida);
  const { port } = servidor.address();
  try {
    writeFileSync(PANTALLA, CODIGO_PANTALLA);
    console.log('Exportando la web (1 min aprox)...');
    const entorno = { ...process.env };
    delete entorno.WEB_BASE_URL;
    // La URL del juego se fija al exportar (EXPO_PUBLIC_*): apunta al Ocupado de mentira.
    entorno.EXPO_PUBLIC_OCUPADO_URL = `http://127.0.0.1:${port}/${RUTA_OCUPADO_FALSO}`;
    // --clear: la cache de Metro guarda cada fichero transformado por su CONTENIDO, no por
    // el valor de los EXPO_PUBLIC_* que lleva incrustados. Sin borrarla, Ocupado.web.tsx
    // salia con la URL de un export anterior y el iframe apuntaba a un puerto muerto (paso).
    const exportacion = spawnSync(`npx expo export --platform web --clear --output-dir "${salida}"`, {
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
  // Despues del export, que vacia la carpeta de salida.
  writeFileSync(join(salida, RUTA_OCUPADO_FALSO), JUEGO_OCUPADO_FALSO);

  let fallos = 0;
  try {
    // `npm run verificar:juego -- 740` repite solo ese alto (para comprobar un arreglo sin esperar los tres).
    const solo = process.argv[2] ? Number(process.argv[2]) : null;
    for (const tamano of TAMANOS.filter((t) => solo === null || t.alto === solo)) {
      const perfil = mkdtempSync(join(tmpdir(), 'rb-chrome-'));
      console.log(`\n${tamano.nombre} (${tamano.ancho}x${tamano.alto}): recorriendo el juego (~1 min)...`);
      let r;
      // SOLO_CANA=1 se salta Maestro Cervecero (para iterar sobre La Cana sin esperar el otro juego).
      if (process.env.SOLO_CANA || process.env.SOLO_OCUPADO) console.log('SOLO_CANA / SOLO_OCUPADO: Maestro Cervecero no se recorre');
      else try {
        r = await recorrer(chrome, perfil, `http://127.0.0.1:${port}/verificar-juego`, tamano);
      } catch (e) {
        console.log(`FALLA  no se pudo recorrer el juego: ${e.message}`);
        fallos += 1;
        continue;
      }
      const comprobaciones = !r ? [] : [
        ['maceracion: sin scroll', r.maceracion && r.maceracion.scrollDeMas === 0],
        ['maceracion: el boton Calentar no queda tapado por Siguiente', r.maceracion && r.maceracion.botonAbajo <= r.maceracion.siguienteArriba],
        ['lupulo: sin scroll', r.lupulo && r.lupulo.scrollDeMas === 0],
        ['lupulo: el boton no queda tapado por Siguiente', r.lupulo && r.lupulo.botonAbajo <= r.lupulo.siguienteArriba],
        // Entre la barra (su etiqueta "Amargor") y el boton cabe la olla entera, que mide al menos ~80 px.
        ['lupulo: el boton esta debajo de la olla', r.bolsasEnOlla && r.bolsasEnOlla.botonY > r.bolsasEnOlla.barraY + 80],
        ['lupulo: un toque a tiempo echa la bolsita', r.echada],
        ['siembra: sin scroll', r.siembra && r.siembra.scrollDeMas === 0],
        ['siembra: los botones no quedan tapados por Siguiente', r.siembra && r.siembra.botonAbajo <= r.siembra.siguienteArriba],
        ['siembra: al mantener el grifo, avisa de soltar antes de llegar (inercia)', r.pista],
        ['siembra: se siembra y dice como le fue a la levadura', r.sembrada],
        ['resultado: la tarjeta ensena la fermentacion', r.tarjeta],
      ];
      if (r) {
        console.log(JSON.stringify({ maceracion: r.maceracion, lupulo: r.lupulo, siembra: r.siembra }));
        console.log(`siembra: echada a ${r.tempAlEchar} °C -> "${r.resultadoSiembra}"`);
      }
      for (const [nombre, ok] of comprobaciones) {
        console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
        if (!ok) fallos += 1;
      }

      if (!process.env.SOLO_OCUPADO) {
      console.log(`${tamano.nombre}: La Caña Perfecta con tactil y sensor emulados...`);
      let k;
      try {
        k = await recorrerCana(chrome, mkdtempSync(join(tmpdir(), 'rb-chrome-')), `http://127.0.0.1:${port}/verificar-juego`, tamano);
      } catch (e) {
        console.log(`FALLA  no se pudo jugar a la cana: ${e.message}`);
        fallos += 1;
        continue;
      }
      console.log(JSON.stringify(k));
      for (const [nombre, ok] of [
        ['cana: el movil a 30 grados a la derecha inclina el vaso ~30 grados a la derecha (sensor web)', k.enSensor && Math.abs((k.giroCon30 ?? -99) - 30) < 2],
        ['cana: a la IZQUIERDA el vaso gira a la izquierda (no siempre al mismo lado)', Math.abs((k.giroIzquierda ?? 99) + 30) < 2],
        ['cana: el giro es fluido (un escalon de 30 grados no salta de golpe)', k.mayorSalto < 8 && k.intermedios >= 8],
        ['cana: inclinada, el chorro choca dentro de la jarra (no la atraviesa)', k.chorroDentroInclinado === true],
        ['cana: recta, el chorro acaba dentro de la jarra', k.chorroDentroRecto === true],
        ['cana: mantener "servir" sirve', k.sirveConUnDedo],
        ['cana: con otro dedo en el deslizador sigue sirviendo', k.sirveConDosDedos],
        ['cana: ... y el deslizador si se mueve a la vez', k.inclinacionManual > 0],
        ['cana: el dedo que se sale del boton sin levantarse sigue sirviendo', k.sirveFuera],
        ['cana: levantar el dedo deja de servir (y el clic de despues no reabre)', k.paraAlLevantar],
        ['cana: con lector de pantalla, un toque abre el grifo...', k.lectorAbre],
        ['cana: ... y otro lo cierra', k.lectorCierra],
      ]) {
        console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
        if (!ok) fallos += 1;
      }
      }

      console.log(`${tamano.nombre}: Ocupado en horizontal...`);
      let o;
      try {
        o = await recorrerOcupado(chrome, mkdtempSync(join(tmpdir(), 'rb-chrome-')), `http://127.0.0.1:${port}/verificar-juego`, tamano);
      } catch (e) {
        console.log(`FALLA  no se pudo jugar a Ocupado: ${e.message}`);
        fallos += 1;
        continue;
      }
      console.log(JSON.stringify(o));
      for (const [nombre, ok] of [
        ['ocupado: abrir la ficha no monta el iframe (no descarga el juego)', o.iframeAntes === 0],
        ['ocupado: la capa del juego tapa la ventana entera y queda encima de todo', o.capa && o.capa.ancho === o.capa.ventana[0] && o.capa.alto === o.capa.ventana[1] && o.capa.encima],
        ['ocupado: un aviso de la propia app (mismo origen, no su iframe) no cuenta', o.textoBoton === 'Ver resultado · 90 puntos'],
        ['ocupado: la tarjeta ensena la cerveza, el tiempo y las pistas', o.tarjeta],
        ['ocupado: tras el resultado el iframe se desmonta', o.iframeDespues === 0],
        ['ocupado: ganar y salir con la X entrega el resultado igual', o.tarjetaAlSalir && o.iframeTrasSalirGanado === 0],
        ['ocupado: salir sin ganar cierra la capa, quita el iframe y no da resultado', o.conIframe === 1 && o.salida.iframes === 0 && o.salida.capaOculta && !o.salida.resultado],
      ]) {
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
