/**
 * En que estado esta una ruta, y desde cuando.
 *
 * Solo hay DOS estados guardados: borrador y publicada (`routes.is_published`).
 * "Terminada" no se guarda, **se deduce**, y se deduce de lo que la propia ruta
 * ya sabe: **cuando cierra su ultimo bar**.
 *
 * El ultimo por `sort_order`, que es el orden de la ruta, no el que cierra mas
 * tarde. Si quien organiza pone el ultimo bar cerrando a las 03:00, la ruta
 * termina a las 03:00: no hay que adivinar nada, la respuesta estaba escrita en
 * el horario que ya se rellena al montar la ruta. Y `closes_at` es un
 * `timestamptz`, asi que sabe de horas y la medianoche no le afecta.
 *
 * (Antes esto eran "las 08:00 del dia siguiente a `event_date`". Funcionaba,
 * pero era un apano: `event_date` es un `date` y no sabe a que hora acaba nada,
 * asi que habia que inventarse un margen. Se queda SOLO como red para una ruta
 * publicada que no tenga bares, que no puede terminar de ninguna otra forma.)
 *
 * Por que deducirlo y no guardarlo: no hay estado que se pueda quedar
 * desincronizado, y no hay nada que a nadie se le olvide pulsar. `finished_at`
 * existe SOLO para terminarla a mano antes de tiempo (se cancelo, se acabo
 * pronto); lo normal es que este a null.
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

/**
 * Hora del dia siguiente a la que se da por terminada una ruta SIN bares, que
 * es lo unico que no puede decir cuando acaba. Con bares manda su horario.
 */
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

/** Lo que hace falta saber de los bares: cual va el ultimo y cuando cierra. */
export type BarDeRuta = { sort_order: number; closes_at: string | null };

type RutaEstado = {
  is_published: boolean;
  event_date: string | null;
  finished_at?: string | null;
  /** Los bares de la ruta, en cualquier orden. Sin ellos se usa la red. */
  route_bars?: readonly BarDeRuta[] | null;
};

/**
 * Cuando cierra el ultimo bar de la ruta, o null si no hay bares (o ninguno
 * tiene hora). El ultimo es el de mayor `sort_order`: el orden de la ruta, no
 * el que cierre mas tarde.
 */
export function cierreDelUltimoBar(bares: readonly BarDeRuta[] | null | undefined): Date | null {
  if (!bares || bares.length === 0) return null;
  let ultimo: BarDeRuta | null = null;
  for (const bar of bares) {
    if (!bar.closes_at) continue;
    if (!ultimo || bar.sort_order > ultimo.sort_order) ultimo = bar;
  }
  if (!ultimo?.closes_at) return null;
  const cierre = new Date(ultimo.closes_at);
  return Number.isNaN(cierre.getTime()) ? null : cierre;
}

/**
 * El instante en que una ruta se da (o se dio) por terminada sola, o null si no
 * hay forma de saberlo. Primero su ultimo bar; si no hay bares, la red del
 * dia siguiente.
 */
export function finDeLaRuta(ruta: RutaEstado): Date | null {
  return cierreDelUltimoBar(ruta.route_bars) ?? corteDeFin(ruta.event_date);
}

export function estadoDeRuta(ruta: RutaEstado, ahora: Date): EstadoRuta {
  if (!ruta.is_published) return 'borrador';
  if (ruta.finished_at) return 'terminada';
  const fin = finDeLaRuta(ruta);
  if (fin && ahora.getTime() >= fin.getTime()) return 'terminada';
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
  const desde = ruta.finished_at ? new Date(ruta.finished_at) : finDeLaRuta(ruta);
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
  'y los perfiles, chats y denuncias de La Caña de esta ruta. No se puede deshacer.';
