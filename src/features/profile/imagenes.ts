/**
 * Medidas de la foto de perfil, que se sube en dos tamanos.
 *
 * El movil sube la foto tal cual la saco la camara: en las pruebas, 2,9 MB y
 * 3000+ px de ancho. La grilla de la cana pinta una foto por persona, asi que
 * con 200 personas en una ruta eran ~574 MB de descarga para abrir la pestana
 * (y el plan gratuito de Supabase da 5 GB de trafico al mes). Con estas dos
 * medidas la misma grilla baja a ~4 MB y la foto tarda la mitad en subir desde
 * un bar con mala cobertura.
 *
 * Sin imports a proposito, como reglas.ts: node --test no sabe leer el
 * TypeScript de node_modules, asi que quien llama a expo-image-manipulator es
 * redimensionar.ts y aqui solo viven las cuentas, que si se prueban.
 *
 * Los numeros salen de medir fotos reales (ver docs/SETUP.md):
 * - miniatura 400 px: la casilla de la grilla mide 133 pt, que en una pantalla
 *   de 3x son 400 px reales. Con calidad 0,7 pesa ~19 KB y a ese tamano no se
 *   distingue del original.
 * - foto 1080 px: el ancho de la ficha a pantalla completa. ~107 KB.
 */
export const ANCHO_MINIATURA = 400;
export const CALIDAD_MINIATURA = 0.7;
export const ANCHO_FOTO = 1080;
export const CALIDAD_FOTO = 0.8;

export type Recorte = { originX: number; originY: number; width: number; height: number };

/**
 * El cuadrado centrado mas grande que cabe en la foto.
 *
 * Hace falta recortar aqui porque `allowsEditing` de ImagePicker no existe en
 * web: desde el navegador llegan fotos con la forma que tengan (3088x2316 en
 * las pruebas) y la grilla las pinta cuadradas.
 */
export function recorteCuadrado(ancho: number, alto: number): Recorte {
  const lado = Math.min(ancho, alto);
  return {
    originX: Math.round((ancho - lado) / 2),
    originY: Math.round((alto - lado) / 2),
    width: lado,
    height: lado,
  };
}

/** Nunca agranda: una foto pequena se queda como esta. */
export function anchoDestino(lado: number, maximo: number): number {
  return Math.min(lado, maximo);
}
