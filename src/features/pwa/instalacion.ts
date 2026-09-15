/**
 * Logica pura de la app instalable (PWA): que rutas usar y que ensenar en el
 * boton de instalar. Sin `window` ni React, para probarla en Node.
 */

export type Plataforma = 'ios' | 'android' | 'escritorio';

export type EstadoInstalacion =
  /** App nativa: no hay nada que instalar desde aqui. */
  | { tipo: 'no-web' }
  /** Ya se abre como app (pantalla completa) o se acaba de instalar. */
  | { tipo: 'instalada' }
  /** El navegador ofrece instalar con un toque (Chrome/Edge en Android y escritorio). */
  | { tipo: 'boton' }
  /** No hay aviso del navegador: se explica como hacerlo a mano. */
  | { tipo: 'instrucciones'; plataforma: Plataforma; pasos: string[] };

/**
 * iPadOS 13+ se presenta como "Macintosh" en el userAgent; lo que lo delata
 * es que tiene pantalla tactil (un Mac no).
 */
export function detectarPlataforma(userAgent: string, maxTouchPoints: number): Plataforma {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'escritorio';
}

const PASOS: Record<Plataforma, string[]> = {
  // iOS no tiene boton de instalar ni aviso: solo el menu Compartir.
  ios: [
    'Abre esta pagina en Safari.',
    'Pulsa el boton Compartir (el cuadrado con una flecha hacia arriba).',
    'Elige "Anadir a pantalla de inicio" y confirma.',
  ],
  android: [
    'Abre el menu del navegador (los tres puntos de arriba a la derecha).',
    'Pulsa "Instalar aplicacion" o "Anadir a pantalla de inicio".',
  ],
  escritorio: [
    'En Chrome o Edge, pulsa el icono de instalar de la barra de direcciones.',
    'O abre el menu del navegador y elige "Instalar Ruta de Bares".',
  ],
};

export function estadoInstalacion(entrada: {
  esWeb: boolean;
  standalone: boolean;
  hayAvisoInstalacion: boolean;
  userAgent: string;
  maxTouchPoints: number;
}): EstadoInstalacion {
  if (!entrada.esWeb) return { tipo: 'no-web' };
  if (entrada.standalone) return { tipo: 'instalada' };
  if (entrada.hayAvisoInstalacion) return { tipo: 'boton' };
  const plataforma = detectarPlataforma(entrada.userAgent, entrada.maxTouchPoints);
  return { tipo: 'instrucciones', plataforma, pasos: PASOS[plataforma] };
}

export type RutasPwa = {
  manifest: string;
  iconoApple: string;
  serviceWorker: string;
  /** Alcance del service worker: nunca mas amplio que la carpeta de la app. */
  alcance: string;
};

/**
 * Rutas absolutas de los ficheros de public/ segun donde viva la web.
 *
 * En localhost la app esta en la raiz; en GitHub Pages bajo /ruta-de-bares
 * (experiments.baseUrl). Expo prefija sus propios assets, pero no los enlaces
 * que se anaden a mano, asi que se calculan aqui a partir del mismo baseUrl.
 */
export function rutasPwa(baseUrl: string | null | undefined): RutasPwa {
  const limpio = (baseUrl ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  const prefijo = limpio === '' ? '' : `/${limpio}`;
  return {
    manifest: `${prefijo}/manifest.json`,
    iconoApple: `${prefijo}/icons/apple-touch-icon.png`,
    serviceWorker: `${prefijo}/sw.js`,
    alcance: `${prefijo}/`,
  };
}
