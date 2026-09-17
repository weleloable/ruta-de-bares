import * as ImagePicker from 'expo-image-picker';

import { supabase } from '../../lib/supabase';
import type { ProfileRow } from '../../types/database';
import { prepararAvatar, type FotoLista } from './redimensionar';

export { initials } from './initials';

const AVATAR_BUCKET = 'avatars';

/**
 * Espejo de la regla real: profiles_display_name_formato y el indice unico de
 * lower(display_name) en supabase/migrations/0003_nombre_unico.sql son quienes
 * de verdad la imponen. Sin espacios (el input tampoco deja escribirlos) y
 * <= 30 caracteres.
 */
export async function updateDisplayName(userId: string, displayName: string): Promise<ProfileRow> {
  const nombre = displayName.replace(/\s/g, '').slice(0, 30);
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: nombre })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) {
    // 23505 = unique_violation: el indice de lower(display_name) es quien lo sabe de verdad.
    if (error.code === '23505') throw new Error('Ya hay un rutero con ese nombre, melón.');
    throw new Error(error.message);
  }
  return data;
}

export type PickedImage = { uri: string; mimeType: string; width: number; height: number };

/** Abre la galeria recortando en cuadrado. null = el usuario cancelo. */
export async function pickAvatar(): Promise<PickedImage | null> {
  const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) {
    throw new Error('Sin acceso a las fotos no se puede cambiar la imagen de perfil.');
  }

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Solo recorta en nativo; en web no existe, por eso el cuadrado se recorta
    // despues con recorteCuadrado (imagenes.ts).
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (resultado.canceled || resultado.assets.length === 0) return null;
  const asset = resultado.assets[0];
  // La calidad se aplica al guardar las dos versiones, no aqui: comprimir dos
  // veces (picker + manipulator) ensucia la foto sin ahorrar nada.
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', width: asset.width, height: asset.height };
}

async function subirFichero(ruta: string, foto: FotoLista): Promise<string> {
  // fetch(uri).arrayBuffer() es la via soportada en React Native: no hay
  // File/Blob nativos fiables, y supabase-js acepta ArrayBuffer directamente.
  const respuesta = await fetch(foto.uri);
  if (!respuesta.ok) throw new Error('No se pudo leer la imagen elegida.');
  const bytes = await respuesta.arrayBuffer();

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(ruta, bytes, { contentType: foto.mimeType, upsert: true });
  if (error) throw new Error(error.message);

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(ruta).data.publicUrl;
}

/**
 * Sube la foto en dos tamanos (ficha y miniatura) y devuelve sus URLs.
 *
 * La ruta es `<uid>/avatar-<timestamp>.jpg`: la policy de storage exige que la
 * primera carpeta sea el uid, y el timestamp evita que la CDN sirva la foto
 * anterior cacheada. La miniatura es la que pinta la grilla de la cana, donde
 * se ven todas las fotos de la ruta a la vez (ver imagenes.ts).
 */
export async function uploadAvatar(userId: string, image: PickedImage): Promise<{ avatarUrl: string; thumbUrl: string }> {
  const { foto, miniatura } = await prepararAvatar(image.uri, image.width, image.height);
  const sello = Date.now();

  const avatarUrl = await subirFichero(`${userId}/avatar-${sello}.jpg`, foto);
  const thumbUrl = await subirFichero(`${userId}/avatar-${sello}-mini.jpg`, miniatura);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl, avatar_thumb_url: thumbUrl })
    .eq('id', userId);
  if (profileError) throw new Error(profileError.message);

  return { avatarUrl, thumbUrl };
}
