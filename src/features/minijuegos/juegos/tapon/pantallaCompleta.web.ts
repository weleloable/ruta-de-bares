/**
 * En web: pantalla completa y, si el navegador deja, bloqueo en horizontal
 * (Chrome en Android si; iPhone y escritorio no). Si no deja, no pasa nada: con
 * el movil en vertical el juego se pinta tumbado (`hayQueGirar`) y se juega
 * girando el movil igual, tenga o no el bloqueo de rotacion puesto.
 *
 * Hay que llamarlo DENTRO de un toque (Empezar): el navegador solo concede la
 * pantalla completa como respuesta a un gesto. Lo mismo que ¿Conduces tu?.
 */
type Orientacion = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

export function entrarEnHorizontal(): void {
  void (async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      await (screen.orientation as Orientacion | undefined)?.lock?.('landscape');
    } catch {
      // Sin permiso: se juega tumbado.
    }
  })();
}

export function salirDeHorizontal(): void {
  try {
    (screen.orientation as Orientacion | undefined)?.unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {
    // Nada que deshacer.
  }
}
