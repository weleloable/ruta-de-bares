/**
 * Rutas absolutas de los ficheros de public/ segun donde viva la web.
 *
 * En localhost la app esta en la raiz; en GitHub Pages bajo /ruta-de-bares
 * (experiments.baseUrl). Expo prefija sus propios assets, pero no los enlaces
 * que se anaden a mano, asi que se calculan aqui a partir del mismo baseUrl.
 * Sin `window`, para probarla en Node.
 */
export type RutasPwa = {
  manifest: string;
  iconoApple: string;
  serviceWorker: string;
  /** Alcance del service worker: nunca mas amplio que la carpeta de la app. */
  alcance: string;
};

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
