/**
 * Validacion y reordenacion de rutas. Espejo de los CHECK de
 * supabase/migrations/0001_init.sql, mas los avisos que el SQL no puede dar.
 *
 * Distincion deliberada:
 *  - error   = el servidor lo va a rechazar. Bloquea el guardado.
 *  - warning = se guarda bien pero la ruta no tiene sentido para un humano
 *              (dos bares a la vez, el tercero antes que el segundo). Se avisa,
 *              no se bloquea: un admin puede querer bares solapados a proposito.
 */

export type BarDraft = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
  opensAt: Date;
  closesAt: Date;
  notes: string;
};

export type RouteDraft = {
  name: string;
  description: string;
  eventDate: string | null; // YYYY-MM-DD
};

export const RADIUS_MIN_M = 20;
export const RADIUS_MAX_M = 2000;
export const RADIUS_DEFAULT_M = 120;

export function validateRouteDraft(draft: RouteDraft): string[] {
  const errores: string[] = [];
  if (draft.name.trim().length === 0) errores.push('La ruta necesita un nombre.');
  if (draft.name.trim().length > 120) errores.push('El nombre no puede pasar de 120 caracteres.');
  if (draft.eventDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(draft.eventDate)) {
    errores.push('La fecha debe tener formato AAAA-MM-DD.');
  }
  return errores;
}

export function validateBarDraft(draft: BarDraft): string[] {
  const errores: string[] = [];

  if (draft.name.trim().length === 0) errores.push('El bar necesita un nombre.');

  if (!Number.isFinite(draft.lat) || draft.lat < -90 || draft.lat > 90) {
    errores.push('La latitud debe estar entre -90 y 90.');
  }
  if (!Number.isFinite(draft.lng) || draft.lng < -180 || draft.lng > 180) {
    errores.push('La longitud debe estar entre -180 y 180.');
  }
  if (draft.lat === 0 && draft.lng === 0) {
    errores.push('Marca la posicion del bar en el mapa.');
  }

  if (!Number.isInteger(draft.radiusM) || draft.radiusM < RADIUS_MIN_M || draft.radiusM > RADIUS_MAX_M) {
    errores.push(`El radio debe ser un numero entero entre ${RADIUS_MIN_M} y ${RADIUS_MAX_M} metros.`);
  }

  const abre = draft.opensAt.getTime();
  const cierra = draft.closesAt.getTime();
  if (Number.isNaN(abre) || Number.isNaN(cierra)) {
    errores.push('Las horas de apertura y cierre no son validas.');
  } else if (cierra <= abre) {
    errores.push('La hora de cierre tiene que ser posterior a la de apertura.');
  }

  return errores;
}

export type OrderedBar = { id: string; name: string; opensAt: Date; closesAt: Date };

export type RouteWarning =
  | { kind: 'overlap'; firstId: string; secondId: string; message: string }
  | { kind: 'out_of_order'; firstId: string; secondId: string; message: string };

/**
 * Avisos sobre la secuencia completa. `bars` viene en el orden de la ruta
 * (sort_order ascendente), no ordenado por hora.
 */
export function findRouteWarnings(bars: readonly OrderedBar[]): RouteWarning[] {
  const avisos: RouteWarning[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const anterior = bars[i - 1];
    const actual = bars[i];
    if (actual.opensAt.getTime() < anterior.closesAt.getTime()) {
      if (actual.opensAt.getTime() < anterior.opensAt.getTime()) {
        avisos.push({
          kind: 'out_of_order',
          firstId: anterior.id,
          secondId: actual.id,
          message: `"${actual.name}" abre antes que "${anterior.name}", que va delante en la ruta.`,
        });
      } else {
        avisos.push({
          kind: 'overlap',
          firstId: anterior.id,
          secondId: actual.id,
          message: `"${anterior.name}" y "${actual.name}" se solapan en el tiempo.`,
        });
      }
    }
  }
  return avisos;
}

/**
 * Mueve el elemento `from` a la posicion `to` y devuelve la lista nueva.
 * No muta la entrada. Indices fuera de rango devuelven la lista tal cual.
 */
export function moveBar<T>(bars: readonly T[], from: number, to: number): T[] {
  const copia = bars.slice();
  if (from < 0 || from >= copia.length || to < 0 || to >= copia.length || from === to) {
    return copia;
  }
  const [movido] = copia.splice(from, 1);
  copia.splice(to, 0, movido);
  return copia;
}

export type SortAssignment = { id: string; sort_order: number };

/** sort_order 0..n-1 segun la posicion en el array. */
export function assignSortOrder<T extends { id: string }>(bars: readonly T[]): SortAssignment[] {
  return bars.map((bar, index) => ({ id: bar.id, sort_order: index }));
}

/**
 * Solo las filas cuyo sort_order cambia de verdad.
 *
 * Sin esto, subir un bar una posicion reescribe los doce de la ruta, y como
 * cada escritura es una peticion HTTP aparte (ver persistOrder en api.ts), el
 * boton "Subir" tarda segundos. Un intercambio toca dos filas, no doce.
 */
export function changedPositions(
  ordered: readonly SortAssignment[],
  previous: ReadonlyMap<string, number>,
): SortAssignment[] {
  return ordered.filter((bar) => previous.get(bar.id) !== bar.sort_order);
}
