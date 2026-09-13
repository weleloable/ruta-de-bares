import { supabase } from '../supabase';
import type { StampPayload } from '../qr';
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

export async function listMySeals(routeId: string, userId: string): Promise<Seal[]> {
  const all = await listRouteSeals(routeId);
  return all.filter((s) => s.userId === userId);
}

export type RedeemStampResult =
  | { ok: true; alreadySealed: boolean; barName: string }
  | { ok: false; error: 'route_or_bar_not_found' | 'invalid_secret' };

/** Único camino para crear un sello: valida el secreto del QR en el
 * servidor (función redeem_stamp, security definer) y nunca inserta la
 * fila directamente desde el cliente. */
export async function redeemStamp(payload: StampPayload): Promise<RedeemStampResult> {
  const { data, error } = await supabase.rpc('redeem_stamp', {
    p_route_id: payload.routeId,
    p_bar_id: payload.barId,
    p_secret: payload.secret,
  });
  if (error) throw error;

  if (data.ok) {
    return { ok: true, alreadySealed: data.already_sealed, barName: data.bar_name };
  }
  return { ok: false, error: data.error };
}
