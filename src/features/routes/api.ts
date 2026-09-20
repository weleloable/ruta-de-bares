import { supabase } from '../../lib/supabase';
import type { RouteBarRow, RouteRow } from '../../types/database';
import { changedPositions, type SortAssignment } from './validation';

export type RouteWithBars = { route: RouteRow; bars: RouteBarRow[] };

export type NewRoute = {
  name: string;
  description: string;
  eventDate: string | null;
  createdBy: string;
};

export type BarInput = {
  id?: string;
  routeId: string;
  sortOrder: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
  opensAt: Date;
  closesAt: Date;
  notes: string;
};

/** Rutas visibles para quien pregunta: RLS ya filtra (admin ve todo, usuario solo publicadas). */
export async function listRoutes(): Promise<RouteRow[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPublishedRoutes(): Promise<RouteRow[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('is_published', true)
    .order('event_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRouteWithBars(routeId: string): Promise<RouteWithBars | null> {
  const [rutaRes, baresRes] = await Promise.all([
    supabase.from('routes').select('*').eq('id', routeId).maybeSingle(),
    supabase.from('route_bars').select('*').eq('route_id', routeId).order('sort_order'),
  ]);
  if (rutaRes.error) throw new Error(rutaRes.error.message);
  if (baresRes.error) throw new Error(baresRes.error.message);
  if (!rutaRes.data) return null;
  return { route: rutaRes.data, bars: baresRes.data ?? [] };
}

export async function createRoute(input: NewRoute): Promise<RouteRow> {
  const { data, error } = await supabase
    .from('routes')
    .insert({
      name: input.name.trim(),
      description: input.description.trim(),
      event_date: input.eventDate,
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateRoute(
  routeId: string,
  patch: Partial<Pick<RouteRow, 'name' | 'description' | 'event_date' | 'is_published' | 'finished_at'>>,
): Promise<RouteRow> {
  const { data, error } = await supabase
    .from('routes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', routeId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRoute(routeId: string): Promise<void> {
  const { error } = await supabase.from('routes').delete().eq('id', routeId);
  if (error) throw new Error(error.message);
}

export async function saveBar(input: BarInput): Promise<RouteBarRow> {
  const fila = {
    route_id: input.routeId,
    sort_order: input.sortOrder,
    name: input.name.trim(),
    address: input.address.trim(),
    lat: input.lat,
    lng: input.lng,
    radius_m: input.radiusM,
    opens_at: input.opensAt.toISOString(),
    closes_at: input.closesAt.toISOString(),
    notes: input.notes.trim(),
  };

  const query = input.id
    ? supabase.from('route_bars').update(fila).eq('id', input.id)
    : supabase.from('route_bars').insert(fila);

  const { data, error } = await query.select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteBar(barId: string): Promise<void> {
  const { error } = await supabase.from('route_bars').delete().eq('id', barId);
  if (error) throw new Error(error.message);
}

/** Siguiente sort_order libre de la ruta. */
export function nextSortOrder(bars: readonly RouteBarRow[]): number {
  return bars.reduce((max, bar) => Math.max(max, bar.sort_order + 1), 0);
}

/**
 * Persiste un reordenamiento completo, en dos pasadas.
 *
 * La unique (route_id, sort_order) es DEFERRABLE en el SQL, pero PostgREST
 * manda cada update en su propia transaccion, asi que el diferido no sirve de
 * nada aqui: a mitad de camino dos filas comparten sort_order y la peticion
 * que colisiona falla.
 *
 * Solucion: primera pasada a sort_order + 100000, un rango que ninguna ruta
 * real usa, asi que no choca con nada; segunda pasada a los valores finales,
 * que ya estan libres. Los numeros son ALTOS y no negativos porque el CHECK
 * de la tabla exige sort_order >= 0 en cada statement, tambien en el intermedio.
 */
export async function persistOrder(
  routeId: string,
  ordered: readonly SortAssignment[],
  previous: ReadonlyMap<string, number>,
): Promise<void> {
  const OFFSET = 100000;
  const cambiados = changedPositions(ordered, previous);
  if (cambiados.length === 0) return;

  for (const bar of cambiados) {
    const { error } = await supabase
      .from('route_bars')
      .update({ sort_order: bar.sort_order + OFFSET })
      .eq('id', bar.id)
      .eq('route_id', routeId);
    if (error) throw new Error(error.message);
  }

  for (const bar of cambiados) {
    const { error } = await supabase
      .from('route_bars')
      .update({ sort_order: bar.sort_order })
      .eq('id', bar.id)
      .eq('route_id', routeId);
    if (error) throw new Error(error.message);
  }
}
