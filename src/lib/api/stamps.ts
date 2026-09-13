import { supabase } from '../supabase';
import type { Seal } from '../../types/domain';

interface SealRow {
  id: string;
  route_id: string;
  bar_id: string;
  user_id: string;
  sealed_at: string;
}

function mapSeal(row: SealRow): Seal {
  return {
    id: row.id,
    routeId: row.route_id,
    barId: row.bar_id,
    userId: row.user_id,
    sealedAt: row.sealed_at,
  };
}

/** Todos los sellos de la ruta, de todos los usuarios: base del progreso
 * de grupo compartido. RLS ya limita esto a rutas activas o a admins. */
export async function listRouteSeals(routeId: string): Promise<Seal[]> {
  const { data, error } = await supabase.from('seals').select('*').eq('route_id', routeId);
  if (error) throw error;
  return (data ?? []).map(mapSeal);
}

export type CheckInResult =
  | { ok: true; alreadySealed: boolean; barName: string }
  | { ok: false; error: 'route_or_bar_not_found' | 'too_far' | 'outside_schedule'; distanceMeters?: number };

/** Único camino para crear un sello: el servidor recalcula la distancia con
 * las coordenadas GPS enviadas y comprueba el horario del bar antes de
 * sellar. Nunca se inserta la fila directamente desde el cliente. */
export async function checkIn(params: {
  routeId: string;
  barId: string;
  latitude: number;
  longitude: number;
}): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in', {
    p_route_id: params.routeId,
    p_bar_id: params.barId,
    p_lat: params.latitude,
    p_lng: params.longitude,
  });
  if (error) throw error;

  if (data.ok) {
    return { ok: true, alreadySealed: data.already_sealed, barName: data.bar_name };
  }
  return { ok: false, error: data.error, distanceMeters: data.distance_m };
}
