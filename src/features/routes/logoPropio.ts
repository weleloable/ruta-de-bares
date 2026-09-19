import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { anchoDestino, recorteCuadrado } from '../profile/imagenes';

/** Lado del logo guardado. El sello se pinta a 88 px como mucho: 256 da margen para pantallas 3x. */
export const LADO_LOGO = 256;
export const CALIDAD_LOGO = 0.8;

/**
 * Abre la galeria y devuelve el logo ya listo para guardar: cuadrado, 256 px,
 * JPEG y como data URL (base64). null = el usuario cancelo.
 *
 * Va como data URL y no como ruta de fichero porque se guarda en el
 * dispositivo junto al resto del bar: en nativo la ruta del picker es una
 * copia en cache que el sistema puede borrar, y en web es un blob: que muere
 * al recargar. Con el texto dentro del JSON no hay nada que se pueda perder.
 *
 * El recorte cuadrado se hace aqui y no con `allowsEditing` porque este no
 * existe en web (ver profile/api.ts, que hace lo mismo con el avatar).
 */
export async function elegirLogoBar(): Promise<string | null> {
  const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) throw new Error('Sin acceso a las fotos no se puede elegir la imagen del sello.');

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (resultado.canceled || resultado.assets.length === 0) return null;

  const { uri, width, height } = resultado.assets[0];
  const recorte = recorteCuadrado(width, height);
  const render = await ImageManipulator.manipulate(uri)
    .crop(recorte)
    .resize({ width: anchoDestino(recorte.width, LADO_LOGO) })
    .renderAsync();
  const guardado = await render.saveAsync({ format: SaveFormat.JPEG, compress: CALIDAD_LOGO, base64: true });
  if (!guardado.base64) throw new Error('No se pudo preparar la imagen. Prueba con otra.');
  return `data:image/jpeg;base64,${guardado.base64}`;
}
