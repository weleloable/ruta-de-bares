/**
 * Traduce los errores de las funciones de la 0034 a algo que se pueda leer en
 * un bar. Los codigos (TOO_FAST, FORBIDDEN...) los lanza Postgres tal cual.
 */
export function traducirErrorMinijuegos(mensaje: string): string {
  if (/TOO_FAST/.test(mensaje)) return 'Vas demasiado rápido. Espera unos segundos.';
  if (/SUSPENDED/.test(mensaje)) return 'Tu cuenta está suspendida: no se puede guardar nada.';
  if (/FORBIDDEN/.test(mensaje)) return 'Solo puede jugar y ver esto quien está dentro de la ruta.';
  if (/NOT_AUTHENTICATED/.test(mensaje)) return 'Inicia sesión para guardar.';
  if (/LIMIT_REACHED/.test(mensaje)) return 'Has llegado al máximo de cervezas en esta ruta. Borra alguna.';
  if (/INVALID_NAME/.test(mensaje)) return 'El nombre debe tener entre 1 y 30 caracteres.';
  if (/INVALID_(SCORE|GAME|RECIPE)/.test(mensaje)) return 'No se pudo guardar esta partida.';
  // PostgREST cuando la funcion no existe: la migracion 0034 no esta pegada.
  if (/PGRST202|Could not find the function|schema cache/i.test(mensaje)) {
    return 'Falta aplicar la migración 0034 en Supabase (ver docs/SETUP.md).';
  }
  return mensaje || 'No se pudo completar.';
}
