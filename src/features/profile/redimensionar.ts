import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { ANCHO_FOTO, ANCHO_MINIATURA, CALIDAD_FOTO, CALIDAD_MINIATURA, anchoDestino, recorteCuadrado, type Recorte } from './imagenes';

export type FotoLista = { uri: string; mimeType: string };

async function versionCuadrada(uri: string, recorte: Recorte, ancho: number, calidad: number): Promise<FotoLista> {
  // Un contexto por version: renderAsync consume el que se le pasa.
  const render = await ImageManipulator.manipulate(uri)
    .crop(recorte)
    .resize({ width: anchoDestino(recorte.width, ancho) })
    .renderAsync();
  const resultado = await render.saveAsync({ format: SaveFormat.JPEG, compress: calidad });
  return { uri: resultado.uri, mimeType: 'image/jpeg' };
}

/**
 * Devuelve la foto para la ficha y la miniatura para la grilla, las dos
 * cuadradas y en JPEG (PNG no comprime fotos y WEBP no esta en todas partes).
 */
export async function prepararAvatar(uri: string, ancho: number, alto: number): Promise<{ foto: FotoLista; miniatura: FotoLista }> {
  const recorte = recorteCuadrado(ancho, alto);
  return {
    foto: await versionCuadrada(uri, recorte, ANCHO_FOTO, CALIDAD_FOTO),
    miniatura: await versionCuadrada(uri, recorte, ANCHO_MINIATURA, CALIDAD_MINIATURA),
  };
}
