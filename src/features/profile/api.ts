import * as ImagePicker from 'expo-image-picker';

import { supabase } from '../../lib/supabase';
import type { ProfileRow } from '../../types/database';
import { rutasDeFotos, textoDeImpedimentos, traducirErrorBorrado } from './borrarCuenta';
import {
  nombresFicheroAvatar,
  traducirErrorFoto,
  type ResultadoEnvioFoto,
  type SolicitudFotoPropia,
} from './fotoRevision';
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
    // Sin upsert: un fichero ya enviado a revision no se puede sobrescribir (la
    // policy de UPDATE se quito en la 0020) y el nombre es nuevo cada vez.
    .upload(ruta, bytes, { contentType: foto.mimeType, upsert: false });
  if (error) throw new Error(error.message);

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(ruta).data.publicUrl;
}

/**
 * Sube la foto en dos tamanos (ficha y miniatura) y la ENVIA A REVISION.
 *
 * Ya no escribe profiles.avatar_url: el servidor lo impide (0020,
 * guard_profile_avatar). La foto nueva solo se pone cuando un admin la aprueba,
 * y hasta entonces se sigue viendo la anterior. Un admin se auto-aprueba: para
 * eso el servidor necesita las URL, que solo usa si quien llama es admin.
 *
 * El nombre es `<uid>/avatar-<hora>-<azar>.jpg` (fotoRevision.ts): la policy de
 * storage exige el uid como primera carpeta, y el azar hace que la foto
 * pendiente, ya legible por URL en un bucket publico, no se pueda adivinar.
 * La miniatura es la que pinta la grilla de la cana (ver imagenes.ts).
 */
export async function uploadAvatar(userId: string, image: PickedImage): Promise<ResultadoEnvioFoto> {
  const { foto, miniatura } = await prepararAvatar(image.uri, image.width, image.height);
  const nombres = nombresFicheroAvatar(userId, Date.now(), Math.random);

  const fotoUrl = await subirFichero(nombres.foto, foto);
  const thumbUrl = await subirFichero(nombres.miniatura, miniatura);

  const { data, error } = await supabase.rpc('avatar_request_submit', {
    p_foto_path: nombres.foto,
    p_thumb_path: nombres.miniatura,
    p_foto_url: fotoUrl,
    p_thumb_url: thumbUrl,
  });
  if (error) throw new Error(traducirErrorFoto(error.message));
  return data;
}

/**
 * La ultima solicitud de foto de esta persona (la RLS solo le deja ver las
 * suyas), para que Mi perfil diga "en revision" o el motivo del rechazo. Las
 * sustituidas no cuentan: la persona ya subio otra. null si nunca envio ninguna.
 */
export async function ultimaSolicitudFoto(userId: string): Promise<SolicitudFotoPropia | null> {
  const { data, error } = await supabase
    .from('avatar_requests')
    .select('id, status, reason, created_at')
    .eq('user_id', userId)
    .neq('status', 'sustituida')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Borra la cuenta y todos los datos de quien llama (0021, delete_my_account).
 *
 * Las fotos van PRIMERO y desde aqui: Storage no se deja borrar por SQL, y una
 * vez borrada la cuenta la persona ya no podria ni intentarlo. El orden tiene un
 * coste asumido: si la llamada final falla (sin red), la persona se queda sin
 * fotos pero con cuenta y puede volver a pulsar. Lo contrario, una cuenta
 * borrada con sus fotos publicas colgando para siempre, no tiene arreglo.
 *
 * Storage.remove NO da error cuando la policy le impide borrar un fichero: solo
 * devuelve menos de los pedidos. Por eso se cuenta lo devuelto y se vuelve a
 * listar al final, en vez de fiarse de que no hubo error.
 */
export async function deleteMyAccount(userId: string): Promise<void> {
  // Antes de tocar nada: si la cuenta no se puede borrar (admin, denuncia sin
  // resolver...), las fotos no se pierden para nada.
  const { data: impedimentos, error: errorPrevio } = await supabase.rpc('delete_my_account_blockers');
  if (errorPrevio) throw new Error(traducirErrorBorrado(errorPrevio.message));
  const motivo = textoDeImpedimentos(impedimentos ?? []);
  if (motivo) throw new Error(motivo);

  const carpeta = supabase.storage.from(AVATAR_BUCKET);

  // Acotado a proposito: sin tope, una policy que impida borrar dejaria el bucle
  // girando para siempre.
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const { data: ficheros, error } = await carpeta.list(userId, { limit: 100 });
    if (error) throw new Error(error.message);
    const rutas = rutasDeFotos(userId, (ficheros ?? []).map((f) => f.name));
    if (rutas.length === 0) break;
    const { data: borrados, error: errorBorrado } = await carpeta.remove(rutas);
    if (errorBorrado) throw new Error(errorBorrado.message);
    if ((borrados ?? []).length < rutas.length) {
      throw new Error('No se pudieron borrar todas tus fotos. Prueba otra vez.');
    }
  }
  const { data: quedan, error: errorFinal } = await carpeta.list(userId, { limit: 1 });
  if (errorFinal) throw new Error(errorFinal.message);
  if ((quedan ?? []).length > 0) throw new Error('No se pudieron borrar todas tus fotos. Prueba otra vez.');

  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(traducirErrorBorrado(error.message));

  // Local y no global: en el servidor la sesion ya no existe, y un cierre global
  // fallaria. Quita la sesion guardada y AuthGate lleva al login.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

/**
 * TODO lo que la app guarda de ti, en un JSON (RGPD art. 15, migracion 0025).
 *
 * No es lo mismo que `exportMyMatchData`, que solo saca el trozo de la cana y
 * era lo unico que habia: faltaban el perfil, los sellos con sus coordenadas,
 * las rutas, las fotos enviadas a revision, los avisos de moderacion y las
 * sanciones con el HMAC del correo. Esta funcion los mete todos, y llama a la
 * de la cana para el resto.
 */
export async function exportMyData(): Promise<unknown> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw new Error(error.message);
  return data;
}
