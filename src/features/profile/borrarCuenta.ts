/**
 * Piezas puras de "Borrar cuenta" (sin red), para probarlas en Node.
 * La llamada de verdad esta en api.ts (deleteMyAccount).
 */

/** Rutas completas dentro del bucket a partir de lo que devuelve storage.list(uid). */
export function rutasDeFotos(userId: string, nombres: readonly string[]): string[] {
  return nombres.filter((nombre) => nombre !== '').map((nombre) => `${userId}/${nombre}`);
}

/** Codigos de delete_my_account_blockers() / delete_my_account() (0021). */
const IMPEDIMENTOS: Record<string, string> = {
  ADMIN_CANNOT_DELETE: 'Los administradores no pueden borrar su cuenta desde la app.',
  OWNS_ROUTES: 'No puedes borrar tu cuenta mientras seas quien creó alguna ruta. Habla con la organización.',
  HAS_OPEN_REPORTS:
    'Ahora mismo hay una denuncia sin resolver sobre tu cuenta, así que no se puede borrar todavía. ' +
    'Podrás hacerlo cuando la organización la resuelva.',
  // CANA_BLOCKED estuvo aqui y lo quito la 0024. Tener la cana desactivada ya
  // no impide borrarse: el veto sobrevive por su cuenta (HMAC del correo, como
  // el de ruta y la suspension) en vez de retener a la persona. Era el escalon
  // mas bajo de la sancion bloqueando el derecho de supresion, sin plazo.
};

/** El primer impedimento que trae la lista, ya en lenguaje de persona; null si no hay. */
export function textoDeImpedimentos(codigos: readonly string[]): string | null {
  for (const codigo of codigos) {
    const texto = IMPEDIMENTOS[codigo];
    if (texto) return texto;
  }
  // Un codigo que esta version de la app no conoce (migracion mas nueva): mejor
  // parar y decirlo que borrar fotos a ciegas.
  return codigos.length > 0 ? 'Tu cuenta no se puede borrar ahora mismo. Habla con la organización.' : null;
}

/**
 * Mensajes del servidor (delete_my_account, 0021) en lenguaje de persona.
 * El resto pasa tal cual, como en fotoRevision.traducirErrorFoto.
 */
export function traducirErrorBorrado(mensaje: string): string {
  for (const [codigo, texto] of Object.entries(IMPEDIMENTOS)) {
    if (mensaje.includes(codigo)) return texto;
  }
  if (/NOT_AUTHENTICATED/.test(mensaje)) {
    return 'Tu sesion ha caducado. Vuelve a entrar y prueba otra vez.';
  }
  // PostgREST cuando la funcion no existe: la 0021 no esta aplicada en ese proyecto.
  if (/delete_my_account/.test(mensaje) && /(could not find|does not exist)/i.test(mensaje)) {
    return 'Borrar la cuenta aun no esta disponible: falta aplicar la migracion 0021 en Supabase.';
  }
  return mensaje;
}

/**
 * Texto del pop-up de confirmacion: se prueba para que nadie lo recorte sin
 * querer. Lo que se conserva tiene que ser TODO lo que la 0015 y la 0017
 * conservan, no solo lo mas llamativo: cada denuncia en la que se participo
 * (con el nombre de entonces y sus pruebas) sigue existiendo, aunque se
 * archivase sin sancion.
 */
export const CONFIRMAR_BORRADO = {
  titulo: '¿Borrar tu cuenta?',
  mensaje:
    'Se borran tu cuenta y todos tus datos: sellos, foto, perfil de la caña y chats. ' +
    'No se puede deshacer. Solo se conserva, sin tu cuenta, el registro de moderación: ' +
    'las denuncias en las que participaste y las decisiones que se tomaron.',
  textoConfirmar: 'Borrar cuenta',
} as const;
