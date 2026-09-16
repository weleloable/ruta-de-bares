import type { Confirmacion } from './confirmar';

/**
 * Variante web de confirmar(): el dialogo nativo del navegador.
 *
 * Feo pero fiable: funciona en todos los navegadores y en la PWA instalada, y
 * no depende de montar un modal en el arbol de React. Si hace falta un dialogo
 * con la estetica de la app, se cambia aqui sin tocar las pantallas.
 */
export function confirmar({ titulo, mensaje }: Confirmacion): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return Promise.resolve(window.confirm(`${titulo}\n\n${mensaje}`));
}
