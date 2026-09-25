/** Textos del diploma, sin react-native para probarlos en Node. */

/** Medidas de diseno del diploma (px). x3 da 1080 x 1920, el formato vertical de una story de Instagram. */
export const DIPLOMA_ANCHO = 360;
export const DIPLOMA_ALTO = 640;
/** Con este factor el PNG sale a 1080 x 1920. */
export const DIPLOMA_PIXEL_RATIO = 3;

/** "Dudu ha finalizado la Ruta de Bares 26 con honores." */
export function fraseDiploma(nombre: string, ruta: string): string {
  const quien = nombre.trim() || 'Peregrino';
  return `${quien} ha finalizado la ${ruta.trim()} con honores.`;
}

/** Nombre del fichero al guardar: sin espacios ni caracteres raros, con la ruta. */
export function nombreFicheroDiploma(ruta: string): string {
  const limpio = ruta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `diploma-${limpio || 'ruta'}.png`;
}
