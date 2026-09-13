import { supabase } from '../supabase';
import type { Route } from '../../types/domain';

interface RouteRow {
  id: string;
  year: number;
  name: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

function mapRoute(row: RouteRow): Route {
  return {
    id: row.id,
    year: row.year,
    name: row.name,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** La ruta que ven todos los usuarios: la única marcada como activa. */
export async function getActiveRoute(): Promise<Route | null> {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRoute(data) : null;
}

/** Solo admins (RLS lo garantiza): todas las rutas, más recientes primero. */
export async function adminListRoutes(): Promise<Route[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .order('year', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRoute);
}

export async function adminCreateRoute(input: { year: number; name: string }): Promise<Route> {
  const { data, error } = await supabase.from('routes').insert(input).select('*').single();
  if (error) throw error;
  return mapRoute(data);
}

/** Activa esta ruta. No desactiva las demás automáticamente: hazlo explícito
 * para no dejar dos rutas activas por sorpresa. */
export async function adminSetRouteActive(routeId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('routes').update({ is_active: isActive }).eq('id', routeId);
  if (error) throw error;
}
