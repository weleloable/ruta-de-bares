import type { EstadoInstalacion } from './instalacion';

/**
 * Version nativa: la app ya esta instalada desde su build, no hay PWA.
 * La de verdad es pwa.web.ts; Metro la elige al bundlear para web. Las dos
 * exportan lo mismo para que las pantallas no tengan que preguntar la plataforma.
 */

export function iniciarPwa(): void {}

export function useInstalacion(): { estado: EstadoInstalacion; instalando: boolean; instalar(): Promise<void> } {
  return { estado: { tipo: 'no-web' }, instalando: false, instalar: async () => {} };
}
