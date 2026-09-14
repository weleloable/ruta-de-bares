/**
 * Reglas de sellado. Espejo EXACTO de public.claim_stamp en
 * supabase/migrations/0001_init.sql.
 *
 * El servidor es la autoridad: es quien decide si el sello se crea. Esta copia
 * en cliente existe solo para la UI (habilitar el boton, decir "te faltan 40 m",
 * "abre en 25 min") sin ir al servidor a cada segundo. Si las dos discrepan,
 * manda el SQL. Cualquier cambio aqui se cambia alli, y al reves.
 */

/** Radio medio terrestre IUGG, en metros. El mismo numero que el SQL. */
export const EARTH_RADIUS_M = 6371008.8;

export type LatLng = { lat: number; lng: number };

export type StampableBar = LatLng & {
  id: string;
  radiusM: number;
  opensAt: Date;
  closesAt: Date;
};

export type StampVerdict =
  | { status: 'ready' }
  | { status: 'already' }
  | { status: 'too_early'; opensInMs: number }
  | { status: 'too_late' }
  | { status: 'too_far'; distanceM: number; missingM: number }
  | { status: 'no_location' };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Haversine en metros entre dos puntos. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  // min(1, ...) protege de que el redondeo en coma flotante saque asin de dominio
  // en puntos antipodales. Mismo guardarraíl que el least(1.0, ...) del SQL.
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Que pasaria si el usuario pulsase "Sellar" ahora mismo.
 * El orden de comprobaciones replica el del SQL: ya sellado gana a todo lo
 * demas (un sello conseguido no se pierde porque se cierre la ventana).
 */
export function evaluateStamp(input: {
  bar: StampableBar;
  position: LatLng | null;
  now: Date;
  alreadyStamped: boolean;
}): StampVerdict {
  const { bar, position, now, alreadyStamped } = input;

  if (alreadyStamped) return { status: 'already' };

  const nowMs = now.getTime();
  if (nowMs < bar.opensAt.getTime()) {
    return { status: 'too_early', opensInMs: bar.opensAt.getTime() - nowMs };
  }
  if (nowMs > bar.closesAt.getTime()) return { status: 'too_late' };

  if (!position) return { status: 'no_location' };

  const distanceM = distanceMeters(position, bar);
  if (distanceM > bar.radiusM) {
    return { status: 'too_far', distanceM, missingM: distanceM - bar.radiusM };
  }

  return { status: 'ready' };
}

/**
 * Traduce el error que levanta claim_stamp a un veredicto.
 * El SQL manda mensajes tipo 'TOO_FAR_312'; PostgREST los reenvia tal cual
 * dentro de `message`, a veces con prefijos, de ahi la busqueda por inclusion.
 */
export function verdictFromServerError(message: string): StampVerdict | null {
  const tooFar = /TOO_FAR_(\d+)/.exec(message);
  if (tooFar) {
    const distanceM = Number(tooFar[1]);
    return { status: 'too_far', distanceM, missingM: Number.NaN };
  }
  if (message.includes('TOO_EARLY')) return { status: 'too_early', opensInMs: 0 };
  if (message.includes('TOO_LATE')) return { status: 'too_late' };
  return null;
}

/** Texto que ve el usuario. Un sitio, para que no se contradigan las pantallas. */
export function describeVerdict(verdict: StampVerdict): string {
  switch (verdict.status) {
    case 'ready':
      return 'Estas en el bar. Listo para sellar.';
    case 'already':
      return 'Ya tienes este sello.';
    case 'too_early':
      return `Todavia no abre. Abre en ${formatDuration(verdict.opensInMs)}.`;
    case 'too_late':
      return 'La ventana de este bar ya se ha cerrado.';
    case 'too_far':
      return Number.isNaN(verdict.missingM)
        ? `Estas a ${Math.round(verdict.distanceM)} m del bar.`
        : `Estas a ${Math.round(verdict.distanceM)} m. Acercate ${Math.round(verdict.missingM)} m mas.`;
    case 'no_location':
      return 'Necesito tu ubicacion para sellar.';
  }
}

/** Duracion humana en es-ES a partir de milisegundos. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24} h`;
}
