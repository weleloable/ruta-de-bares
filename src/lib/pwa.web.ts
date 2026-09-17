import Constants from 'expo-constants';

import { rutasPwa } from './pwa-rutas';

/**
 * Hace que la web sea instalable como PWA.
 *
 * - Enlaza manifest e icono de iOS en <head> con el prefijo correcto: Expo no
 *   reescribe public/index.html con el baseUrl de GitHub Pages.
 * - Registra un service worker que NO cachea la app (ver public/sw.js).
 *
 * No captura `beforeinstallprompt`: sin un boton propio que lo lance, lo
 * mejor es dejar que el navegador ofrezca su aviso o su menu de instalar
 * cuando el quiera.
 */

let iniciada = false;

function enlazar(rel: string, href: string) {
  if (document.head.querySelector(`link[rel="${rel}"]`)) return;
  const enlace = document.createElement('link');
  enlace.rel = rel;
  enlace.href = href;
  document.head.appendChild(enlace);
}

export function iniciarPwa(): void {
  if (iniciada || typeof window === 'undefined') return;
  iniciada = true;

  const rutas = rutasPwa(Constants.expoConfig?.experiments?.baseUrl);
  enlazar('manifest', rutas.manifest);
  enlazar('apple-touch-icon', rutas.iconoApple);

  // No en desarrollo (`expo start`): la app vive en localhost:8081 con alcance
  // "/" y el service worker se quedaria registrado para cualquier otro proyecto
  // que se sirva despues en ese puerto. Un `expo export` servido en local SI lo
  // registra (no hay forma de distinguirlo de uno publicado en la raiz).
  if (!__DEV__ && 'serviceWorker' in navigator) {
    const registrar = () => {
      navigator.serviceWorker
        .register(rutas.serviceWorker, { scope: rutas.alcance })
        .catch((error: unknown) => console.warn('[pwa] no se pudo registrar el service worker:', error));
    };
    // Si el modulo carga despues del evento load, esperar a `load` no llegaria nunca.
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
  }
}
