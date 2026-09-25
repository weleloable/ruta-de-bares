/**
 * URLs externas de la ruta (Instagram, el grupo de Telegram), en su propio
 * modulo para poder fijarlas con un test: una URL mal pegada al copiar es un
 * bug real y mudo (el boton no falla, simplemente lleva a otro sitio).
 *
 * Sin Linking aqui a proposito: `import ... from 'react-native'` rompe
 * `node --test` (react-native trae sintaxis Flow que el borrador de tipos de
 * Node no entiende, y falla al importar el modulo aunque no se llegue a usar
 * lo importado). Por eso abrir el enlace de verdad vive en la propia pantalla
 * (app/(tabs)/index.tsx), que ningun test importa como modulo — solo lee su
 * codigo como texto.
 */
export const INSTAGRAM_URL = 'https://www.instagram.com/rutadebaresoficial/';
export const TELEGRAM_URL = 'https://t.me/+WYZC4FDOKKcyMDNk';
