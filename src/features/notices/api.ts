import { supabase } from '../../lib/supabase';
import type { MyRestrictionsRow, UserNoticeRow } from '../../types/database';

/**
 * Los avisos de moderacion que recibe una persona (0015).
 *
 * Todo pasa por funciones `SECURITY DEFINER` que miran `auth.uid()`: las tablas
 * no tienen privilegios para la app, asi que nadie puede leer los avisos de
 * otra persona ni inventarse uno.
 */

export async function listarAvisos(): Promise<UserNoticeRow[]> {
  const { data, error } = await supabase.rpc('my_notices');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Solo el numero de sin leer, para la burbujita de Mi perfil. */
export async function contarAvisos(): Promise<number> {
  const { data, error } = await supabase.rpc('my_notice_count');
  if (error) throw new Error(error.message);
  return data ?? 0;
}

/**
 * Marca leidos todos los suyos. Se llama al ABRIR la pantalla: la fecha de
 * lectura es la prueba de que se le comunico, asi que no depende de que pulse
 * nada, y no se puede deshacer.
 */
export async function marcarAvisosLeidos(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notices_read');
  if (error) throw new Error(error.message);
  return data ?? 0;
}

/** Que le impide usar la app ahora mismo, para poder decirselo donde toca. */
export async function misRestricciones(): Promise<MyRestrictionsRow> {
  const { data, error } = await supabase.rpc('my_restrictions');
  if (error) throw new Error(error.message);
  const [fila] = data ?? [];
  return (
    fila ?? {
      suspended: false,
      suspended_reason: '',
      suspended_at: null,
      cana_blocked: false,
      cana_reason: '',
    }
  );
}
