import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * La app instalable (PWA): manifest, iconos y service worker.
 *
 * Lo que se rompe aqui no da error en ningun sitio: el navegador simplemente
 * deja de ofrecer "Instalar", o peor, un service worker que cachea deja a la
 * gente con una version vieja tras cada despliegue. Por eso sw.js no se revisa
 * con expresiones regulares: se ejecuta de verdad en un entorno falso.
 */

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

function dimensionesPng(ruta: string): { ancho: number; alto: number } {
  const bytes = readFileSync(join(raiz, ruta));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', `${ruta} no es un PNG`);
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}

describe('manifest.json', () => {
  const manifest = JSON.parse(leer('public/manifest.json'));

  it('es instalable: nombre, standalone y colores', () => {
    assert.ok(manifest.name && manifest.short_name);
    assert.equal(manifest.display, 'standalone');
    assert.match(manifest.theme_color, /^#[0-9A-F]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9A-F]{6}$/i);
  });

  it('start_url, scope e iconos son relativos: valen en localhost y bajo /ruta-de-bares/', () => {
    // Relativos al propio manifest. Uno absoluto ("/") mandaria la app instalada
    // desde GitHub Pages a la raiz de weleloable.github.io, que no es la app.
    for (const url of [manifest.start_url, manifest.scope, ...manifest.icons.map((i: { src: string }) => i.src)]) {
      assert.ok(!url.startsWith('/') && !/^[a-z]+:/i.test(url), `"${url}" no es relativo`);
    }
  });

  it('cada icono existe y mide lo que declara', () => {
    for (const icono of manifest.icons as { src: string; sizes: string }[]) {
      const ruta = `public/${icono.src}`;
      assert.ok(existsSync(join(raiz, ruta)), `falta ${ruta}`);
      const [ancho, alto] = icono.sizes.split('x').map(Number);
      assert.deepEqual(dimensionesPng(ruta), { ancho, alto }, ruta);
    }
  });

  it('tiene los iconos que piden Android (192 y 512) y uno maskable', () => {
    const iconos = manifest.icons as { sizes: string; purpose: string }[];
    assert.ok(iconos.some((i) => i.sizes === '192x192' && i.purpose.includes('any')));
    assert.ok(iconos.some((i) => i.sizes === '512x512' && i.purpose.includes('any')));
    assert.ok(iconos.some((i) => i.purpose.includes('maskable')));
  });

  it('existe el icono de iOS a 180 px que enlaza la app', () => {
    assert.deepEqual(dimensionesPng('public/icons/apple-touch-icon.png'), { ancho: 180, alto: 180 });
  });
});

describe('index.html', () => {
  const html = leer('public/index.html');

  it('no enlaza el manifest ni el icono de iOS con una ruta fija (los pone la app segun baseUrl)', () => {
    assert.ok(!/rel="manifest"/.test(html));
    assert.ok(!/rel="apple-touch-icon"/.test(html));
  });

  it('declara lo necesario para abrirse como app en iOS', () => {
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /name="theme-color"/);
    assert.match(html, /viewport-fit=cover/);
  });
});

type Oyente = (evento: EventoFalso) => void;
type EventoFalso = {
  request?: { mode: string; url: string };
  waitUntil(promesa: Promise<unknown>): void;
  respondWith(promesa: Promise<Response | undefined>): void;
};

function cargarServiceWorker() {
  const oyentes: Record<string, Oyente> = {};
  const almacen = new Map<string, Map<string, Response>>();
  let red: () => Promise<Response> = async () => new Response('app desde la red');

  const caches = {
    async open(nombre: string) {
      if (!almacen.has(nombre)) almacen.set(nombre, new Map());
      const cache = almacen.get(nombre)!;
      return {
        async put(clave: string, respuesta: Response) {
          cache.set(String(clave), respuesta);
        },
        async match(clave: string) {
          return cache.get(String(clave))?.clone();
        },
      };
    },
    async keys() {
      return [...almacen.keys()];
    },
    async delete(nombre: string) {
      return almacen.delete(nombre);
    },
  };
  const self = {
    addEventListener(tipo: string, oyente: Oyente) {
      oyentes[tipo] = oyente;
    },
    async skipWaiting() {},
    clients: { async claim() {} },
  };

  vm.runInNewContext(leer('public/sw.js'), { self, caches, fetch: () => red(), Response, console });

  async function disparar(tipo: string, request?: EventoFalso['request']) {
    const esperas: Promise<unknown>[] = [];
    let respuesta: Promise<Response | undefined> | undefined;
    oyentes[tipo]({
      request,
      waitUntil: (p) => esperas.push(p),
      respondWith: (p) => {
        respuesta = p;
      },
    });
    await Promise.all(esperas);
    return respuesta;
  }

  return {
    almacen,
    disparar,
    ponerRed(funcion: () => Promise<Response>) {
      red = funcion;
    },
  };
}

describe('service worker (public/sw.js ejecutado)', () => {
  it('al instalarse solo guarda la pagina de sin conexion, nada de la app', async () => {
    const sw = cargarServiceWorker();
    await sw.disparar('install');
    const entradas = [...sw.almacen.values()].flatMap((cache) => [...cache.keys()]);
    assert.deepEqual(entradas, ['offline.html']);
  });

  it('no intercepta nada que no sea abrir o recargar la app (JS, Supabase, teselas)', async () => {
    const sw = cargarServiceWorker();
    for (const mode of ['cors', 'no-cors', 'same-origin']) {
      assert.equal(await sw.disparar('fetch', { mode, url: 'https://x/entry.js' }), undefined, mode);
    }
  });

  it('con red, abrir la app siempre sirve la version de la red (nunca una vieja)', async () => {
    const sw = cargarServiceWorker();
    await sw.disparar('install');
    const respuesta = await sw.disparar('fetch', { mode: 'navigate', url: 'https://x/ruta-de-bares/' });
    assert.equal(await respuesta?.text(), 'app desde la red');
  });

  it('sin red, abrir la app ensena la pagina de sin conexion', async () => {
    const sw = cargarServiceWorker();
    await sw.disparar('install');
    sw.ponerRed(() => Promise.reject(new TypeError('Failed to fetch')));
    const respuesta = await sw.disparar('fetch', { mode: 'navigate', url: 'https://x/ruta-de-bares/' });
    assert.match((await respuesta?.text()) ?? '', /Sin conexion/);
  });

  it('sin red y con la cache purgada por el navegador, sigue ensenando la pagina de sin conexion', async () => {
    const sw = cargarServiceWorker();
    // Sin disparar install: la cache esta vacia, como tras una purga.
    sw.ponerRed(() => Promise.reject(new TypeError('Failed to fetch')));
    const respuesta = await sw.disparar('fetch', { mode: 'navigate', url: 'https://x/ruta-de-bares/' });
    assert.ok(respuesta, 'respondWith recibio undefined');
    assert.match((await respuesta.text()) ?? '', /Sin conexion/);
  });

  it('al activarse borra las caches de versiones anteriores y conserva la actual', async () => {
    const version = /const VERSION = '([^']+)'/.exec(leer('public/sw.js'))?.[1];
    assert.ok(version, 'sw.js sin VERSION');
    const sw = cargarServiceWorker();
    await sw.disparar('install');
    sw.almacen.set('rb-sw-0', new Map());
    sw.almacen.set('otra-cosa-vieja', new Map());
    await sw.disparar('activate');
    assert.deepEqual([...sw.almacen.keys()], [version]);
  });
});
