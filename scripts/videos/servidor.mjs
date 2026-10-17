/**
 * Servidor estatico de la web exportada, con la caida a index.html de una app
 * de una sola pagina (como el 404.html de GitHub Pages). Sirve tambien el
 * "escenario" (escenario/), la pagina que enmarca el movil y los subtitulos.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/** Que fichero responde a `camino`. Pura, para poder probarla sin red. */
export function resolver(camino, { web, escenario, alias = {} }) {
  if (alias[camino]) return alias[camino];
  const [base, relativo] = camino.startsWith('/__escenario/') ? [escenario, camino.slice('/__escenario'.length)] : [web, camino];
  const ruta = normalize(join(base, relativo));
  // Nada fuera de su carpeta (un ../ en la URL) y todo lo desconocido, a la app.
  return ruta.startsWith(normalize(base)) && existsSync(ruta) && statSync(ruta).isFile() ? ruta : join(web, 'index.html');
}

/**
 * @param {{web:string, escenario:string, puerto?:number, alias?:Record<string,string>}} o
 *   alias: rutas servidas desde otro fichero (el logo de assets/, sin copiarlo al escenario).
 */
export function servir({ web, escenario, puerto = 8090, alias = {} }) {
  const servidor = http.createServer((peticion, respuesta) => {
    const camino = decodeURIComponent(new URL(peticion.url, 'http://x').pathname);
    const fichero = resolver(camino, { web, escenario, alias });
    respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(fichero)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    respuesta.end(readFileSync(fichero));
  });
  return new Promise((ok, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(puerto, '127.0.0.1', () => ok(servidor));
  });
}

export function aliasEscenario(raiz) {
  return { '/__escenario/logo.png': join(raiz, 'assets', 'logo.png') };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/videos/servidor.mjs')) {
  const { WEB, AQUI, RAIZ } = await import('./entorno.mjs');
  await servir({ web: WEB, escenario: join(AQUI, 'escenario'), alias: aliasEscenario(RAIZ) });
  console.log('http://127.0.0.1:8090');
}
