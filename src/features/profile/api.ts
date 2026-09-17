import * as ImagePicker from 'expo-image-picker';

import { supabase } from '../../lib/supabase';
import type { ProfileRow } from '../../types/database';

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

export type PickedImage = { uri: string; mimeType: string };

/** Abre la galeria recortando en cuadrado. null = el usuario cancelo. */
export async function pickAvatar(): Promise<PickedImage | null> {
  const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) {
    throw new Error('Sin acceso a las fotos no se puede cambiar la imagen de perfil.');
  }

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (resultado.canceled || resultado.assets.length === 0) return null;
  const asset = resultado.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/**
 * Sube la imagen y devuelve su URL publica.
 *
 * La ruta es `<uid>/avatar-<timestamp>.<ext>`: la policy de storage exige que la
 * primera carpeta sea el uid, y el timestamp evita que la CDN sirva la foto
 * anterior cacheada.
 */
export async function uploadAvatar(userId: string, image: PickedImage): Promise<string> {
  const extension = image.mimeType.includes('png') ? 'png' : 'jpg';
  const ruta = `${userId}/avatar-${Date.now()}.${extension}`;

  // fetch(uri).arrayBuffer() es la via soportada en React Native: no hay
  // File/Blob nativos fiables, y supabase-js acepta ArrayBuffer directamente.
  const respuesta = await fetch(image.uri);
  if (!respuesta.ok) throw new Error('No se pudo leer la imagen elegida.');
  const bytes = await respuesta.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(ruta, bytes, { contentType: image.mimeType, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(ruta);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: data.publicUrl })
    .eq('id', userId);
  if (profileError) throw new Error(profileError.message);

  return data.publicUrl;
}
