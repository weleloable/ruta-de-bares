/** Textos del diploma, sin react-native para probarlos en Node. */

/** Medidas de diseno del diploma (px). x3 da 1080 x 1920, el formato vertical de una story de Instagram. */
export const DIPLOMA_ANCHO = 360;
export const DIPLOMA_ALTO = 640;
/** Con este factor el PNG sale a 1080 x 1920. */
export const DIPLOMA_PIXEL_RATIO = 3;

/** "Dudu ha completado:" */
export function lineaCompletado(nombre: string): string {
  return `${nombre.trim() || 'Peregrino'} ha completado:`;
}

/** El nombre de la ruta en el diploma: en mayusculas, como un titulo grabado. */
export function rutaEnDiploma(ruta: string): string {
  return ruta.trim().toLocaleUpperCase('es-ES');
}

/**
 * Cierres con guasa, con Alcala y las cigüeñas de fondo. Se elige uno por
 * persona y ruta de forma ESTABLE (el mismo diploma dice siempre lo mismo, no
 * cambia al volver a abrirlo), pero cada quien puede tener el suyo.
 */
export const CIERRES = [
  'Ni las cigüeñas aguantan este ritmo.',
  'Cervantes habría pedido otra ronda.',
  'Homologado para cualquier barra de Alcalá.',
  'Hígado en excelente estado (dentro de lo que cabe).',
] as const;

export function cierreDiploma(nombre: string, ruta: string): string {
  const semilla = `${nombre.trim()}|${ruta.trim()}`;
  let suma = 0;
  for (let i = 0; i < semilla.length; i++) suma = (suma * 31 + semilla.charCodeAt(i)) >>> 0;
  return CIERRES[suma % CIERRES.length];
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
