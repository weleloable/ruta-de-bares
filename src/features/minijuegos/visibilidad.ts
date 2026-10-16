/**
 * Que juegos salen en el menu y en que orden. Hoy solo hay un juego con
 * visibilidad especial: La Penul (historia para adultos, 0071).
 *
 *  - Admins: la ven SIEMPRE. Si el interruptor de la ruta esta apagado, con la
 *    etiqueta "Solo admins" (para que sepan que el resto no la ve).
 *  - El resto: solo con el interruptor de la ruta (`routes.la_penul_visible`) encendido.
 *  - Cuando sale, va la PRIMERA.
 *
 * ESCONDERLA ES UNA SORPRESA, NO UN SECRETO. Esto solo decide el menu: el texto
 * y las imagenes del juego van en la web publicada, y quien sepa mirar el
 * JavaScript los encuentra con el interruptor apagado. No protege nada.
 *
 * Sin importaciones en tiempo de ejecucion: los tests lo cargan tal cual.
 */

export type ConVisibilidad = { id: string; visibilidad?: 'la-penul' };

export type EnMenu<T> = { juego: T; soloAdmins: boolean };

export function juegosDelMenu<T extends ConVisibilidad>(
  juegos: readonly T[],
  quien: { esAdmin: boolean; penulVisible: boolean },
): EnMenu<T>[] {
  const primeros: EnMenu<T>[] = [];
  const resto: EnMenu<T>[] = [];
  for (const juego of juegos) {
    if (juego.visibilidad === 'la-penul') {
      if (quien.esAdmin) primeros.push({ juego, soloAdmins: !quien.penulVisible });
      else if (quien.penulVisible) primeros.push({ juego, soloAdmins: false });
      continue;
    }
    resto.push({ juego, soloAdmins: false });
  }
  return [...primeros, ...resto];
}

/** Cada cuanto se vuelve a mirar el interruptor con el menu abierto (un admin lo enciende a mitad de la noche). */
export const SONDEO_PENUL_MS = 60 * 1000;
