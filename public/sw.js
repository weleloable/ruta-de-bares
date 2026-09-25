/*
 * Service worker de Ruta de Bares.
 *
 * NO cachea la app a proposito. Un service worker que guarda el HTML y el
 * JavaScript hace que, tras cada despliegue, la gente siga viendo la version
 * vieja hasta cerrar todas las pestanas (la propia doc de Expo lo advierte).
 * Aqui todo va a la red siempre; lo unico guardado es una pagina minima de
 * "sin conexion" para cuando abrir la app sin cobertura no deje una pantalla
 * de error del navegador, y el icono que esa pagina ensena.
 *
 * Si se cambia este fichero, se sube VERSION: asi se borra la cache anterior.
 */
const VERSION = 'rb-sw-2';
const OFFLINE = 'offline.html';
// URL absoluta y no relativa: la pagina sin conexion se sirve en CUALQUIER ruta
// (/editor/123 tambien), y un src relativo apuntaria a otro sitio. Sale de
// donde vive este fichero, asi vale en localhost (/) y en Pages (/ruta-de-bares/).
const ICONO = new URL('icons/icon-192.png', self.location).href;

const PAGINA_OFFLINE = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ruta de Bares - Sin conexion</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #F6EFE2; color: #241A12; font-family: Georgia, serif; text-align: center; padding: 24px; }
  .logo { display: block; width: 96px; height: 96px; border-radius: 50%; margin: 0 auto 20px; }
  button { margin-top: 20px; padding: 12px 24px; border-radius: 999px; border: 1px solid #9A5A11;
           background: #C67A1E; color: #fff; font-size: 16px; font-weight: 700; }
</style></head>
<body><main>
  <img class="logo" src="${ICONO}" alt="Ruta de Bares" />
  <h1>Sin conexion</h1>
  <p>Ruta de Bares necesita internet para cargar la ruta y sellar.</p>
  <button onclick="location.reload()">Reintentar</button>
</main></body></html>`;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        Promise.all([
          cache.put(OFFLINE, new Response(PAGINA_OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
          // Si el icono no baja, la instalacion sigue: sin el, la pagina sin
          // conexion sale igual, solo sin logo. Peor seria quedarse sin ella.
          cache.add(ICONO).catch(() => undefined),
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== VERSION).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  // El icono de la pagina sin conexion: red primero (asi un icono nuevo se ve
  // en cuanto se despliega) y la copia guardada solo si no hay red.
  if (evento.request.url === ICONO) {
    evento.respondWith(
      fetch(evento.request).catch(() =>
        caches
          .open(VERSION)
          .then((cache) => cache.match(ICONO))
          .then((guardado) => guardado ?? Response.error()),
      ),
    );
    return;
  }
  // Por lo demas, solo navegaciones (abrir la app, recargar). Supabase, teselas
  // del mapa y assets pasan de largo sin tocar: ni se cachean ni se retrasan.
  if (evento.request.mode !== 'navigate') return;
  evento.respondWith(
    fetch(evento.request).catch(() =>
      caches
        .open(VERSION)
        .then((cache) => cache.match(OFFLINE))
        // Si el navegador purgo la cache, respondWith(undefined) seria un error
        // de red en crudo: se contesta la pagina igualmente, sin cache.
        .then(
          (guardada) =>
            guardada ?? new Response(PAGINA_OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
        ),
    ),
  );
});
