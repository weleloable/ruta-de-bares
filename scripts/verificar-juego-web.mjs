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
 *   6. ¿Quien quiere ser cervecero? cabe sin scroll con la pregunta, al elegir
 *      y al revelar, con los textos MAS LARGOS del banco (ver `recorrerQuiz`);
 *   7. Tapon al Vuelo con tactil emulado, con el movil en horizontal y en
 *      vertical (juego tumbado): sin scroll, un toque no gasta el tiro y un
 *      arrastre de verdad lanza la chapa (ver `recorrerTapon`);
 *   8. Parejas de Barra: una partida ENTERA con el tactil emulado, en las tres
 *      alturas y a 360 px de ancho. Las 16 cartas dentro de la pantalla, sin
 *      scroll y sin nada encima; y el tiempo con el que se para el reloj es el
 *      que sale en la tarjeta de fin, que es el que se envia (ver `recorrerParejas`).
 *
 *   9. La Penul: quien la ve (una persona normal con el interruptor apagado NO;
 *      encendido, si y la PRIMERA; un admin siempre, la primera y con "Solo
 *      admins" si esta apagado) y una partida hasta un final bueno en las tres
 *      alturas, sin scroll ni botones fuera o tapados en ninguna pantalla (ver
 *      `recorrerPenul`).
 *
 * `SOLO_CANA=1` se salta Maestro Cervecero; `SOLO_QUIZ=1` deja solo el quiz;
 * `SOLO_TAPON=1`, solo Tapon al Vuelo; `SOLO_PAREJAS=1`, solo Parejas de Barra;
 * `SOLO_PENUL=1`, solo La Penul. `CAPTURAS=<carpeta>` guarda capturas de
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

/** Que juegos se recorren (ver SOLO_* en la cabecera). */
const { SOLO_CANA, SOLO_QUIZ, SOLO_TAPON, SOLO_PAREJAS, SOLO_PENUL } = process.env;
const HACER = {
  maestro: !(SOLO_CANA || SOLO_QUIZ || SOLO_TAPON || SOLO_PAREJAS || SOLO_PENUL),
  cana: !(SOLO_QUIZ || SOLO_TAPON || SOLO_PAREJAS || SOLO_PENUL),
  tapon: !(SOLO_QUIZ || SOLO_PAREJAS || SOLO_PENUL),
  quiz: !(SOLO_TAPON || SOLO_PAREJAS || SOLO_PENUL),
  parejas: !(SOLO_QUIZ || SOLO_TAPON || SOLO_PENUL),
  penul: !(SOLO_QUIZ || SOLO_TAPON || SOLO_PAREJAS),
};

/** Alturas de ventana (con barra y pestanas incluidas) y ancho de movil a probar. */
const TAMANOS = [
  { ancho: 390, alto: 740, nombre: 'movil bajo' },
  { ancho: 400, alto: 808, nombre: 'movil normal' },
  { ancho: 412, alto: 915, nombre: 'movil alto' },
];
/** Parejas se prueba ademas en el movil mas estrecho que se espera (360 de ancho). */
const TAMANOS_PAREJAS = [...TAMANOS, { ancho: 360, alto: 740, nombre: 'movil estrecho' }];

const CODIGO_PANTALLA = `// GENERADO por scripts/verificar-juego-web.mjs. Se borra solo. No commitear.
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { MenuMinijuegos } from '../../src/features/minijuegos/MenuMinijuegos';
import { Partida } from '../../src/features/quiz/QuienQuiereSerCervecero';
import { BANCO } from '../../src/features/quiz/banco';
import { nuevaPartida } from '../../src/features/quiz/partida';
import type { BancoPreguntas, Pregunta } from '../../src/features/quiz/tipos';

/** Una pregunta con los textos MAS LARGOS del banco: el peor caso para que quepa. */
function bancoPeor(): BancoPreguntas {
  const ps = BANCO.preguntas;
  const larga = (f: (p: Pregunta) => string) => ps.map(f).reduce((a, b) => (b.length > a.length ? b : a));
  const opciones = ps.flatMap((p) => [p.correcta, ...p.incorrectas]).sort((a, b) => b.length - a.length);
  const peor: Pregunta = {
    id: 'peor',
    nivel: 1,
    categoria: 'prueba',
    pregunta: larga((p) => p.pregunta),
    correcta: opciones[0],
    incorrectas: [opciones[1], opciones[2], opciones[3]],
    explicacion: larga((p) => p.explicacion),
  };
  return { ...BANCO, preguntas: [peor, { ...peor, id: 'peor-2' }] };
}

/** La partida del quiz con esa pregunta, en un hueco del tamano EXACTO que le deja el menu. */
function QuizPeor({ ancho, alto }: { ancho: number; alto: number }) {
  const banco = useMemo(bancoPeor, []);
  const [estado, setEstado] = useState(() => nuevaPartida(banco, [], Math.random));
  return (
    <View style={{ width: ancho, height: alto, alignSelf: 'center' }}>
      <Partida estado={estado} setEstado={(f) => setEstado((e) => f(e) ?? e)} onFinish={() => {}} banco={banco} />
    </View>
  );
}

// 56 px de barra de arriba y 64 de pestanas: lo que la app real le quita a la pantalla del juego.
export default function VerificarJuego() {
  const p = useLocalSearchParams<{ quiz?: string; ancho?: string; alto?: string; admin?: string; penul?: string }>();
  if (p.quiz === 'peor') return <QuizPeor ancho={Number(p.ancho)} alto={Number(p.alto)} />;
  return (
    <View style={{ flex: 1, paddingTop: 56, paddingBottom: 64, backgroundColor: '#F7F1E6' }}>
      {/* ?admin=1 y ?penul=1: quien mira y el interruptor de La Penul de la ruta (visibilidad.ts). */}
      <MenuMinijuegos rutaId={null} nombreRuta="Prueba" esAdmin={p.admin === '1'} penulVisible={p.penul === '1'} />
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
    /** Otra pagina en la misma pestana (con la emulacion ya puesta). */
    async ir(otra) {
      await cdp('Page.navigate', { url: otra });
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
 * Lo que le sobra al contenedor con scroll del quiz (0 = cabe) y si `objetivo`
 * (aria-label o texto) queda entero dentro de el, o sea, a la vista sin desplazar.
 */
const medirQuiz = (objetivo) => `(() => {
  const escalera = document.querySelector('[aria-label^="Pregunta "]');
  let sc = escalera;
  while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  if (!sc) return null;
  const q = ${JSON.stringify(objetivo)};
  const e = [...document.querySelectorAll('[aria-label]')].find((x) => x.getAttribute('aria-label').startsWith(q))
    ?? [...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && (x.innerText || '').trim().startsWith(q));
  const r = e && e.getBoundingClientRect();
  const c = sc.getBoundingClientRect();
  return { scroll: sc.scrollHeight - sc.clientHeight, visible: !!r && r.top >= c.top && r.bottom <= c.bottom + 0.5,
    hueco: [Math.round(c.width), Math.round(sc.clientHeight)] };
})()`;

/**
 * ¿Quien quiere ser cervecero? tiene que caber sin scroll. Con una pregunta al
 * azar no se demuestra nada (casi todas son cortas), asi que:
 *  1. se abre en el menu de verdad y se mide el HUECO que le deja la app;
 *  2. en ese mismo hueco se monta la partida con una pregunta hecha con los
 *     textos MAS LARGOS del banco (`bancoPeor`, en la pantalla de prueba) y se
 *     mide en cada momento: con la pregunta, al elegir y al revelar (desde la 0061
 *     ya no hay "Plantarme": sin respuesta, la fila de abajo dice "Elige una respuesta").
 */
async function recorrerQuiz(chrome, perfil, url, tamano) {
  const c = await abrirChrome(chrome, perfil, url, tamano);
  try {
    await c.navegar({ movil: true });
    await c.clic('Jugar a ¿Quién', 80);
    // "Jugar" se activa al leer el almacen: se insiste hasta que sale la partida.
    if (!(await c.hasta('Elige una respuesta', { tocar: 'Jugar', limite: 15000 }))) throw new Error('no empieza la partida');
    const real = await c.ev(medirQuiz('Elige una respuesta'));
    await c.foto('quiz-real');

    await c.ir(`${url}?quiz=peor&ancho=${real.hueco[0]}&alto=${real.hueco[1]}`);
    if (!(await c.hasta('Elige una respuesta', { limite: 30000 }))) throw new Error('no carga la partida de prueba');
    await esperar(500);
    const pregunta = await c.ev(medirQuiz('Elige una respuesta'));
    await c.foto('quiz-peor-1-pregunta');
    await c.clic('Respuesta A');
    await esperar(300);
    const elegida = await c.ev(medirQuiz('¿Respuesta definitiva?'));
    await c.foto('quiz-peor-2-elegida');
    await c.clic('¿Respuesta definitiva?');
    if (!(await c.hasta('Siguiente|Ver resultado', { limite: 8000 }))) throw new Error('no se revela la respuesta');
    await esperar(300);
    const revelada = await c.ev(medirQuiz((await c.texto()).includes('Siguiente') ? 'Siguiente' : 'Ver resultado'));
    await c.foto('quiz-peor-4-revelada');
    return { real: real.scroll, hueco: real.hueco, pregunta, elegida, revelada };
  } finally {
    c.cerrar();
    await esperar(1500);
  }
}

/**
 * Tapon al Vuelo con el tactil emulado, como un movil de verdad. Se juega en
 * horizontal y a pantalla completa: se prueba con la ventana en horizontal y
 * tambien en VERTICAL, donde el juego se pinta tumbado (girado 90 grados) y el
 * dedo y la chapa hay que pasarlos a las coordenadas del juego para medirlos.
 *  - sin scroll, la zona ocupa la ventana y el marcador (1/10) se ve entero;
 *  - un toque sin arrastrar NO gasta el tiro;
 *  - un arrastre REAL (touchStart en mitad de la pantalla, varios touchMove hacia
 *    atras y abajo en coordenadas del juego, touchEnd) lanza: la chapa sale hacia
 *    arriba y a la derecha DEL JUEGO, y el tiro se gasta (pasa al 2/10).
 */
async function recorrerTapon(chrome, perfil, url, tamano, { horizontal }) {
  const ventana = horizontal ? { ancho: tamano.alto, alto: tamano.ancho } : tamano;
  const c = await abrirChrome(chrome, perfil, url, ventana);
  const girado = !horizontal;
  const zona = () =>
    c.ev(`(() => { const z = document.querySelector('[aria-label^="Zona de lanzamiento"]'); if (!z) return null;
      const r = z.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`);
  // Del juego (x a la derecha, y hacia abajo, en px) a la pantalla, y al reves.
  const aPantalla = (z, x, y) => (girado ? [z.right - y, z.top + x] : [z.left + x, z.top + y]);
  const aJuego = (z, sx, sy) => (girado ? [sy - z.top, z.right - sx] : [sx - z.left, sy - z.top]);
  const chapa = () =>
    c.ev(`(() => {
      const e = document.querySelector('[data-testid="tapon-chapa"]');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
  const scroll = () =>
    c.ev(`(() => {
      let peor = document.scrollingElement.scrollHeight - innerHeight;
      for (const e of document.querySelectorAll('body *')) {
        const s = getComputedStyle(e).overflowY;
        if (/(auto|scroll)/.test(s) && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0) peor = Math.max(peor, e.scrollHeight - e.clientHeight);
      }
      return Math.max(0, peor);
    })()`);
  const nombre = horizontal ? 'horizontal' : 'vertical';
  try {
    await c.navegar({ movil: true });
    await c.clic('Jugar a Tapón', 80);
    await c.clic('Empezar');
    if (!(await c.hasta('Tira hacia atrás', { limite: 10000 }))) throw new Error('no empieza la partida');
    await esperar(400);
    const scrollJugando = await scroll();
    const z = await zona();
    if (!z) throw new Error('no hay zona de lanzamiento');
    const dentro = await c.ev(`(() => {
      const t = [...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && (x.innerText || '').trim() === '1/10');
      if (!t) return false;
      const r = t.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    })()`);
    const zonaLlena = Math.abs(z.right - z.left - ventana.ancho) <= 2 && Math.abs(z.bottom - z.top - ventana.alto) <= 2;
    await c.foto(`tapon-${nombre}-apuntar`);

    const anchoJuego = girado ? z.bottom - z.top : z.right - z.left;
    const altoJuego = girado ? z.right - z.left : z.bottom - z.top;
    const gx0 = anchoJuego * 0.55;
    const gy0 = altoJuego * 0.45;
    const [sx0, sy0] = aPantalla(z, gx0, gy0);

    // Un toque sin arrastrar: no lanza.
    await c.dedos('touchStart', [{ x: sx0, y: sy0, id: 1 }]);
    await esperar(80);
    await c.dedos('touchEnd', []);
    await esperar(400);
    const toqueNoGasta = /1\/10/.test(await c.texto());

    // El arrastre de verdad: hacia atras (izquierda) y abajo DEL JUEGO, por pasos, y soltar.
    await c.dedos('touchStart', [{ x: sx0, y: sy0, id: 1 }]);
    for (let i = 1; i <= 10; i++) {
      const [sx, sy] = aPantalla(z, gx0 - 9 * i, gy0 + 7 * i);
      await c.dedos('touchMove', [{ x: sx, y: sy, id: 1 }]);
      await esperar(25);
    }
    const enCuchara = await chapa();
    const salida = enCuchara ? aJuego(z, ...enCuchara).map(Math.round) : null;
    await c.foto(`tapon-${nombre}-tensando`);
    await c.dedos('touchEnd', []);
    const trayectoria = [];
    for (let i = 0; i < 8; i++) {
      await esperar(60);
      const p = await chapa();
      if (p) trayectoria.push(aJuego(z, ...p).map(Math.round));
    }
    await c.foto(`tapon-${nombre}-volando`);
    const vuela =
      !!salida &&
      trayectoria.length >= 3 &&
      trayectoria.some(([x, y]) => x > salida[0] + 20 && y < salida[1] - 10) &&
      new Set(trayectoria.map((p) => p.join(','))).size >= 3;
    const gasta = await c.hasta('2/10', { limite: 6000 });
    await c.foto(`tapon-${nombre}-resultado`);
    const scrollTrasTiro = await scroll();
    return { nombre, scrollJugando, scrollTrasTiro, dentro, zonaLlena, toqueNoGasta, salida, trayectoria, vuela, gasta };
  } finally {
    c.cerrar();
    await esperar(1500);
  }
}

/** Los juegos del menu, en orden, y si llevan la etiqueta "Solo admins". */
const leerMenu = `(() => [...document.querySelectorAll('[aria-label^="Jugar a "]')].map((b) => ({
  titulo: b.getAttribute('aria-label').slice(8),
  soloAdmins: (b.innerText || '').includes('Solo admins'),
})))()`;

/**
 * Una pantalla de La Penul: si hay scroll, y cada boton visible si cabe entero
 * en la ventana y no tiene nada encima (lo que hay en su centro es suyo).
 */
const medirPenul = `(() => {
  const botones = [...document.querySelectorAll('[role="button"]')].filter((b) => b.getBoundingClientRect().width > 0);
  let sc = 0;
  for (const e of document.querySelectorAll('body *')) {
    if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) sc = Math.max(sc, e.scrollHeight - e.clientHeight);
  }
  return {
    scroll: Math.max(sc, document.scrollingElement.scrollHeight - innerHeight),
    botones: botones.map((b) => {
      const r = b.getBoundingClientRect();
      const arriba = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        label: (b.getAttribute('aria-label') || b.innerText || '').slice(0, 40),
        dentro: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5,
        libre: !!arriba && b.contains(arriba),
      };
    }),
  };
})()`;

/**
 * La Penul. Primero QUIEN la ve (con ?admin=1 / ?penul=1 en la pantalla de
 * prueba); luego una partida entera hasta el final bueno de Lola, midiendo cada
 * pantalla. El genero sale al azar: el camino elige por textos que no cambian.
 */
async function recorrerPenul(chrome, perfil, url, tamano) {
  const c = await abrirChrome(chrome, perfil, url, tamano);
  const pantallas = [];
  const medir = async (nombre) => {
    await esperar(250);
    const m = await c.ev(medirPenul);
    pantallas.push({ nombre, ...m });
    await c.foto(`penul-${String(pantallas.length).padStart(2, '0')}-${nombre}`);
  };
  const menu = async (query) => {
    await c.ir(`${url}?${query}`);
    let m = [];
    for (let i = 0; i < 60 && m.length === 0; i++) {
      await esperar(250);
      m = await c.ev(leerMenu);
    }
    return m;
  };
  /** Pasa paginas con "Seguir" hasta que haya otra cosa que elegir. */
  const leerTodo = async () => {
    for (let i = 0; i < 12; i++) {
      const hay = await c.ev(`!!document.querySelector('[aria-label="Seguir"]')`);
      if (!hay) return;
      await c.clic('Seguir');
      await esperar(150);
    }
  };
  try {
    await c.navegar({ movil: true });
    const vis = {
      normalApagado: await menu('penul=0'),
      normalEncendido: await menu('penul=1'),
      adminApagado: await menu('admin=1&penul=0'),
      adminEncendido: await menu('admin=1&penul=1'),
    };

    // Partida (como admin, que la ve siempre).
    await menu('admin=1');
    await c.clic('Jugar a La Penul');
    if (!(await c.hasta('Empezar la noche', { limite: 15000 }))) throw new Error('no sale la portada');
    await medir('portada');
    await c.clic('Créditos');
    await esperar(300);
    const creditos = await c.texto();
    await medir('creditos');
    await c.clic('Volver');
    await c.clic('Empezar la noche');
    await esperar(300);
    await medir('genero');
    const genero = (await c.texto()).includes('eres un hombre') ? 'h' : 'm';
    await esperar(700);
    await c.clic('Entrar al bar');
    await esperar(300);
    await leerTodo();
    await medir('puerta');
    await esperar(700);
    await c.clic('A beber');
    await esperar(300);
    await leerTodo();
    await medir('barra');
    await esperar(700);
    await c.clic('Lola');
    for (const [nombre, opcion] of [
      ['lola-1', 'Vengo a preguntarte'],
      ['lola-2', 'Dame una moneda'],
      ['lola-3', 'Mover la cabeza'],
      ['lola-4', '¿Y qué me vas a dejar'],
    ]) {
      await esperar(300);
      await leerTodo();
      await medir(nombre);
      await esperar(700);
      await c.clic(opcion);
    }
    await esperar(300);
    await leerTodo();
    await medir('lola-bueno');
    await c.clic('Ver el final');
    if (!(await c.hasta('LOLA Y EL ESTRIBILLO', { limite: 8000 }))) throw new Error('no sale la portada del final');
    await esperar(400);
    await medir('final');
    const textoFinal = await c.texto();

    // El fallo que cazo el critico: "Seguir" y la ultima opcion caen en el mismo
    // sitio, y un doble toque rapido para pasar el texto elegia, sin leerla, la
    // opcion de abajo (la de presionar). Con Vane: dos paginas y, abajo del todo
    // en la siguiente pantalla, "Sonrie, guapa". Dos toques seguidos en "Seguir".
    // El final tambien lleva candado: un toque recien aparecida la portada no cuenta.
    await esperar(700);
    await c.clic('Volver a jugar');
    await esperar(700);
    await c.clic('Entrar al bar');
    await esperar(300);
    await leerTodo();
    await esperar(700);
    await c.clic('A beber');
    await esperar(300);
    await leerTodo();
    await esperar(700);
    await c.clic('Vane');
    await esperar(400);
    const donde = await c.ev(`(() => { const b = document.querySelector('[aria-label="Seguir"]'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!donde) throw new Error('no hay "Seguir" en la primera pagina de Vane');
    for (let i = 0; i < 2; i++) {
      await c.dedos('touchStart', [{ x: donde[0], y: donde[1], id: 1 }]);
      await esperar(40);
      await c.dedos('touchEnd', []);
      await esperar(90);
    }
    await esperar(1200);
    const trasDobleToque = await c.texto();
    const dobleToque = {
      // Sigue en vane-1, con sus opciones a la vista, y no se ha elegido ninguna.
      sinElegir: /¿Vienes a bailar o a mirar\?/.test(trasDobleToque) && !/se recoloca las gafas|ni en tus sueños/.test(trasDobleToque),
      opcionesAVista: /Sonríe, guapa/.test(trasDobleToque),
    };
    return { vis, pantallas, creditos, genero, textoFinal, dobleToque };
  } finally {
    c.cerrar();
    await esperar(1500);
  }
}

/** Estado del tablero de Parejas: por carta, su centro, si se ve entera, si algo la tapa y lo que dice. */
const leerTablero = `(() => {
  const cartas = [...document.querySelectorAll('[data-testid^="carta-"]')]
    .sort((a, b) => Number(a.dataset.testid.slice(6)) - Number(b.dataset.testid.slice(6)));
  const tab = document.querySelector('[data-testid="tablero-parejas"]');
  let sc = null;
  for (let e = tab; e && !sc; e = e.parentElement) {
    if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) sc = e;
  }
  return {
    scroll: sc ? sc.scrollHeight - sc.clientHeight : 0,
    paginaScroll: document.scrollingElement.scrollHeight - innerHeight,
    reloj: (document.querySelector('[data-testid="reloj-parejas"]') || {}).innerText || null,
    cartas: cartas.map((c) => {
      const r = c.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const arriba = document.elementFromPoint(x, y);
      return {
        x, y, lado: Math.round(r.width),
        dentro: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
        libre: !!arriba && c.contains(arriba),
        label: c.getAttribute('aria-label') || '',
      };
    }),
  };
})()`;

/**
 * Parejas de Barra: una partida entera, con el dedo (tactil emulado) y con
 * MEMORIA, como jugaria una persona: recuerda lo que ha visto y va a por la
 * pareja en cuanto la conoce. Lo que es cada carta se lee de su aria-label, lo
 * mismo que oiria alguien con lector de pantalla (no hace trampa).
 */
async function recorrerParejas(chrome, perfil, url, tamano) {
  const c = await abrirChrome(chrome, perfil, url, tamano);
  const simbolo = (label) => (/boca abajo/.test(label) ? null : label.replace(/^Carta \d+, /, '').replace(/, emparejada$/, ''));
  try {
    await c.navegar({ movil: true });
    await c.clic('Jugar a Parejas de Barra', 80);
    let t = null;
    for (let i = 0; i < 100 && !(t && t.cartas.length === 16 && t.cartas[0].lado > 0); i++) {
      await esperar(200);
      t = await c.ev(leerTablero);
    }
    if (!t || t.cartas.length !== 16) throw new Error('no sale el tablero');
    const inicio = t;
    await c.foto('parejas-inicio');
    const tocarCarta = async (i) => {
      const { x, y } = (await c.ev(leerTablero)).cartas[i];
      await c.dedos('touchStart', [{ x, y, id: 1 }]);
      await esperar(30);
      await c.dedos('touchEnd', []);
    };
    // Espera a que la carta i ensene su cara y devuelve lo que es.
    const verCarta = async (i) => {
      for (let k = 0; k < 60; k++) {
        const s = simbolo((await c.ev(leerTablero)).cartas[i].label);
        if (s) return s;
        await esperar(50);
      }
      throw new Error(`la carta ${i} no se da la vuelta`);
    };
    // Tras un fallo, espera a que se tapen (mientras se ven, los toques no valen).
    const tapadasYa = async () => {
      for (let k = 0; k < 80; k++) {
        const vistas = (await c.ev(leerTablero)).cartas.filter((x) => simbolo(x.label) && !/emparejada/.test(x.label));
        if (vistas.length === 0) return;
        await esperar(50);
      }
    };
    const vistos = new Map(); // indice -> simbolo
    let medio = null;
    for (let jugada = 0; jugada < 40; jugada++) {
      const tab = await c.ev(leerTablero);
      const pend = tab.cartas.map((_, i) => i).filter((i) => !/emparejada/.test(tab.cartas[i].label));
      if (pend.length === 0) break;
      const conocida = pend.find((i) => vistos.has(i) && pend.some((j) => j !== i && vistos.get(j) === vistos.get(i)));
      if (conocida !== undefined) {
        const b = pend.find((j) => j !== conocida && vistos.get(j) === vistos.get(conocida));
        await tocarCarta(conocida);
        await verCarta(conocida);
        // Espera a que acabe el giro: un toque antes no vale (y esta bien que no valga).
        await esperar(300);
        await tocarCarta(b);
        await verCarta(b);
      } else {
        const a = pend.find((i) => !vistos.has(i));
        await tocarCarta(a);
        vistos.set(a, await verCarta(a));
        const b = pend.find((j) => j !== a && vistos.get(j) === vistos.get(a)) ?? pend.find((j) => j !== a && !vistos.has(j));
        await esperar(300);
        await tocarCarta(b);
        vistos.set(b, await verCarta(b));
      }
      if (jugada === 3) {
        medio = await c.ev(leerTablero);
        await c.foto('parejas-medio');
      }
      await tapadasYa();
      await esperar(300);
    }
    // El reloj se para con la ultima pareja: lo que marca entonces es la nota.
    await esperar(150);
    const final = await c.ev(leerTablero);
    await c.foto('parejas-fin');
    if (!(await c.hasta('Fin de la partida|Nuevo récord', { limite: 15000 }))) throw new Error('no sale la tarjeta de fin');
    await esperar(300);
    const tarjeta = await c.ev(`(() => {
      const t = [...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && /^\\d+,\\d\\d s$/.test((x.innerText || '').trim()));
      return t ? t.innerText.trim() : null;
    })()`);
    const textoFin = await c.texto();
    await c.foto('parejas-tarjeta');
    return { inicio, medio, final, tarjeta, textoFin };
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
  const servidor = await servir(salida);
  const { port } = servidor.address();
  try {
    writeFileSync(PANTALLA, CODIGO_PANTALLA);
    console.log('Exportando la web (1 min aprox)...');
    const entorno = { ...process.env };
    delete entorno.WEB_BASE_URL;
    // --clear: la cache de Metro guarda cada fichero transformado por su CONTENIDO, no por
    // el valor de los EXPO_PUBLIC_* que lleva incrustados.
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
  let fallos = 0;
  try {
    // `npm run verificar:juego -- 740` repite solo ese alto (para comprobar un arreglo sin esperar los tres).
    const solo = process.argv[2] ? Number(process.argv[2]) : null;
    for (const tamano of TAMANOS.filter((t) => solo === null || t.alto === solo)) {
      const perfil = mkdtempSync(join(tmpdir(), 'rb-chrome-'));
      console.log(`\n${tamano.nombre} (${tamano.ancho}x${tamano.alto}): recorriendo el juego (~1 min)...`);
      let r;
      // SOLO_CANA / SOLO_QUIZ: para iterar sobre un juego sin esperar a los demas.
      if (!HACER.maestro) console.log('SOLO_*: Maestro Cervecero no se recorre');
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

      if (HACER.cana) {
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

      if (HACER.tapon) {
        for (const horizontal of [true, false]) {
          console.log(`${tamano.nombre}: Tapón al Vuelo con el movil en ${horizontal ? 'horizontal' : 'vertical (tumbado)'}...`);
          let t = null;
          try {
            t = await recorrerTapon(chrome, mkdtempSync(join(tmpdir(), 'rb-chrome-')), `http://127.0.0.1:${port}/verificar-juego`, tamano, { horizontal });
          } catch (e) {
            console.log(`FALLA  no se pudo jugar a Tapón al Vuelo: ${e.message}`);
            fallos += 1;
          }
          if (!t) continue;
          console.log(JSON.stringify(t));
          for (const [nombre, ok] of [
            [`tapon (${t.nombre}): apuntando, sin scroll`, t.scrollJugando === 0],
            [`tapon (${t.nombre}): pantalla completa y el marcador dentro de la pantalla`, t.zonaLlena && t.dentro],
            [`tapon (${t.nombre}): un toque sin arrastrar no gasta el tiro`, t.toqueNoGasta],
            [`tapon (${t.nombre}): arrastrar en cualquier sitio y soltar lanza; la chapa vuela arriba y a la derecha del juego`, t.vuela],
            [`tapon (${t.nombre}): el tiro se gasta (pasa al 2/10)`, t.gasta],
            [`tapon (${t.nombre}): tras el tiro, sin scroll`, t.scrollTrasTiro === 0],
          ]) {
            console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
            if (!ok) fallos += 1;
          }
        }
      }

      if (!HACER.quiz) continue;
      console.log(`${tamano.nombre}: ¿Quién quiere ser cervecero?, con los textos más largos...`);
      let q;
      try {
        q = await recorrerQuiz(chrome, mkdtempSync(join(tmpdir(), 'rb-chrome-')), `http://127.0.0.1:${port}/verificar-juego`, tamano);
      } catch (e) {
        console.log(`FALLA  no se pudo jugar al quiz: ${e.message}`);
        fallos += 1;
        continue;
      }
      console.log(JSON.stringify(q));
      for (const [nombre, ok] of [
        ['quiz: con una pregunta del banco, cabe sin scroll', q.real === 0],
        ['quiz (peor caso): con la pregunta, sin scroll y "Elige una respuesta" a la vista', q.pregunta.scroll === 0 && q.pregunta.visible],
        ['quiz (peor caso): al elegir, sin scroll y "Sí, definitiva" a la vista', q.elegida.scroll === 0 && q.elegida.visible],
        ['quiz (peor caso): al revelar, sin scroll y el boton de seguir a la vista', q.revelada.scroll === 0 && q.revelada.visible],
      ]) {
        console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
        if (!ok) fallos += 1;
      }
    }
    if (HACER.penul) {
      const solo = process.argv[2] ? Number(process.argv[2]) : null;
      for (const tamano of TAMANOS.filter((t) => solo === null || t.alto === solo)) {
        console.log(`\n${tamano.nombre} (${tamano.ancho}x${tamano.alto}): La Penul, quién la ve y una partida hasta el final bueno...`);
        let r;
        try {
          r = await recorrerPenul(chrome, mkdtempSync(join(tmpdir(), 'rb-chrome-')), `http://127.0.0.1:${port}/verificar-juego`, tamano);
        } catch (e) {
          console.log(`FALLA  no se pudo jugar a La Penul: ${e.message}`);
          fallos += 1;
          continue;
        }
        const malas = r.pantallas.flatMap((p) => [
          ...(p.scroll > 0 ? [`${p.nombre}: scroll de ${p.scroll}px`] : []),
          ...p.botones.filter((b) => !b.dentro || !b.libre).map((b) => `${p.nombre}: "${b.label}" ${!b.dentro ? 'fuera de la pantalla' : 'tapado'}`),
        ]);
        console.log(JSON.stringify({ genero: r.genero, pantallas: r.pantallas.length, malas }));
        const primero = (m) => m[0]?.titulo;
        for (const [nombre, ok] of [
          ['penul: persona normal, interruptor apagado: NO sale', !r.vis.normalApagado.some((j) => j.titulo === 'La Penul') && r.vis.normalApagado.length > 0],
          ['penul: persona normal, interruptor encendido: sale la PRIMERA y sin etiqueta', primero(r.vis.normalEncendido) === 'La Penul' && !r.vis.normalEncendido[0].soloAdmins],
          ['penul: admin, interruptor apagado: sale la primera con "Solo admins"', primero(r.vis.adminApagado) === 'La Penul' && r.vis.adminApagado[0].soloAdmins],
          ['penul: admin, interruptor encendido: la primera, sin etiqueta', primero(r.vis.adminEncendido) === 'La Penul' && !r.vis.adminEncendido[0].soloAdmins],
          ['penul: los creditos citan los fondos (CC BY 3.0) y Open Peeps', /CC BY 3\.0/.test(r.creditos) && /Open Peeps/.test(r.creditos)],
          [`penul: ${r.pantallas.length} pantallas sin scroll ni botones fuera o tapados`, malas.length === 0 && r.pantallas.length >= 10],
          ['penul: llega al final bueno, con su titular y "Volver a jugar"', /LOLA Y EL ESTRIBILLO/.test(r.textoFinal) && /Volver a jugar/.test(r.textoFinal)],
          ['penul: un doble toque rapido en "Seguir" NO elige la opcion que aparece debajo', r.dobleToque.sinElegir && r.dobleToque.opcionesAVista],
        ]) {
          console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
          if (!ok) fallos += 1;
        }
        for (const m of malas) console.log(`       ${m}`);
      }
    }

    if (HACER.parejas) {
      const solo = process.argv[2] ? Number(process.argv[2]) : null;
      for (const tamano of TAMANOS_PAREJAS.filter((t) => solo === null || t.alto === solo)) {
        console.log(`\n${tamano.nombre} (${tamano.ancho}x${tamano.alto}): Parejas de Barra, una partida entera...`);
        let r;
        try {
          r = await recorrerParejas(chrome, mkdtempSync(join(tmpdir(), 'rb-chrome-')), `http://127.0.0.1:${port}/verificar-juego`, tamano);
        } catch (e) {
          console.log(`FALLA  no se pudo jugar a Parejas: ${e.message}`);
          fallos += 1;
          continue;
        }
        const todas = (t, f) => !!t && t.cartas.length === 16 && t.cartas.every(f);
        console.log(JSON.stringify({ lado: r.inicio.cartas[0].lado, scroll: [r.inicio.scroll, r.medio?.scroll, r.final.scroll], reloj: r.final.reloj, tarjeta: r.tarjeta }));
        for (const [nombre, ok] of [
          ['parejas: 16 cartas, todas dentro de la pantalla', todas(r.inicio, (x) => x.dentro)],
          ['parejas: ninguna carta tapada por otra cosa', todas(r.inicio, (x) => x.libre)],
          ['parejas: sin scroll al empezar, a mitad y al terminar', [r.inicio, r.medio, r.final].every((t) => t && t.scroll === 0 && t.paginaScroll <= 0)],
          ['parejas: las cartas no son minusculas (>= 56 px)', r.inicio.cartas[0].lado >= 56],
          ['parejas: el reloj no corre antes del primer toque', r.inicio.reloj === '0,00 s'],
          ['parejas: termina con las 8 parejas', todas(r.final, (x) => /emparejada/.test(x.label))],
          ['parejas: el tiempo de la tarjeta (el que se envia) es el que marco el reloj', !!r.tarjeta && r.tarjeta === r.final.reloj],
          ['parejas: la tarjeta dice intentos y fallos', /\d+ intentos? · \d+ fallos?/.test(r.textoFin)],
        ]) {
          console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
          if (!ok) fallos += 1;
        }
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
