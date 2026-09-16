import type { OpcionesConfirmar } from './confirmar';

export type { OpcionesConfirmar };

/**
 * Variante web: `Alert.alert` de react-native-web es un no-op (ver confirmar.ts),
 * asi que aqui usamos `window.confirm`, que si bloquea y devuelve una respuesta.
 * Pierde el boton "destructivo" en rojo (el navegador no lo permite), pero el
 * texto ya deja claro que la accion es irreversible.
 */
export function confirmar({ titulo, mensaje }: OpcionesConfirmar): Promise<boolean> {
  const aceptado = window.confirm(`${titulo}\n\n${mensaje}`);
  return Promise.resolve(aceptado);
}
