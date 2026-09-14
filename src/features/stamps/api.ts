import * as Location from 'expo-location';

import { supabase } from '../../lib/supabase';
import type { StampRow } from '../../types/database';
import { describeVerdict, verdictFromServerError, type LatLng } from './rules';

export async function listMyStamps(userId: string): Promise<StampRow[]> {
  const { data, error } = await supabase
    .from('stamps')
    .select('*')
    .eq('user_id', userId)
    .order('stamped_at');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export class LocationDeniedError extends Error {
  constructor() {
    super('Sin permiso de ubicacion no se puede sellar. Actívalo en los ajustes del movil.');
    this.name = 'LocationDeniedError';
  }
}

/** Pide permiso si hace falta y devuelve la posicion actual. */
export async function getCurrentPosition(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) throw new LocationDeniedError();

  const posicion = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return { lat: posicion.coords.latitude, lng: posicion.coords.longitude };
}

/**
 * Sella un bar. Toda la decision la toma public.claim_stamp en el servidor;
 * aqui solo se traduce el error que devuelve a algo legible.
 */
export async function claimStamp(barId: string, position: LatLng): Promise<StampRow> {
  const { data, error } = await supabase.rpc('claim_stamp', {
    p_route_bar_id: barId,
    p_lat: position.lat,
    p_lng: position.lng,
  });

  if (error) {
    const verdict = verdictFromServerError(error.message);
    if (verdict) throw new Error(describeVerdict(verdict));
    if (error.message.includes('ROUTE_NOT_PUBLISHED')) {
      throw new Error('Esta ruta todavia no esta publicada.');
    }
    if (error.message.includes('BAR_NOT_FOUND')) {
      throw new Error('Ese bar ya no existe en la ruta.');
    }
    throw new Error(error.message);
  }

  return data as StampRow;
}
