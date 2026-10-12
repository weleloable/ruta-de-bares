import type { EstadoAvisos } from './estado';

/**
 * Avisos en el movil en la app nativa: todavia no (solo hay Web Push, ver
 * push.web.ts). Misma forma que la version web para que las pantallas no
 * tengan que preguntar en que plataforma estan.
 */
export async function estadoAvisos(): Promise<EstadoAvisos> {
  return 'no-soportado';
}

export async function activarAvisos(): Promise<EstadoAvisos> {
  return 'no-soportado';
}

export async function desactivarAvisos(): Promise<void> {}

export async function sincronizarAvisos(): Promise<void> {}
