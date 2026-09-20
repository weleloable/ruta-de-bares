/**
 * En que estado esta una ruta, y desde cuando.
 *
 * Solo hay DOS estados guardados: borrador y publicada (`routes.is_published`).
 * "Terminada" no se guarda, **se deduce**: una ruta publicada esta terminada a
 * las 08:00 del dia siguiente a su `event_date`.
 *
 * Por que a las 08:00 del dia siguiente y no "cuando pase la fecha": una ruta de
 * bares cruza la medianoche por definicion. `event_date` es un `date`, asi que
 * "la fecha ya paso" es cierto a las 00:01, **mientras la gente sigue
 * sellando**. Las 08:00 del dia siguiente caen despues de cualquier ruta.
 *
 * Por que deducirlo y no guardarlo: no hay migracion, no hay estado que se
 * pueda quedar desincronizado, y no hay nada que a nadie se le olvide pulsar.
 * `finished_at` existe SOLO para terminarla a mano antes de tiempo (se cancelo,
 * se acabo pronto); lo normal es que este a null.
 *
 * "Terminada" no bloquea nada hoy: es un aviso para quien organiza de que toca
 * borrar la ruta, que es lo que se lleva por delante sus datos. Sellar ya se
 * corta solo por el horario de cada bar (`claim_stamp`).
 *
 * Las 08:00 son hora local del dispositivo. Para quien organiza, que esta en el
 * evento, eso es la hora de aqui. Si algun dia hay admins en otro huso, esto es
 * lo que habria que fijar a Europe/Madrid.
 */

export type EstadoRuta = 'borrador' | 'publicada' | 'terminada';

/** La hora del dia siguiente a la que una ruta se da por terminada. */
export const HORA_FIN = 8;

/**
 * Cuando se dara por terminada una ruta con esa fecha de evento, o null si no
 * tiene fecha (entonces no termina nunca sola: hay que marcarla a mano).
 *
 * `event_date` viene como 'YYYY-MM-DD'. Se construye con el constructor de tres
 * argumentos y no con `new Date(iso)`: este ultimo lo interpreta como UTC y en
 * Espana adelantaria el corte una o dos horas.
 */
export function corteDeFin(eventDate: string | null | undefined): Date | null {
  if (!eventDate) return null;
  const [anio, mes, dia] = eventDate.split('-').map(Number);
  if (!anio || !mes || !dia) return null;
  return new Date(anio, mes - 1, dia + 1, HORA_FIN, 0, 0, 0);
}

type RutaEstado = {
  is_published: boolean;
  event_date: string | null;
  finished_at?: string | null;
};

export function estadoDeRuta(ruta: RutaEstado, ahora: Date): EstadoRuta {
  if (!ruta.is_published) return 'borrador';
  if (ruta.finished_at) return 'terminada';
  const corte = corteDeFin(ruta.event_date);
  if (corte && ahora.getTime() >= corte.getTime()) return 'terminada';
  return 'publicada';
}

const ETIQUETA: Record<EstadoRuta, string> = {
  borrador: 'Borrador',
  publicada: 'Publicada',
  terminada: 'Terminada',
};

export function etiquetaEstado(estado: EstadoRuta): string {
  return ETIQUETA[estado];
}

/**
 * ¿Se le puede ofrecer "Marcar como terminada"? Solo a una publicada que no lo
 * este ya: marcar un borrador no significa nada, y marcar lo que ya termino
 * sola tampoco.
 */
export function puedeTerminarseAMano(ruta: RutaEstado, ahora: Date): boolean {
  return estadoDeRuta(ruta, ahora) === 'publicada';
}

/**
 * Lo que se le dice a quien organiza sobre una ruta terminada, para empujarle a
 * borrarla. Es el unico recordatorio que hay: sin cron, si nadie pulsa, los
 * datos del evento se quedan.
 */
export function avisoDeRutaTerminada(ruta: RutaEstado, ahora: Date): string | null {
  if (estadoDeRuta(ruta, ahora) !== 'terminada') return null;
  const desde = ruta.finished_at ? new Date(ruta.finished_at) : corteDeFin(ruta.event_date);
  if (!desde || Number.isNaN(desde.getTime())) return 'Ya terminó. Borra sus datos cuando quieras.';
  const dias = Math.floor((ahora.getTime() - desde.getTime()) / 86_400_000);
  if (dias <= 0) return 'Terminó hoy. Al borrarla se van sus datos.';
  if (dias === 1) return 'Terminó ayer. Al borrarla se van sus datos.';
  return `Terminó hace ${dias} días. Al borrarla se van sus datos.`;
}

/**
 * Lo que se lleva por delante borrar una ruta, para decirlo ANTES de confirmar.
 * No es una lista decorativa: los sellos de todo el mundo desaparecen, y eso no
 * tiene vuelta atras.
 */
export const LO_QUE_SE_BORRA =
  'Se borran los sellos de todo el mundo, la lista de participantes, las invitaciones, ' +
  'y los perfiles, chats y denuncias de la caña de esta ruta. No se puede deshacer.';
