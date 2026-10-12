/**
 * Reglas de la contrasena y del codigo de recuperacion. Puro y sin imports: lo
 * cargan los tests tal cual y lo usan el registro y "He olvidado mi contrasena".
 */

/**
 * Minimo de caracteres. Bajado de 8 a 6 a peticion de la organizacion: es una
 * app de un evento entre amigos y 8 se olvidaba. 6 es ademas el MINIMO del panel
 * de Supabase (Authentication > Providers > Email > Minimum password length no
 * deja bajar de ahi): por debajo de 6 la pantalla aceptaria algo que el servidor
 * rechaza con "demasiado corta". Si se vuelve a cambiar, cambiarlo alli tambien.
 */
export const MIN_PASSWORD = 6;

export const passwordValida = (p: string) => p.length >= MIN_PASSWORD;

/** Lo justo para no mandar a Supabase algo que no es un correo; quien valida de verdad es el servidor. */
export const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim());

/** Largo del codigo que manda Supabase en el correo de recuperacion. */
export const LARGO_CODIGO = 6;

/** Solo digitos: se quita todo lo demas, porque se pega desde el correo con espacios o saltos. */
export const limpiarCodigo = (c: string) => c.replace(/\D/g, '').slice(0, LARGO_CODIGO);

export const codigoValido = (c: string) => limpiarCodigo(c).length === LARGO_CODIGO;

/** Espera entre dos envios del codigo: el correo tarda y Supabase limita los envios por hora. */
export const SEGUNDOS_REENVIO = 60;

/** Segundos que faltan para poder reenviar (0 = ya se puede). `enviadoEn` null = aun no se envio. */
export function segundosParaReenviar(ahoraMs: number, enviadoEn: number | null): number {
  if (enviadoEn === null) return 0;
  const faltan = SEGUNDOS_REENVIO - (ahoraMs - enviadoEn) / 1000;
  // Tope en 60: si el reloj del sistema va hacia atras, la espera no puede crecer.
  return Number.isFinite(faltan) && faltan > 0 ? Math.min(SEGUNDOS_REENVIO, Math.ceil(faltan)) : 0;
}
