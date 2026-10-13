import type { GuiaInstalar } from './guiaInstalar';

/**
 * Boton "Instalar App" en Mi perfil: solo tiene sentido en la web (PWA), la
 * app nativa ya se instalo desde su build. Metro elige esta version fuera de
 * web; pwaInstalar.web.ts tiene la de verdad.
 */
export function iniciarInstalarApp(): void {}

export function useInstalarApp(): {
  disponible: boolean;
  instalando: boolean;
  instalar: () => Promise<void>;
  guia: GuiaInstalar | null;
} {
  return { disponible: false, instalando: false, instalar: async () => {}, guia: null };
}
