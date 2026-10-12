/**
 * Avisos en el movil (0064): en que punto esta este dispositivo y la clave
 * publica de las notificaciones. Sin importaciones: los tests lo cargan tal cual.
 */

/**
 * Clave publica VAPID: identifica a nuestro servidor ante el navegador. Es
 * publica (la privada esta solo en los secretos de la Edge Function). Si se
 * cambia, todos tienen que volver a activar los avisos.
 */
export const CLAVE_PUBLICA_PUSH = 'BHds1jHShs4g6G0oXeQAkkZD4vWoiUWx83FPmIsQ8xmFtKnsoooPlZ2a7d0SygAIbPvI4C4gU3sTvou2IUetfmA';

/**
 * - `no-soportado`: el navegador no puede (o es la app nativa, o desarrollo).
 * - `instalar`: iPhone/iPad sin anadir a la pantalla de inicio (asi Safari no deja).
 * - `denegado`: dijo que no; solo se cambia en los ajustes del navegador.
 * - `pendiente`: se puede pedir permiso.
 * - `activo`: con permiso y suscrito.
 */
export type EstadoAvisos = 'no-soportado' | 'instalar' | 'denegado' | 'pendiente' | 'activo';

export function decidirEstado(e: {
  soportado: boolean;
  ios: boolean;
  instalada: boolean;
  permiso: 'default' | 'granted' | 'denied' | null;
  suscrito: boolean;
}): EstadoAvisos {
  if (e.ios && !e.instalada) return 'instalar';
  if (!e.soportado || e.permiso === null) return 'no-soportado';
  if (e.permiso === 'denied') return 'denegado';
  if (e.permiso === 'granted' && e.suscrito) return 'activo';
  return 'pendiente';
}

/** La clave en base64url, como la pide `pushManager.subscribe`. */
export function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Lo que se le dice a cada uno en Mi perfil segun el estado. */
export function textoEstado(e: EstadoAvisos): string {
  switch (e) {
    case 'activo':
      return 'Activados en este dispositivo.';
    case 'pendiente':
      return 'Te avisamos 10 min antes de cada parada, del sorteo y de La Caña.';
    case 'denegado':
      return 'Los bloqueaste en este dispositivo. Para activarlos, permite las notificaciones de la app en los ajustes del navegador o del móvil.';
    case 'instalar':
      return 'En iPhone, primero añade la app a la pantalla de inicio (Compartir > Añadir a pantalla de inicio) y ábrela desde ahí.';
    case 'no-soportado':
      return 'Este navegador no permite avisos. Prueba con Chrome, o instalando la app.';
  }
}
