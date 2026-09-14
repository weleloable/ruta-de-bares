/**
 * Iniciales para el avatar de reserva cuando el usuario no tiene foto.
 *
 * Vive en su propio modulo, separado de profile/api.ts, porque es logica pura y
 * api.ts importa expo-image-picker: un modulo nativo no se puede cargar en los
 * tests de Node.
 */
export function initials(displayName: string, email: string): string {
  // Del correo solo la parte local: con el dominio, marta@gmail.com daria "MG".
  const base =
    displayName.trim().length > 0 ? displayName.trim() : email.split('@')[0];
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}
