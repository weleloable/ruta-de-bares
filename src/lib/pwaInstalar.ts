/**
 * Boton "Instalar App" en Mi perfil: solo tiene sentido en la web (PWA), la
 * app nativa ya se instalo desde su build. Metro elige esta version fuera de
 * web; pwaInstalar.web.ts tiene la de verdad.
 */
export function useInstalarApp(): {
  disponible: boolean;
  instalando: boolean;
  instalar: () => Promise<void>;
} {
  return { disponible: false, instalando: false, instalar: async () => {} };
}
