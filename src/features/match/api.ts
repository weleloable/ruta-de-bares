import { supabase } from '../../lib/supabase';
import type { MatchCatalogRow, MatchProfileState } from '../../types/database';
import { describirErrorCana } from './reglas';

/**
 * Llamadas de "Tirate una cana". Solo funciones match_* y los catalogos: las
 * tablas no tienen privilegios para la app (ver 0003_tirate_una_cana.sql).
 * Cada error sale ya traducido para ensenarlo tal cual.
 */

function fallo(error: { message: string }): never {
  throw new Error(describirErrorCana(error.message));
}

export async function getMatchProfile(): Promise<MatchProfileState> {
  const { data, error } = await supabase.rpc('match_get_profile');
  if (error) fallo(error);
  const [perfil] = data ?? [];
  if (!perfil) throw new Error('No se pudo leer tu perfil cervecero.');
  return perfil;
}

/**
 * Activa la feature. La primera vez hace falta todo (mayoria de edad, frase y
 * etiquetas); despues basta sin argumentos, porque desactivar es una pausa.
 */
export async function activateMatch(primeraVez?: {
  mayorDeEdad: boolean;
  bio: string;
  etiquetas: string[];
}): Promise<void> {
  const { error } = await supabase.rpc(
    'match_activate',
    primeraVez
      ? { p_adult_confirmed: primeraVez.mayorDeEdad, p_bio: primeraVez.bio, p_tag_ids: primeraVez.etiquetas }
      : {},
  );
  if (error) fallo(error);
}

export async function deactivateMatch(): Promise<void> {
  const { error } = await supabase.rpc('match_deactivate');
  if (error) fallo(error);
}

export async function updateMatchProfile(bio: string, etiquetas: string[]): Promise<void> {
  const { error } = await supabase.rpc('match_update_profile', { p_bio: bio, p_tag_ids: etiquetas });
  if (error) fallo(error);
}

export async function listMatchTags(): Promise<MatchCatalogRow[]> {
  const { data, error } = await supabase.from('match_tags').select('*').order('sort_order');
  if (error) fallo(error);
  return data ?? [];
}
