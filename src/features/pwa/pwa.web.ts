import Constants from 'expo-constants';
import { useEffect, useState } from 'react';

import { estadoInstalacion, rutasPwa, type EstadoInstalacion } from './instalacion';

/**
 * App instalable (PWA) en web.
 *
 * - Enlaza manifest e icono de iOS en <head> con el prefijo correcto: Expo no
 *   reescribe public/index.html con el baseUrl de GitHub Pages.
 * - Registra un service worker que NO cachea la app (ver public/sw.js).
 * - Guarda el aviso `beforeinstallprompt` del navegador para que el boton
 *   "Instalar" de Mi perfil lo lance cuando el usuario quiera. El aviso llega
 *   una vez, al cargar: si nadie lo escucha en ese momento, se pierde. Por eso
 *   iniciarPwa() se llama al cargar el modulo del layout raiz, no en un efecto.
 */

type AvisoInstalacion = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let aviso: AvisoInstalacion | null = null;
let pidiendoInstalacion = false;
let instaladaAhora = false;
let iniciada = false;
const oyentes = new Set<() => void>();

function notificar() {
  for (const oyente of oyentes) oyente();
}

function enlazar(rel: string, href: string) {
  if (document.head.querySelector(`link[rel="${rel}"]`)) return;
  const enlace = document.createElement('link');
  enlace.rel = rel;
  enlace.href = href;
  document.head.appendChild(enlace);
}

function abiertaComoApp(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export function iniciarPwa(): void {
  if (iniciada || typeof window === 'undefined') return;
  iniciada = true;

  const rutas = rutasPwa(Constants.expoConfig?.experiments?.baseUrl);
  enlazar('manifest', rutas.manifest);
  enlazar('apple-touch-icon', rutas.iconoApple);

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin preventDefault Chrome ensena su propia barra en un momento que no
    // elegimos; asi se queda guardado para el boton.
    evento.preventDefault();
    aviso = evento as AvisoInstalacion;
    notificar();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    instaladaAhora = true;
    notificar();
  });

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

export function useInstalacion(): { estado: EstadoInstalacion; instalando: boolean; instalar(): Promise<void> } {
  const [, repintar] = useState(0);

  useEffect(() => {
    const oyente = () => repintar((n) => n + 1);
    oyentes.add(oyente);
    return () => {
      oyentes.delete(oyente);
    };
  }, []);

  const estado = estadoInstalacion({
    esWeb: true,
    standalone: instaladaAhora || abiertaComoApp(),
    hayAvisoInstalacion: aviso !== null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });

  async function instalar() {
    const actual = aviso;
    // Un segundo toque con el dialogo abierto haria rechazar prompt() y su
    // finally borraria el aviso con el primer dialogo aun en pantalla.
    if (!actual || pidiendoInstalacion) return;
    pidiendoInstalacion = true;
    notificar();
    try {
      await actual.prompt();
      const { outcome } = await actual.userChoice;
      if (outcome === 'accepted') instaladaAhora = true;
    } catch (error) {
      // prompt() rechaza si el aviso ya se uso o el navegador lo invalida. Sin
      // esto el boton se quedaria ahi sin hacer nada; asi pasan a verse los pasos.
      console.warn('[pwa] el navegador rechazo el aviso de instalacion:', error);
    } finally {
      // El aviso solo sirve una vez, se acepte, se rechace o falle.
      aviso = null;
      pidiendoInstalacion = false;
      notificar();
    }
  }

  return { estado, instalando: pidiendoInstalacion, instalar };
}
