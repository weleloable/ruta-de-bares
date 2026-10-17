/**
 * Repartir en el tiempo lo que, si no, hacen todos los moviles a la vez.
 *
 * En una apertura de bar hay ~150 personas sellando: cada sello toca el marcador
 * de las casas y Realtime avisa a todos, y todos volvian a pedir el ranking en
 * el mismo instante (sellos x moviles peticiones). Aqui viven las dos piezas que
 * lo evitan. Sin importaciones: los tests lo cargan tal cual.
 */

/** Milisegundos al azar entre 0 y `maxMs` (sin incluirlo). `azar` se inyecta para los tests. */
export function esperaAleatoria(maxMs: number, azar: () => number = Math.random): number {
  if (!(maxMs > 0)) return 0;
  return Math.floor(azar() * maxMs);
}

/**
 * Junta muchas peticiones seguidas en UNA: la primera programa la tarea dentro de
 * una espera al azar y las que lleguen mientras tanto no hacen nada (la tarea
 * lee el estado mas reciente al ejecutarse, asi que no se pierde ninguna).
 * `cancelar` limpia la espera pendiente, para el desmontaje.
 */
export function crearAgrupador(
  tarea: () => void,
  maxEsperaMs: number,
  azar: () => number = Math.random,
): { pedir: () => void; cancelar: () => void } {
  let pendiente: ReturnType<typeof setTimeout> | null = null;
  return {
    pedir() {
      if (pendiente !== null) return;
      pendiente = setTimeout(() => {
        pendiente = null;
        tarea();
      }, esperaAleatoria(maxEsperaMs, azar));
    },
    cancelar() {
      if (pendiente !== null) clearTimeout(pendiente);
      pendiente = null;
    },
  };
}
