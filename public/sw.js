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
 * Ademas ensena los avisos en el movil (0064): los manda la Edge Function
 * `enviar-avisos` con {titulo, cuerpo, url, tag}, y al tocarlos se abre la app
 * en esa pantalla. Cada tipo de aviso lleva su icono (icono-aviso.js decide
 * cual; los PNG los genera scripts/generar-iconos-avisos.mjs).
 *
 * Si se cambia este fichero, se sube VERSION: asi se borra la cache anterior.
 */
const VERSION = 'rb-sw-4';
const OFFLINE = 'offline.html';
// URL absoluta y no relativa: la pagina sin conexion se sirve en CUALQUIER ruta
// (/editor/123 tambien), y un src relativo apuntaria a otro sitio. Sale de
// donde vive este fichero, asi vale en localhost (/) y en Pages (/ruta-de-bares/).
const ICONO = new URL('icons/icon-192.png', self.location).href;
// La silueta de la barra de estado de Android (la pinta en un solo color).
const BADGE = new URL('icons/avisos/badge.png', self.location).href;

// Define self.iconoDeAviso. Si no carga, los avisos salen con el icono de la app.
try {
  importScripts('icono-aviso.js');
} catch (_) {
  self.iconoDeAviso = () => null;
}

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

// Un aviso que llega (0064). Si el contenido no se entiende, sale igual con el
// nombre de la app: el navegador exige ensenar algo por cada push recibido.
self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch (_) {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }
  let icono = ICONO;
  try {
    const nombre = self.iconoDeAviso(datos);
    if (nombre) icono = new URL(`icons/avisos/${nombre}.png`, self.location).href;
  } catch (_) {
    // Un aviso raro sale con el icono de la app: mejor eso que no salir.
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || 'Ruta de Bares', {
      body: datos.cuerpo || '',
      icon: icono,
      badge: BADGE,
      tag: datos.tag,
      renotify: Boolean(datos.tag),
      data: { url: datos.url || '/' },
    }),
  );
});

// Al tocarlo: si la app ya esta abierta, se trae delante y va a esa pantalla;
// si no, se abre. La url ('/cana') es relativa a donde vive la app.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const ruta = String((evento.notification.data && evento.notification.data.url) || '/').replace(/^\//, '');
  const destino = new URL(ruta, self.registration.scope).href;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.registration.scope));
      if (abierta) {
        return abierta.focus().then((v) => (v && 'navigate' in v ? v.navigate(destino) : v));
      }
      return self.clients.openWindow(destino);
    }),
  );
});
