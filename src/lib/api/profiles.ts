import { supabase } from '../supabase';

export interface PublicProfile {
  id: string;
  displayName: string;
}

/** Nombre visible de cada miembro del grupo (profiles_public: sin email ni rol). */
export async function listPublicProfiles(): Promise<PublicProfile[]> {
  const { data, error } = await supabase.from('profiles_public').select('*');
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, displayName: row.display_name }));
}
