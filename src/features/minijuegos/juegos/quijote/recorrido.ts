/**
 * Lo que cambia con los metros, sin pintar nada (la escena lo lee): la hora
 * del dia y los tramos por Alcala de Henares. Y el mensaje del final. Sin
 * importaciones: los tests lo cargan tal cual.
 */

// ---------------------------------------------------------------------------
// Atardecer -> crepusculo -> noche
// ---------------------------------------------------------------------------

/**
 * Los metros en los que cambia la luz: atardecer hasta `crepusculo`, de ahi a
 * la noche hasta `noche`, noche cerrada hasta `alba` y vuelta al atardecer en
 * `vuelta`. Luego se repite (hay partidas muy largas).
 */
export const CICLO = { crepusculo: 900, noche: 2000, alba: 4200, vuelta: 5000 } as const;

const suave = (x: number) => x * x * (3 - 2 * x);

/** Cuanto de noche es, de 0 (atardecer) a 1 (noche cerrada con luna). 0,5 es el crepusculo. */
export function nocheEn(dist: number): number {
  const d = ((Math.max(0, dist) % CICLO.vuelta) + CICLO.vuelta) % CICLO.vuelta;
  if (d < CICLO.crepusculo) return 0;
  if (d < CICLO.noche) return suave((d - CICLO.crepusculo) / (CICLO.noche - CICLO.crepusculo));
  if (d < CICLO.alba) return 1;
  return 1 - suave((d - CICLO.alba) / (CICLO.vuelta - CICLO.alba));
}

// ---------------------------------------------------------------------------
// Alcala de Henares
// ---------------------------------------------------------------------------

/**
 * Cada `cada` metros el camino entra en Alcala: arco de bienvenida, la Calle
 * Mayor con sus soportales, la fachada de la Universidad y la Plaza de
 * Cervantes con su estatua. Luego, vuelta a La Mancha.
 */
export const ALCALA = {
  primero: 700,
  cada: 1600,
  largo: 320,
  /** Donde esta cada cosa, en metros desde la entrada. */
  universidad: 120,
  plaza: 230,
} as const;

/** Si el punto `s` del camino esta dentro de Alcala: los metros desde la entrada, o null. */
export function enAlcala(s: number): number | null {
  if (s < ALCALA.primero) return null;
  const local = (s - ALCALA.primero) % ALCALA.cada;
  return local < ALCALA.largo ? local : null;
}

/** Las entradas a Alcala (en `s`) que caen entre `desde` y `hasta`. */
export function entradasAlcala(desde: number, hasta: number): number[] {
  const primera = Math.max(0, Math.ceil((desde - ALCALA.primero) / ALCALA.cada));
  const lista: number[] = [];
  for (let k = primera; ALCALA.primero + k * ALCALA.cada <= hasta; k++) lista.push(ALCALA.primero + k * ALCALA.cada);
  return lista;
}

// ---------------------------------------------------------------------------
// El final
// ---------------------------------------------------------------------------

export type Final = { metros: number; jarras: number; molinos: number };

/** Un mensaje con gracia segun como haya ido la partida. Lo mas llamativo manda. */
export function mensajeFinal({ metros, jarras, molinos }: Final): string {
  if (molinos >= 3) return `Has derribado ${molinos} gigantes. Rocinante pide un descanso.`;
  if (molinos === 2) return 'Dos gigantes por tierra. Sancho ya no sabe qué decir.';
  if (molinos === 1) return 'Un gigante derribado. Mañana dirán que era un molino.';
  if (metros >= 3000) return 'Has llegado más lejos que el propio Rocinante.';
  if (jarras >= 40) return `${jarras} jarras. La aventura da sed, pero esto ya es vicio.`;
  if (metros >= 1200) return 'Buena cabalgada. Dulcinea estaría orgullosa.';
  if (metros >= 400) return 'Para ser hidalgo de secano, no está mal.';
  return 'Los encantadores te la han jugado. Otra vez será.';
}
