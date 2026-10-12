import { supabase } from '../../lib/supabase';

/** Que avisos quiere cada uno (0064). Todo activado por defecto. */
export type PreferenciasAvisos = { paradas: boolean; sorteo: boolean; cana: boolean };

/** Null si falta la 0064. */
export async function leerPreferenciasAvisos(): Promise<PreferenciasAvisos | null> {
  const { data, error } = await supabase.rpc('push_preferencias_leer');
  if (error || !data) return null;
  const d = data as PreferenciasAvisos;
  return { paradas: d.paradas, sorteo: d.sorteo, cana: d.cana };
}

export async function guardarPreferenciasAvisos(p: PreferenciasAvisos): Promise<void> {
  const { error } = await supabase.rpc('push_preferencias_guardar', { p_paradas: p.paradas, p_sorteo: p.sorteo, p_cana: p.cana });
  if (error) throw new Error('No se pudo guardar. Inténtalo otra vez.');
}
