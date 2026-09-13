import { supabase } from '../supabase';
import type { Bar } from '../../types/domain';

interface BarRow {
  id: string;
  route_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  start_time: string;
  end_time: string;
  order_index: number;
}

function mapBar(row: BarRow): Bar {
  return {
    id: row.id,
    routeId: row.route_id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    startTime: row.start_time,
    endTime: row.end_time,
    orderIndex: row.order_index,
  };
}

/** Bares de la ruta activa. Para el mapa, la compostelana y el check-in. */
export async function listPublicBars(routeId: string): Promise<Bar[]> {
  const { data, error } = await supabase
    .from('bars_public')
    .select('*')
    .eq('route_id', routeId)
    .order('order_index', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapBar);
}

/** Solo admins (RLS): también ve bares de rutas todavía inactivas (borradores). */
export async function adminListBars(routeId: string): Promise<Bar[]> {
  const { data, error } = await supabase
    .from('bars')
    .select('*')
    .eq('route_id', routeId)
    .order('order_index', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapBar);
}

export interface NewBarInput {
  routeId: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  orderIndex: number;
}

export async function adminCreateBar(input: NewBarInput): Promise<Bar> {
  const { data, error } = await supabase
    .from('bars')
    .insert({
      route_id: input.routeId,
      name: input.name,
      address: input.address ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      start_time: input.startTime,
      end_time: input.endTime,
      order_index: input.orderIndex,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapBar(data);
}

export async function adminDeleteBar(barId: string): Promise<void> {
  const { error } = await supabase.from('bars').delete().eq('id', barId);
  if (error) throw error;
}
