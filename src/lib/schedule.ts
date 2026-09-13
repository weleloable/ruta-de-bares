// Comprueba si una hora cae dentro del turno de un bar. Puro y testeable
// sin reloj real. Debe coincidir con la lógica de check_in() en el
// servidor (supabase/migrations/0001_init.sql), que compara en hora de
// Europe/Madrid — el cliente compara con la hora local del propio móvil,
// que para alguien físicamente en la ruta es la misma.
//
// Soporta turnos que cruzan medianoche (ej. 23:30–01:00): si endTime es
// "menor" que startTime, se interpreta como que el turno cruza la
// medianoche en vez de ser un rango vacío.

function toSeconds(hhmmss: string): number {
  const [h, m, s] = hhmmss.split(':').map(Number);
  return h * 3600 + (m || 0) * 60 + (s || 0);
}

export function isWithinTimeWindow(now: string, startTime: string, endTime: string): boolean {
  const n = toSeconds(now);
  const start = toSeconds(startTime);
  const end = toSeconds(endTime);

  if (end >= start) {
    return n >= start && n <= end;
  }
  // El turno cruza medianoche: válido desde el inicio hasta medianoche, o
  // desde medianoche hasta el fin.
  return n >= start || n <= end;
}

/** "HH:MM:SS" de la hora local actual del dispositivo. */
export function currentLocalTime(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
