/**
 * Que hacer cuando la web publicada es mas nueva que la que esta corriendo.
 *
 * El service worker no cachea la app (public/sw.js), asi que ABRIRLA siempre
 * carga la ultima. El problema es la app que ya esta abierta: una PWA instalada
 * se queda dias en segundo plano (sobre todo en iPhone) y al volver sigue con el
 * JavaScript viejo en memoria. Cada despliegue publica `version.json` con su
 * commit y la app lleva el suyo incrustado (EXPO_PUBLIC_APP_VERSION, lo pone
 * .github/workflows/deploy-web.yml); si no coinciden:
 *
 *  - un ADMIN ve una barra "Hay una version nueva · Actualizar" y decide el;
 *  - el RESTO no ve nada: la app se recarga sola al volver del segundo plano,
 *    que es cuando nadie esta a mitad de algo. Nunca con la app delante: una
 *    recarga en mitad de un chat o de un sellado seria peor que la version vieja.
 *
 * Puro y sin importaciones: los tests lo cargan tal cual.
 */

/** Cada cuanto se pregunta con la app delante (solo sirve para la barra de los admins). */
export const INTERVALO_SONDEO_MS = 5 * 60 * 1000;

/**
 * Cuanto tiene que haber estado la app en segundo plano para recargarla sola.
 * Salir un momento a WhatsApp a pasar una invitacion y volver no es "irse": ahi
 * puede haber algo a medio escribir. Un minuto fuera, si.
 */
export const OCULTA_MINIMO_MS = 60 * 1000;

export type DecisionVersion = 'nada' | 'aviso' | 'recargar';

/**
 * Lee el `version.json` publicado. Cualquier cosa rara es "no se sabe" (null):
 * un fichero corrupto o una pagina de error de Pages nunca debe disparar una
 * recarga, o la app entraria en bucle recargandose.
 */
export function leerVersionRemota(datos: unknown): string | null {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return null;
  const version = (datos as { version?: unknown }).version;
  if (typeof version !== 'string') return null;
  const limpia = version.trim();
  return /^[0-9a-f]{7,40}$/i.test(limpia) ? limpia : null;
}

/**
 * La decision, sin efectos.
 *
 * - `local`: la version de este bundle. Vacia en desarrollo o en un export
 *   local sin la variable: entonces no se hace nada (no hay con que comparar).
 * - `remota`: la publicada, ya pasada por `leerVersionRemota`.
 * - `ocultaMs`: cuanto llevaba la app en segundo plano justo antes de esta
 *   comprobacion; 0 si la comprobacion es con la app delante (el sondeo).
 * - `bloqueada`: hay algo que no se puede perder (una partida en marcha).
 */
export function decidirVersion(p: {
  local: string | null | undefined;
  remota: string | null;
  esAdmin: boolean;
  ocultaMs: number;
  bloqueada: boolean;
}): DecisionVersion {
  const local = p.local?.trim();
  if (!local || !p.remota || p.remota === local) return 'nada';
  if (p.esAdmin) return 'aviso';
  if (p.bloqueada) return 'nada';
  return p.ocultaMs >= OCULTA_MINIMO_MS ? 'recargar' : 'nada';
}

/**
 * URL de `version.json` junto a la app. Con `?t=` para que ni el navegador ni
 * la cache de Pages (10 min) devuelvan una copia vieja.
 */
export function urlVersion(baseUrl: string | undefined, ahoraMs: number): string {
  const prefijo = (baseUrl ?? '').replace(/\/+$/, '');
  return `${prefijo}/version.json?t=${ahoraMs}`;
}
