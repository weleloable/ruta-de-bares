/**
 * Reglas puras de la revision de fotos de perfil (migracion 0020): como se
 * nombran los ficheros que se suben, que le dice Mi perfil a quien espera, y
 * como se traducen los errores del servidor.
 *
 * Sin imports de valores, como imagenes.ts: node --test no resuelve imports
 * entre hermanos sin extension, y asi lo prueba fotoRevision.test.ts y tambien
 * tests/migration-0020.test.ts, que le pasa a Postgres los nombres que fabrica
 * esta funcion para comprobar que el SQL los acepta.
 *
 * Nada de esto es autoridad: quien decide si una foto se aplica es
 * avatar_admin_decide() en Postgres.
 */

export type EstadoSolicitudFoto = 'pendiente' | 'aprobada' | 'rechazada' | 'sustituida';

/** Lo que Mi perfil necesita saber de la ultima solicitud propia. */
export type SolicitudFotoPropia = {
  id: string;
  status: EstadoSolicitudFoto;
  reason: string | null;
  created_at: string;
};

/** Lo que devuelve avatar_request_submit(). */
export type ResultadoEnvioFoto = 'pendiente' | 'aprobada';

const SUFIJO_LONGITUD = 12;

/**
 * Nombres de los dos ficheros de una foto: `<uid>/avatar-<hora>-<azar>.jpg` y
 * su miniatura. El azar no es adorno: el bucket es publico y la foto pendiente
 * se puede leer por URL antes de aprobarse, asi que el nombre no tiene que
 * poder adivinarse sabiendo el uid (que se ve) y la hora (que se acota).
 *
 * `azar` se inyecta (Math.random en la app) para que sea determinista en los
 * tests. Tiene que caber en el patron que exige avatar_request_submit():
 * `<uid>/[A-Za-z0-9._-]{1,120}`.
 */
export function nombresFicheroAvatar(
  userId: string,
  ahora: number,
  azar: () => number,
): { foto: string; miniatura: string } {
  const sufijo = Array.from({ length: SUFIJO_LONGITUD }, () => Math.floor(azar() * 36).toString(36)).join('');
  const base = `${userId}/avatar-${ahora.toString(36)}-${sufijo}`;
  return { foto: `${base}.jpg`, miniatura: `${base}-mini.jpg` };
}

export type AvisoFoto = { tono: 'info' | 'error'; texto: string };

/**
 * Lo que se le dice a la persona bajo su foto. Solo hay aviso mientras hay algo
 * que decir: en revision, o rechazada (con el motivo que escribio el admin).
 * Una aprobada o sustituida no dice nada: la foto ya esta puesta, o ya hay otra
 * en camino.
 */
export function avisoDeSolicitud(solicitud: SolicitudFotoPropia | null): AvisoFoto | null {
  if (!solicitud) return null;
  if (solicitud.status === 'pendiente') {
    return {
      tono: 'info',
      texto: 'Tu foto nueva está en revisión. Mientras tanto se sigue viendo la anterior.',
    };
  }
  if (solicitud.status === 'rechazada') {
    const motivo = solicitud.reason?.trim();
    return {
      tono: 'error',
      texto: motivo
        ? `Tu última foto no se aprobó: ${motivo}. Puedes subir otra.`
        : 'Tu última foto no se aprobó. Puedes subir otra.',
    };
  }
  return null;
}

/** Lo que dice la pantalla tras enviar, segun lo que contesto el servidor. */
export function mensajeTrasEnviar(resultado: ResultadoEnvioFoto): string {
  return resultado === 'aprobada'
    ? 'Foto de perfil actualizada.'
    : 'Foto enviada. Un administrador la revisará; mientras tanto se sigue viendo la anterior.';
}

const CODIGOS_FOTO =
  /\b(NOT_AUTHENTICATED|PROFILE_MISSING|NOT_A_MEMBER|TOO_MANY_REQUESTS|INVALID_PATH|FILE_MISSING|PATH_ALREADY_USED|INVALID_URL|AVATAR_NEEDS_REVIEW)\b/;

/** El codigo que grito el SQL, o null si el error no es de esta funcion. */
export function codigoErrorFoto(mensaje: string): string | null {
  const encontrado = CODIGOS_FOTO.exec(mensaje);
  return encontrado ? encontrado[1] : null;
}

/** Texto para la persona. Un error que no conoce pasa tal cual, sin tragarselo. */
export function traducirErrorFoto(mensaje: string): string {
  switch (codigoErrorFoto(mensaje)) {
    case 'NOT_AUTHENTICATED':
      return 'Vuelve a entrar en tu cuenta.';
    case 'PROFILE_MISSING':
      return 'No se encuentra tu perfil.';
    case 'INVALID_PATH':
    case 'FILE_MISSING':
      return 'La foto no llegó bien al servidor. Prueba otra vez.';
    case 'PATH_ALREADY_USED':
      return 'Esa foto ya se envió. Prueba otra vez.';
    case 'INVALID_URL':
      return 'La dirección de la foto no es válida.';
    case 'AVATAR_NEEDS_REVIEW':
      return 'Las fotos nuevas las aprueba un administrador.';
    case 'NOT_A_MEMBER':
      return 'Para cambiar tu foto tienes que estar dentro de una ruta. Entra con el enlace de invitación.';
    case 'TOO_MANY_REQUESTS':
      return 'Has enviado muchas fotos hoy. Prueba otra vez mañana.';
    default:
      return mensaje;
  }
}
