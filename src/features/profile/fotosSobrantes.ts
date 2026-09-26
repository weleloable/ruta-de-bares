import { supabase } from '../../lib/supabase';

const AVATAR_BUCKET = 'avatars';

/**
 * Borra de Storage las fotos que ya no usa nadie (0032): sustituidas,
 * rechazadas, retiradas y pruebas ya liberadas.
 *
 * QUE sobra lo decide el servidor (`mis_fotos_sobrantes` / `avatar_admin_sobrantes`)
 * y la app solo borra lo que le devuelven: desde SQL no se puede borrar un
 * fichero de Storage. Aunque la app se equivocara de lista, la policy de
 * borrado no deja tocar una prueba sin liberar ni fotos ajenas (a quien no es
 * admin).
 *
 * Se llama justo despues de lo que puede dejar una foto sin uso: enviar otra,
 * aprobar o rechazar, liberar una prueba, borrar una ruta.
 *
 * Nunca lanza: limpiar es una consecuencia, no la accion que pidio nadie. Si
 * falla (sin red), lo que quedo se recoge en la siguiente limpieza, porque la
 * de un admin mira todo el bucket.
 */
export async function borrarFotosSobrantes(de: 'mias' | 'todas'): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(de === 'mias' ? 'mis_fotos_sobrantes' : 'avatar_admin_sobrantes');
    if (error || !data || data.length === 0) return 0;
    const { data: borrados } = await supabase.storage.from(AVATAR_BUCKET).remove(data);
    return borrados?.length ?? 0;
  } catch {
    return 0;
  }
}
