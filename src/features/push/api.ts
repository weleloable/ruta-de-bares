import { supabase } from '../../lib/supabase';

/**
 * Que avisos quiere cada uno (0064). Todo activado por defecto. `admin` (0066,
 * moderacion pendiente) solo viene para quien administra: sin la 0066, o para
 * el resto, no esta.
 */
export type PreferenciasAvisos = { paradas: boolean; sorteo: boolean; cana: boolean; anuncios?: boolean; admin?: boolean };

/** Null si falta la 0064. */
export async function leerPreferenciasAvisos(): Promise<PreferenciasAvisos | null> {
  const { data, error } = await supabase.rpc('push_preferencias_leer');
  if (error || !data) return null;
  const d = data as PreferenciasAvisos;
  return {
    paradas: d.paradas,
    sorteo: d.sorteo,
    cana: d.cana,
    // `anuncios` llega con la 0074; sin ella, la casilla no sale.
    ...(typeof d.anuncios === 'boolean' ? { anuncios: d.anuncios } : {}),
    ...(typeof d.admin === 'boolean' ? { admin: d.admin } : {}),
  };
}

export async function guardarPreferenciasAvisos(p: PreferenciasAvisos): Promise<void> {
  const { error } = await supabase.rpc('push_preferencias_guardar', { p_paradas: p.paradas, p_sorteo: p.sorteo, p_cana: p.cana });
  if (error) throw new Error('No se pudo guardar. Inténtalo otra vez.');
}

/** Los anuncios de la organizacion a la ruta (0074). */
export async function guardarAvisoAnuncios(activado: boolean): Promise<void> {
  const { error } = await supabase.rpc('push_preferencias_anuncios_guardar', { p_anuncios: activado });
  if (error) throw new Error('No se pudo guardar. Inténtalo otra vez.');
}

/** El aviso de moderacion pendiente (0066): solo admins; al resto el servidor le dice FORBIDDEN. */
export async function guardarAvisoAdmin(activado: boolean): Promise<void> {
  const { error } = await supabase.rpc('push_preferencias_admin_guardar', { p_admin: activado });
  if (error) throw new Error('No se pudo guardar. Inténtalo otra vez.');
}
