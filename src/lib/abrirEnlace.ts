import { Linking } from 'react-native';

/**
 * Abre un enlace externo (Instagram/Telegram si estan instaladas, si no el
 * navegador). Vive en su propio modulo y no en enlacesExternos.ts porque
 * importar 'react-native' rompe `node --test` en cualquier fichero con test
 * (ver el comentario de enlacesExternos.ts). Sin Alert si falla
 * (tests/sin-alert.test.ts lo prohibe en toda la app): el boton simplemente no
 * hace nada en vez de romper la pantalla.
 */
export function abrirEnlaceExterno(url: string): void {
  Linking.openURL(url).catch(() => undefined);
}
