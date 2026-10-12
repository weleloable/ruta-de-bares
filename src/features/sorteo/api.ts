import { supabase } from '../../lib/supabase';
import { describirErrorSorteo, type EstadoSorteo, type PersonaSorteo, type ResultadoSorteo } from './sorteo';

/** Si hay sorteo en la ruta, si estas dentro y, si ya se hizo, quien gano (0061). */
export async function leerEstadoSorteo(routeId: string): Promise<EstadoSorteo | null> {
  const { data, error } = await supabase.rpc('sorteo_estado', { p_route_id: routeId });
  // Sin la 0061 la funcion no existe: sin banner, sin avisar a nadie.
  if (error) return null;
  return data as EstadoSorteo;
}

/** Hace el sorteo (solo admins). Con `motivo`, lo repite y deja rastro. */
export async function realizarSorteo(routeId: string, motivo?: string): Promise<ResultadoSorteo> {
  const { data, error } = await supabase.rpc('sorteo_realizar', { p_route_id: routeId, p_motivo: motivo ?? null });
  if (error) throw new Error(describirErrorSorteo(error.message));
  return data as ResultadoSorteo;
}

/** La gente de la ruta, con quien esta fuera del sorteo (solo admins, 0063). Null sin la 0063. */
export async function leerPersonasSorteo(routeId: string): Promise<PersonaSorteo[] | null> {
  const { data, error } = await supabase.rpc('sorteo_personas', { p_route_id: routeId });
  if (error) return null;
  return (data ?? []) as PersonaSorteo[];
}

/** Saca a alguien del sorteo porque lo pidio (solo admins, 0063). */
export async function excluirDelSorteo(routeId: string, userId: string, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc('sorteo_excluir', { p_route_id: routeId, p_user_id: userId, p_motivo: motivo ?? null });
  if (error) throw new Error(describirErrorSorteo(error.message));
}

/** Le vuelve a meter (solo admins, 0063). */
export async function incluirEnSorteo(routeId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('sorteo_incluir', { p_route_id: routeId, p_user_id: userId });
  if (error) throw new Error(describirErrorSorteo(error.message));
}
