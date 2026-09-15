/*
 * Service worker de Ruta de Bares.
 *
 * NO cachea la app a proposito. Un service worker que guarda el HTML y el
 * JavaScript hace que, tras cada despliegue, la gente siga viendo la version
 * vieja hasta cerrar todas las pestanas (la propia doc de Expo lo advierte).
 * Aqui todo va a la red siempre; lo unico guardado es una pagina minima de
 * "sin conexion" para cuando abrir la app sin cobertura no deje una pantalla
 * de error del navegador.
 *
 * Si se cambia este fichero, se sube VERSION: asi se borra la cache anterior.
 */
const VERSION = 'rb-sw-1';
const OFFLINE = 'offline.html';

const PAGINA_OFFLINE = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ruta de Bares - Sin conexion</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #F6EFE2; color: #241A12; font-family: Georgia, serif; text-align: center; padding: 24px; }
  .sello { width: 88px; height: 88px; border: 3px solid #A82C24; border-radius: 50%; color: #A82C24;
           display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 800;
           margin: 0 auto 20px; transform: rotate(-8deg); }
  button { margin-top: 20px; padding: 12px 24px; border-radius: 999px; border: 1px solid #9A5A11;
           background: #C67A1E; color: #fff; font-size: 16px; font-weight: 700; }
</style></head>
<body><main>
  <div class="sello">RB</div>
  <h1>Sin conexion</h1>
  <p>Ruta de Bares necesita internet para cargar la ruta y sellar.</p>
  <button onclick="location.reload()">Reintentar</button>
</main></body></html>`;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        cache.put(OFFLINE, new Response(PAGINA_OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })),
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
  // Solo navegaciones (abrir la app, recargar). Supabase, teselas del mapa y
  // assets pasan de largo sin tocar: ni se cachean ni se retrasan.
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
