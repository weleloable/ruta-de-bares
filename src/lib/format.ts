// Formateo de horarios de bares. Postgres `time` llega como "HH:MM:SS".
// Puro y sin locale del dispositivo, para que sea determinista y testable.

/** "19:30:00" -> "19:30". Si el formato es inesperado, lo devuelve tal cual. */
export function formatTime(time: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return time;
  return `${match[1]}:${match[2]}`;
}

export function formatSchedule(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

/** ISO timestamp -> "13/09 · 19:42", para mostrar cuándo se selló un bar. */
export function formatSealedAt(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} · ${hours}:${minutes}`;
}
