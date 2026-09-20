/**
 * Si la PWA ya esta instalada, a partir de las dos senales del navegador.
 * Separado de pwaInstalar.web.ts (que toca `window`) para poder probarlo en
 * Node sin DOM, igual que rutasPwa esta separado de pwa.web.ts.
 */
export function estaInstalada(modoStandalone: boolean, iosStandalone: boolean): boolean {
  return modoStandalone || iosStandalone;
}
