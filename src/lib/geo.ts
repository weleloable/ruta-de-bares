// Distancia entre dos coordenadas GPS. Puro (sin acceso a hardware) para
// poder testearlo con coordenadas conocidas. Debe dar el MISMO resultado
// que public.haversine_meters() en supabase/migrations/0001_init.sql: el
// cliente lo usa para el feedback inmediato en pantalla, el servidor para
// decidir si el check-in es válido. Si tocas uno, toca el otro.
const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/** Radio dentro del cual un bar cuenta como "estás aquí". Debe coincidir
 * con el límite usado en check_in() en el servidor. */
export const CHECK_IN_RADIUS_METERS = 10;

export function isWithinCheckInRadius(distanceMeters: number): boolean {
  return distanceMeters <= CHECK_IN_RADIUS_METERS;
}
