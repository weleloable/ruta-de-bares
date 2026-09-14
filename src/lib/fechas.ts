/**
 * Formateo de fechas y horas en es-ES. Un unico sitio para que ninguna pantalla
 * invente su propio formato.
 */

const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const DIA_CORTO = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const DIA_LARGO = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function hora(fecha: Date): string {
  return HORA.format(fecha);
}

export function ventana(abre: Date, cierra: Date): string {
  return `${hora(abre)} - ${hora(cierra)}`;
}

export function diaCorto(fecha: Date): string {
  return DIA_CORTO.format(fecha);
}

export function diaLargo(fecha: Date): string {
  return DIA_LARGO.format(fecha);
}

/** 'AAAA-MM-DD' -> Date en hora local, sin el desfase de UTC de new Date('...'). */
export function desdeFechaISO(iso: string | null): Date | null {
  if (!iso) return null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partes) return null;
  return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
}

/** Date -> 'AAAA-MM-DD' en hora local. */
export function aFechaISO(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
