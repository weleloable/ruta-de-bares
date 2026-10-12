/**
 * Margen extra de sellado (0061): cada parada puede ensanchar su horario
 * oficial unos minutos por delante y por detras, porque en la noche los
 * horarios se mueven y no se quiere dejar a nadie sin sello. El servidor
 * (`claim_stamp`) aplica lo mismo: esto es para que la ficha no diga "aun no"
 * cuando el servidor si dejaria.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

const MINUTO_MS = 60_000;

/** Las opciones del desplegable del editor, en minutos (0 = sin margen). */
export const OPCIONES_MARGEN = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

/** Desde cuando y hasta cuando se puede sellar, con el margen aplicado. */
export function ventanaDeSellado(opensAt: Date, closesAt: Date, margenMin: number | null | undefined) {
  const m = Math.max(0, Math.min(180, Math.round(margenMin ?? 0)));
  return {
    desde: new Date(opensAt.getTime() - m * MINUTO_MS),
    hasta: new Date(closesAt.getTime() + m * MINUTO_MS),
    margen: m,
  };
}

/** "Sin margen" o "±30 min" para el editor. */
export function etiquetaMargen(min: number): string {
  return min <= 0 ? 'Sin margen' : `±${min} min`;
}
