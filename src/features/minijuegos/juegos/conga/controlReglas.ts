/** Como se gira: deslizando el dedo por la pantalla o con una cruceta de botones. */
export type Control = 'deslizar' | 'cruceta';

export const CLAVE_CONTROL = 'minijuegos.conga.control.v1';

/** Sin fiarse de lo guardado: cualquier cosa rara vuelve al deslizar. */
export function leerControl(crudo: string | null): Control {
  return crudo === 'cruceta' ? 'cruceta' : 'deslizar';
}
