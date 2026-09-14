/**
 * Ventanas horarias a partir de la fecha de la ruta y dos horas HH:MM.
 *
 * Por que asi y no con un selector de fecha completo para cada bar: una ruta de
 * bares ocurre en una tarde-noche. Pedirle al admin la fecha doce veces es
 * ruido, y ademas es la via directa a que el bar 7 acabe en otro dia por un
 * despiste. La fecha sale de la ruta, el admin solo teclea horas.
 *
 * Cruzar medianoche esta contemplado: si la hora de cierre es menor o igual que
 * la de apertura, el cierre cae al dia siguiente. Es lo normal en el ultimo bar.
 */

export type Hora = { horas: number; minutos: number };

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** '19:30' -> {horas:19, minutos:30}. Devuelve null si no es una hora valida. */
export function parseHora(texto: string): Hora | null {
  const coincide = HHMM.exec(texto.trim());
  if (!coincide) return null;
  return { horas: Number(coincide[1]), minutos: Number(coincide[2]) };
}

export function formatHora(fecha: Date): string {
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

/** Combina un dia local con una hora del reloj. */
export function conHora(dia: Date, hora: Hora): Date {
  return new Date(
    dia.getFullYear(),
    dia.getMonth(),
    dia.getDate(),
    hora.horas,
    hora.minutos,
    0,
    0,
  );
}

export type Ventana = { opensAt: Date; closesAt: Date };

export type ResultadoVentana =
  | { ok: true; ventana: Ventana; cruzaMedianoche: boolean }
  | { ok: false; error: string };

/**
 * `dia` es la fecha de la ruta en hora local (o hoy si la ruta no tiene fecha).
 * Las dos horas van en formato HH:MM.
 */
export function construirVentana(dia: Date, abreTexto: string, cierraTexto: string): ResultadoVentana {
  const abre = parseHora(abreTexto);
  if (!abre) return { ok: false, error: 'La hora de apertura tiene que ser HH:MM, entre 00:00 y 23:59.' };

  const cierra = parseHora(cierraTexto);
  if (!cierra) return { ok: false, error: 'La hora de cierre tiene que ser HH:MM, entre 00:00 y 23:59.' };

  const opensAt = conHora(dia, abre);
  let closesAt = conHora(dia, cierra);
  let cruzaMedianoche = false;

  if (closesAt.getTime() <= opensAt.getTime()) {
    closesAt = new Date(closesAt.getTime() + 24 * 60 * 60 * 1000);
    cruzaMedianoche = true;
  }

  return { ok: true, ventana: { opensAt, closesAt }, cruzaMedianoche };
}
