/**
 * El juego del coche se juega SIEMPRE en horizontal, aunque el movil este en
 * vertical y tenga el giro bloqueado: en ese caso la escena entera se pinta
 * tumbada 90 grados a la derecha (igual que el tapon, `tapon/escena.ts`). Asi
 * nadie tiene que tocar el ajuste del sistema para jugar.
 *
 * Girar con CSS no cambia lo que el navegador cuenta del dedo: `clientX/Y` y
 * `getBoundingClientRect()` siguen en coordenadas de PANTALLA. De ahi que el
 * joystick pase por `puntoLocal`, que deshace el giro.
 */

export type Medida = { ancho: number; alto: number };

/** Hay que girar cuando la ventana es mas alta que ancha. */
export const hayQueGirar = (ancho: number, alto: number) => alto > ancho;

/**
 * Tamano (en px de LAYOUT) y transformacion de la escena. En vertical la
 * escena mide alto x ancho de ventana y se gira 90 grados a la derecha desde su
 * esquina superior izquierda, corrida `ancho` px a la derecha para que quede
 * dentro de la pantalla: su +x apunta hacia abajo y su +y hacia la izquierda.
 */
export function cajaDeEscena(ventana: Medida): { ancho: number; alto: number; girada: boolean; transform: string | null } {
  if (!hayQueGirar(ventana.ancho, ventana.alto)) return { ancho: ventana.ancho, alto: ventana.alto, girada: false, transform: null };
  return {
    ancho: ventana.alto,
    alto: ventana.ancho,
    girada: true,
    transform: `translate(${ventana.ancho}px, 0px) rotate(90deg)`,
  };
}

/**
 * Posicion del dedo dentro de un elemento, en SUS coordenadas (las que ve el
 * juego), sea cual sea el giro. `caja` es lo que devuelve `getBoundingClientRect()`
 * del elemento: en una escena girada es el rectangulo de pantalla que la cubre
 * (ancho y alto intercambiados).
 */
export function puntoLocal(clientX: number, clientY: number, caja: { left: number; top: number; width: number }, girada: boolean): { x: number; y: number } {
  const sx = clientX - caja.left;
  const sy = clientY - caja.top;
  return girada ? { x: sy, y: caja.width - sx } : { x: sx, y: sy };
}
