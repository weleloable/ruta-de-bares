#!/usr/bin/env node
/**
 * Prueba de COMPORTAMIENTO del mapa web en un navegador de verdad.
 *
 *   npm run verificar:web
 *
 * Los tests de Node prueban la logica de encuadre (src/lib/encuadre.ts) y leen
 * el cableado de los componentes, pero leer codigo no demuestra comportamiento:
 * siempre hay una forma de escribir la regresion que se escapa. Esto monta
 * RutaMapa.web.tsx en Chrome headless y mide, en pixeles, donde queda un pin:
 *
 *   1. el usuario aleja el mapa ("ir al bar 3")
 *   2. cambia la medida de la cabecera (aparece un aviso)  -> el mapa NO se mueve
 *   3. se oculta y se muestra la pestana                   -> el mapa NO se mueve
 *   4. llega un array nuevo con los mismos bares            -> el mapa NO se mueve
 *   5. cambian los bares con la pestana oculta y se muestra -> el mapa SI encuadra
 *
 * El 5 es el control positivo: sin el, un mapa que no reaccionase a nada
 * pasaria el resto.
 *
 * Tarda ~1 min (hace un export web). Es del carril periodico, no del gate de
 * cada commit: ejecutar antes de subir cambios al mapa web.
 *
 * Como funciona: escribe una pantalla de prueba temporal en app/(auth)/ (zona
 * publica, sin login), exporta la web, la BORRA pase lo que pase, sirve el
 * export, abre Chrome headless EN TIEMPO REAL y lee el resultado que la
 * pantalla deja en el DOM por el protocolo DevTools. Chrome se busca en las
 * rutas habituales o en $CHROME.
 *
 * Tiempo real y no --dump-dom con --virtual-time-budget: en ese modo Chrome no
 * pinta fotogramas, asi que ni requestAnimationFrame (animaciones de Leaflet)
 * ni ResizeObserver (ocultar/mostrar pestana) llegan a ejecutarse. El mapa no
 * se movia por nada y las comprobaciones de "no se mueve" pasaban en falso: lo
 * delataron las dos de control.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANTALLA = join(raiz, 'app', '(auth)', 'verificar-mapa.tsx');
const TOLERANCIA_PX = 2;

const CODIGO_PANTALLA = `// GENERADO por scripts/verificar-mapa-web.mjs. Se borra solo. No commitear.
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { RutaMapa, type RutaMapaHandle } from '../../src/components/RutaMapa';
import type { RouteBarRow } from '../../src/types/database';

const base = {
  route_id: 'r', address: '', radius_m: 120, notes: '', created_at: '2026-01-01T00:00:00Z',
  opens_at: '2026-09-19T18:00:00Z', closes_at: '2026-09-19T19:00:00Z',
};
const A: RouteBarRow[] = [
  { ...base, id: 'b1', sort_order: 0, name: 'Uno', lat: 40.4155, lng: -3.7005 },
  { ...base, id: 'b2', sort_order: 1, name: 'Dos', lat: 40.4142, lng: -3.6992 },
  { ...base, id: 'b3', sort_order: 2, name: 'Tres', lat: 40.4118, lng: -3.7046 },
];
const B: RouteBarRow[] = A.map((b) => ({ ...b, lat: b.lat + 0.03, lng: b.lng + 0.03 }));

function pin() {
  const caja = document.getElementById('caja-mapa');
  const marca = caja?.querySelector('.rb-pin');
  if (!caja || !marca) return null;
  const c = caja.getBoundingClientRect();
  const p = marca.getBoundingClientRect();
  if (c.height === 0) return null;
  return { x: Math.round(p.left - c.left), y: Math.round(p.top - c.top), alto: Math.round(c.height) };
}

export default function VerificarMapa() {
  const mapa = useRef<RutaMapaHandle>(null);
  const [bars, setBars] = useState(A);
  const [huecos, setHuecos] = useState<{ arriba: number; abajo: number } | undefined>(undefined);
  const [visible, setVisible] = useState(true);
  const [resultado, setResultado] = useState('');

  useEffect(() => {
    const r: Record<string, unknown> = {};
    const pasos: [number, () => void][] = [
      [500, () => setHuecos({ arriba: 110, abajo: 250 })],
      [1500, () => { r.encuadrado = pin(); }],
      [1600, () => mapa.current?.irA(A[2])],
      [2800, () => { r.movidoPorElUsuario = pin(); }],
      [2900, () => setHuecos({ arriba: 190, abajo: 250 })],
      [3900, () => { r.trasCambioDeMedida = pin(); }],
      [4000, () => setVisible(false)],
      [4600, () => setVisible(true)],
      [5600, () => { r.trasOcultarYMostrar = pin(); }],
      [5700, () => setBars(A.map((b) => ({ ...b })))],
      [6700, () => { r.trasRecargaIgual = pin(); }],
      [6800, () => setVisible(false)],
      [6900, () => setBars(B)],
      [7400, () => setVisible(true)],
      [8600, () => { r.trasCambioConPestanaOculta = pin(); setResultado(JSON.stringify(r)); }],
    ];
    const temporizadores = pasos.map(([ms, paso]) => setTimeout(paso, ms));
    return () => temporizadores.forEach(clearTimeout);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View nativeID="caja-mapa" style={{ height: 700, display: visible ? 'flex' : 'none' }}>
        <RutaMapa ref={mapa} bars={bars} sellados={new Set<string>()} seleccionado={null} onSeleccionar={() => {}} huecos={huecos} />
      </View>
      <Text nativeID="resultado">{resultado}</Text>
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

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

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

/** Evalua una expresion en la pagina por el protocolo DevTools y devuelve su valor. */
function evaluar(urlWebSocket, expresion) {
  return new Promise((resolver, rechazar) => {
    const ws = new WebSocket(urlWebSocket);
    const reloj = setTimeout(() => {
      ws.close();
      rechazar(new Error('DevTools no respondio'));
    }, 10000);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expresion, returnByValue: true } }));
    ws.onmessage = (evento) => {
      const mensaje = JSON.parse(evento.data);
      if (mensaje.id !== 1) return;
      clearTimeout(reloj);
      ws.close();
      resolver(mensaje.result?.result?.value ?? '');
    };
    ws.onerror = () => {
      clearTimeout(reloj);
      rechazar(new Error('fallo la conexion con DevTools'));
    };
  });
}

