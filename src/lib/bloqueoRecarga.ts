import { useEffect } from 'react';

/**
 * Lo que no se puede perder con una recarga automatica por version nueva
 * (versionApp.ts). Hoy, una partida de un minijuego: el juego va en memoria y
 * volver del segundo plano a mitad de una partida no es motivo para tirarla.
 *
 * Un contador y no un booleano: si dos sitios bloquean a la vez, el primero que
 * suelta no debe desbloquear al otro.
 */
let bloqueos = 0;

export function recargaBloqueada(): boolean {
  return bloqueos > 0;
}

/** Bloquea la recarga automatica mientras `activo` sea true y el componente siga montado. */
export function useBloqueoRecarga(activo: boolean): void {
  useEffect(() => {
    if (!activo) return undefined;
    bloqueos += 1;
    return () => {
      bloqueos -= 1;
    };
  }, [activo]);
}
