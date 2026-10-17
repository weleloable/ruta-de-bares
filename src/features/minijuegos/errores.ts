/**
 * Traduce los errores de las funciones de la 0034 (y la 0038) a algo que se pueda leer en
 * un bar. Los codigos (TOO_FAST, FORBIDDEN...) los lanza Postgres tal cual.
 */
export function traducirErrorMinijuegos(mensaje: string): string {
  if (/TOO_FAST/.test(mensaje)) return 'Vas demasiado rápido. Espera unos segundos.';
  if (/SUSPENDED/.test(mensaje)) return 'Tu cuenta está suspendida: no se puede guardar nada.';
  if (/FORBIDDEN/.test(mensaje)) return 'Solo puede jugar y ver esto quien está dentro de la ruta.';
  if (/NOT_AUTHENTICATED/.test(mensaje)) return 'Inicia sesión para guardar.';
  if (/LIMIT_REACHED/.test(mensaje)) return 'Has llegado al máximo de cervezas en esta ruta. Borra alguna.';
  if (/INVALID_NAME/.test(mensaje)) return 'El nombre debe tener entre 1 y 30 caracteres.';
  if (/INVALID_LEVEL/.test(mensaje)) return 'Ese nivel de cañas no existe en esta ruta.';
  // Un juego que el servidor no conoce: la app es mas nueva que la base (la conga llega con
  // la 0039, el quiz con la 0055, Tapon al Vuelo con la 0056, Parejas de Barra con la 0070
  // y Barman Express con la 0072). Al anadir un juego con ranking, sumar aqui su migracion.
  if (/INVALID_GAME/.test(mensaje)) {
    return 'Este juego aún no tiene ranking en Supabase: falta aplicar una migración (la 0039, 0055, 0056, 0070 o 0072, ver docs/SETUP.md).';
  }
  if (/APP_UPDATE_REQUIRED/.test(mensaje)) return 'Hay una versión nueva de la app. Recarga la página para guardar tu nota.';
  if (/INVALID_(SCORE|RECIPE)/.test(mensaje)) return 'No se pudo guardar esta partida.';
  // PostgREST cuando la funcion no existe: falta una migracion de los minijuegos.
  // Puede ser la 0034 (todo) o la 0038 (guardar cervezas con la siembra): se
  // nombran las dos, porque mandar a mirar solo una que ya esta pegada despista.
  if (/PGRST202|Could not find the function|schema cache/i.test(mensaje)) {
    return 'Falta aplicar una migración de los minijuegos en Supabase (la 0034, 0038, 0041 o 0069, ver docs/SETUP.md).';
  }
  return mensaje || 'No se pudo completar.';
}