/**
 * Abre la pagina en Chrome headless en tiempo real y espera a que deje el
 * resultado. Chrome va ASINCRONO: con spawnSync Node se bloquea y el servidor
 * que le sirve la web, que vive en este mismo proceso, no le contesta nunca.
 */
async function leerResultado(chrome, url, perfil) {
  const hijo = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${perfil}`,
    '--window-size=600,900',
    '--remote-debugging-port=0',
    url,
  ]);
  let stderr = '';
  try {
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
      hijo.on('error', (error) => {
        clearTimeout(reloj);
        rechazar(error);
      });
    });
    const puerto = new URL(urlNavegador).port;

    // La pantalla tarda ~9 s en recorrer sus pasos; se da un margen amplio.
    const limite = Date.now() + 60000;
    let pagina = null;
    while (Date.now() < limite) {
      const paginas = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
      pagina = paginas.find((p) => p.type === 'page' && p.url.includes('verificar-mapa')) ?? null;
      if (pagina) {
        const texto = await evaluar(pagina.webSocketDebuggerUrl, "document.getElementById('resultado')?.textContent || ''");
        if (texto) return { texto, dom: '', stderr };
      }
      await esperar(500);
    }
    const dom = pagina
      ? await evaluar(pagina.webSocketDebuggerUrl, 'document.documentElement.outerHTML').catch(() => '')
      : '(no aparecio la pagina)';
    return { texto: '', dom, stderr };
  } finally {
    cerrarArbol(hijo);
    // taskkill vuelve antes de que los procesos hijos suelten el perfil.
    await esperar(1500);
  }
}

/**
 * Borra perfiles y exports de ejecuciones anteriores que Windows no dejo borrar
 * en su momento. Solo los de hace mas de 10 minutos: nunca los de una ejecucion
 * que siga en marcha.
 */
function barrerRestosAnteriores() {
  const hace = Date.now() - 10 * 60 * 1000;
  for (const nombre of readdirSync(tmpdir())) {
    if (!/^rb-(chrome|verificar-web)-/.test(nombre)) continue;
    const ruta = join(tmpdir(), nombre);
    try {
      if (statSync(ruta).mtimeMs < hace) rmSync(ruta, { recursive: true, force: true });
    } catch {
      // Sigue en uso o ya no existe: se deja para la proxima.
    }
  }
}

/**
 * Cierra Chrome con todos sus procesos. En Windows `kill()` solo cierra el
 * principal: los de render y GPU se quedan vivos, se acumulan en cada ejecucion
 * y retienen la carpeta del perfil temporal.
 */
function cerrarArbol(hijo) {
  if (hijo.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    hijo.kill('SIGKILL');
  }
}

const cerca = (a, b) => a && b && Math.abs(a.x - b.x) <= TOLERANCIA_PX && Math.abs(a.y - b.y) <= TOLERANCIA_PX;

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

  barrerRestosAnteriores();
  const salida = mkdtempSync(join(tmpdir(), 'rb-verificar-web-'));
  const perfil = mkdtempSync(join(tmpdir(), 'rb-chrome-'));
  let servidor;
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

  try {
    servidor = await servir(salida);
    const { port } = servidor.address();
    console.log('Abriendo Chrome headless en tiempo real (~15 s)...');
    const { texto, dom, stderr } = await leerResultado(chrome, `http://127.0.0.1:${port}/verificar-mapa`, perfil);
    if (!texto) {
      // Sin resultado no se adivina: se guarda lo que vio el navegador.
      const diagnostico = join(tmpdir(), `rb-verificar-web-${Date.now()}.log`);
      writeFileSync(diagnostico, `=== DOM ===\n${dom}\n\n=== SALIDA DE CHROME ===\n${stderr}`);
      throw new Error(`la pantalla de prueba no dejo resultado. Lo que vio el navegador: ${diagnostico}`);
    }
    const r = JSON.parse(texto);

    const comprobaciones = [
      [
        // Con la primera medida (cabecera 110 px, carrusel 250 px) el pin tiene
        // que quedar en el hueco libre, no debajo de ninguno de los dos.
        'el primer encuadre deja el pin en el hueco libre entre cabecera y carrusel',
        r.encuadrado && r.encuadrado.y >= 110 - 40 && r.encuadrado.y <= r.encuadrado.alto - 250,
      ],
      ['"ir al bar" mueve el mapa (si no, lo demas no prueba nada)', r.movidoPorElUsuario && !cerca(r.encuadrado, r.movidoPorElUsuario)],
      ['cambiar la medida de la cabecera NO mueve el mapa', cerca(r.movidoPorElUsuario, r.trasCambioDeMedida)],
      ['ocultar y mostrar la pestana NO mueve el mapa', cerca(r.movidoPorElUsuario, r.trasOcultarYMostrar)],
      ['recargar los mismos bares NO mueve el mapa', cerca(r.movidoPorElUsuario, r.trasRecargaIgual)],
      [
        'bares nuevos con la pestana oculta SI encuadran al volver',
        r.trasCambioConPestanaOculta &&
          !cerca(r.movidoPorElUsuario, r.trasCambioConPestanaOculta) &&
          r.trasCambioConPestanaOculta.y >= 0 &&
          r.trasCambioConPestanaOculta.y <= r.trasCambioConPestanaOculta.alto,
      ],
    ];

    console.log(JSON.stringify(r));
    let fallos = 0;
    for (const [nombre, ok] of comprobaciones) {
      console.log(`${ok ? 'ok   ' : 'FALLA'}  ${nombre}`);
      if (!ok) fallos += 1;
    }
    if (fallos > 0) {
      console.error(`\n${fallos} comprobacion(es) fallaron.`);
      process.exitCode = 1;
    } else {
      console.log('\nMapa web: comportamiento de encuadre correcto.');
    }
  } finally {
    servidor?.close();
    // En Windows los procesos hijos de Chrome tardan en soltar el perfil: se
    // reintenta, y si aun asi no se puede borrar es basura de %TEMP%, no un fallo.
    for (const carpeta of [salida, perfil]) {
      try {
        rmSync(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
      } catch {
        console.warn(`No se pudo borrar ${carpeta} (Chrome aun lo usa). Se puede borrar a mano.`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
