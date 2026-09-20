import { supabase } from '../../lib/supabase';
import { contarMensajes, listarMensajes } from '../contacto/api';
import type {
  AvatarAdminRequestRow,
  ModeracionRow,
  MatchAdminReportMessageRow,
  MatchAdminReportRow,
  MatchAdminTicketRow,
  MatchReportResolution,
} from '../../types/database';
import { alertaDeDenuncia, alertaDeMensaje, alertaDeSolicitudFoto, ordenarAlertas, type Alerta } from './alertas';

/**
 * Llamadas de "Alertas de administracion". Todas son funciones match_admin_*
 * (0009 y 0013): las tablas no tienen privilegios para la app y cada funcion
 * exige `is_admin()` en el servidor, asi que esconder el boton en la pantalla
 * es comodidad, nunca la proteccion.
 *
 * Ninguna de estas llamadas abre un chat: lo unico legible son los mensajes que
 * la persona denunciante copio en su denuncia (D10).
 */

export class ErrorAdmin extends Error {
  readonly codigo: string | null;

  constructor(mensajeServidor: string) {
    super(describirError(mensajeServidor));
    this.name = 'ErrorAdmin';
    this.codigo = codigo(mensajeServidor);
  }
}

/** El codigo que grito el SQL, para decidir que hacer sin mirar el texto. */
function codigo(mensaje: string): string | null {
  const encontrado =
    // Incluye REASON_* aunque describirError ya los traducia: este patron no los
    // dejaba pasar y el mensaje llegaba a la pantalla como texto crudo.
    /\b(NOT_ADMIN|NOT_AUTHENTICATED|REPORT_NOT_FOUND|INVALID_RESOLUTION|TARGET_IS_ADMIN|INVALID_TARGET|REASON_REQUIRED|REASON_TOO_LONG|REQUEST_NOT_FOUND|REQUEST_NOT_PENDING|INVALID_URL|FILE_MISSING)\b/.exec(
      mensaje,
    );
  return encontrado ? encontrado[1] : null;
}

function describirError(mensaje: string): string {
  switch (codigo(mensaje)) {
    case 'NOT_ADMIN':
      return 'Esto es solo para quien está detrás de la barra.';
    case 'NOT_AUTHENTICATED':
      return 'Vuelve a entrar en tu cuenta.';
    case 'REPORT_NOT_FOUND':
      return 'Esa alerta ya no existe.';
    case 'INVALID_RESOLUTION':
      return 'Esa forma de cerrar la alerta no vale.';
    case 'TARGET_IS_ADMIN':
      return 'A un administrador no se le expulsa desde aquí.';
    case 'INVALID_TARGET':
      return 'Falta saber a quién y de qué ruta.';
    case 'REASON_REQUIRED':
      return 'Escribe el motivo: hay que decirle a la persona por qué.';
    case 'REASON_TOO_LONG':
      return 'El motivo no puede pasar de 500 caracteres.';
    case 'REQUEST_NOT_FOUND':
      return 'Esa foto ya no está pendiente: la persona ha subido otra o se ha borrado la cuenta.';
    case 'REQUEST_NOT_PENDING':
      return 'Otra persona ya ha decidido esta foto, o la persona ha subido otra.';
    case 'INVALID_URL':
      return 'La dirección de la foto no es válida.';
    case 'FILE_MISSING':
      return 'La persona ha borrado la foto después de enviarla: no se puede aprobar. Recházala y que suba otra.';
    default:
      return mensaje;
  }
}

function fallo(error: { message: string }): never {
  throw new ErrorAdmin(error.message);
}

/**
 * La bandeja. Con `incluirCerradas` trae tambien el historico; sin ella, solo
 * lo que queda por hacer, que es como se abre la pantalla.
 */
export async function listarAlertas(incluirCerradas = false): Promise<Alerta[]> {
  const { data, error } = await supabase.rpc('match_admin_reports', { p_solo_pendientes: !incluirCerradas });
  if (error) fallo(error);
  return ordenarAlertas((data ?? []).map(alertaDeDenuncia));
}

/**
 * Solo el numero, para la burbujita del boton de Mi perfil: denuncias sin
 * cerrar, fotos de perfil pendientes y mensajes a la organizacion sin
 * responder.
 */
export async function contarAlertas(): Promise<number> {
  // Las dos fuentes por separado: si el proyecto aun no tiene la 0020 aplicada
  // (o cae la consulta de fotos) la burbuja cuenta lo otro en vez de
  // desaparecer. Un fallo en las denuncias, en cambio, sigue siendo un fallo:
  // ya lo era antes y no se disimula.
  const [denuncias, fotos, mensajes] = await Promise.all([
    supabase.rpc('match_admin_alert_count'),
    contarSolicitudesFoto().catch(() => 0),
    contarMensajes().catch(() => 0),
  ]);
  if (denuncias.error) fallo(denuncias.error);
  return (denuncias.data ?? 0) + fotos + mensajes;
}

/** Cuantas fotos de perfil esperan aprobacion (0020). */
export async function contarSolicitudesFoto(): Promise<number> {
  const { data, error } = await supabase.rpc('avatar_admin_count');
  if (error) fallo(error);
  return data ?? 0;
}

export async function leerTicket(reportId: string): Promise<MatchAdminTicketRow> {
  const { data, error } = await supabase.rpc('match_admin_report', { p_report_id: reportId });
  if (error) fallo(error);
  const [ticket] = data ?? [];
  if (!ticket) throw new ErrorAdmin('REPORT_NOT_FOUND');
  return ticket;
}

export async function leerMensajesDenunciados(reportId: string): Promise<MatchAdminReportMessageRow[]> {
  const { data, error } = await supabase.rpc('match_admin_report_messages', { p_report_id: reportId });
  if (error) fallo(error);
  return data ?? [];
}

/**
 * Reclama la denuncia al abrirla. Devuelve si la ha cogido esta persona: si ya
 * la tenia otra, no es un fallo y la pantalla simplemente la pinta en revision.
 */
export async function reclamarAlerta(reportId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('match_admin_take', { p_report_id: reportId });
  if (error) fallo(error);
  return data ?? false;
}

/**
 * Cada accion lleva dos textos distintos y no hay que confundirlos:
 *   * `motivo` es lo que SE LE ENSENA a la persona en su aviso. El servidor lo
 *     exige (REASON_REQUIRED): el art. 17 del DSA no deja restringir a nadie
 *     sin decirle por que.
 *   * `nota` es interna, para el registro de moderacion, y no sale del panel.
 */
export async function retirarFoto(
  userId: string,
  motivo: string,
  reportId: string,
  nota: string,
): Promise<void> {
  const { error } = await supabase.rpc('match_admin_remove_photo', {
    p_user_id: userId,
    p_reason: motivo,
    p_report_id: reportId,
    p_note: nota,
  });
  if (error) fallo(error);
}

/**
 * Expulsa de la ruta en la que se le denuncio (0014). Devuelve si de verdad
 * estaba dentro: si otra persona se adelanto, no es un fallo.
 *
 * No borra su cuenta ni sus sellos, y no impide que vuelva con otra invitacion.
 */
export async function expulsarDeRuta(
  userId: string,
  routeId: string,
  motivo: string,
  reportId: string,
  nota: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('match_admin_remove_from_route', {
    p_user_id: userId,
    p_route_id: routeId,
    p_reason: motivo,
    p_report_id: reportId,
    p_note: nota,
  });
  if (error) fallo(error);
  return data ?? false;
}

/**
 * La sancion mas dura: fuera de TODAS las rutas y sin poder volver a ninguna.
 * No borra la cuenta a proposito — quien esta suspendido tiene que poder entrar
 * a leer su aviso, reclamar y llevarse o borrar sus datos.
 */
export async function suspenderCuenta(
  userId: string,
  motivo: string,
  reportId: string,
  nota: string,
): Promise<void> {
  const { error } = await supabase.rpc('match_admin_suspend', {
    p_user_id: userId,
    p_reason: motivo,
    p_report_id: reportId,
    p_note: nota,
  });
  if (error) fallo(error);
}

/** Los tres vetos se retiran; devuelven si habia algo que retirar. */
export async function retirarVetoCana(userId: string, nota = ''): Promise<boolean> {
  const { data, error } = await supabase.rpc('match_admin_lift_cana', { p_user_id: userId, p_note: nota });
  if (error) fallo(error);
  return data ?? false;
}

export async function retirarVetoRuta(userId: string, routeId: string, nota = ''): Promise<boolean> {
  const { data, error } = await supabase.rpc('match_admin_lift_route_ban', {
    p_user_id: userId,
    p_route_id: routeId,
    p_note: nota,
  });
  if (error) fallo(error);
  return data ?? false;
}

export async function reactivarCuenta(userId: string, nota = ''): Promise<boolean> {
  const { data, error } = await supabase.rpc('match_admin_unsuspend', { p_user_id: userId, p_note: nota });
  if (error) fallo(error);
  return data ?? false;
}

/**
 * Todo lo que se le ha hecho a alguien: los vetos que siguen puestos y lo que
 * se hizo en su dia. Es la unica via para retirar un veto cuando la denuncia
 * que lo origino ya se cerro (o desaparecio con la cuenta).
 */
export async function listarModeraciones(): Promise<ModeracionRow[]> {
  const { data, error } = await supabase.rpc('match_admin_moderaciones');
  if (error) fallo(error);
  return data ?? [];
}

export async function desactivarCana(
  userId: string,
  motivo: string,
  reportId: string,
  nota: string,
): Promise<void> {
  const { error } = await supabase.rpc('match_admin_deactivate', {
    p_user_id: userId,
    p_reason: motivo,
    p_report_id: reportId,
    p_note: nota,
  });
  if (error) fallo(error);
}

export async function resolverAlerta(
  reportId: string,
  resolucion: MatchReportResolution,
  nota: string,
): Promise<void> {
  const { error } = await supabase.rpc('match_admin_resolve', {
    p_report_id: reportId,
    p_resolution: resolucion,
    p_note: nota,
  });
  if (error) fallo(error);
}

export type { Alerta, ModeracionRow, MatchAdminReportRow, MatchAdminTicketRow };

// ---------------------------------------------------------------------------
// Fotos de perfil pendientes de aprobar (0020)
// ---------------------------------------------------------------------------

const AVATAR_BUCKET = 'avatars';

/** URL publica de un fichero del bucket de fotos: la que se ve y la que se guarda al aprobar. */
export function urlPublicaAvatar(ruta: string): string {
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(ruta).data.publicUrl;
}

async function leerSolicitudesFoto(incluirCerradas: boolean): Promise<AvatarAdminRequestRow[]> {
  const { data, error } = await supabase.rpc('avatar_admin_requests', { p_solo_pendientes: !incluirCerradas });
  if (error) fallo(error);
  return data ?? [];
}

/**
 * Las solicitudes de foto, ya como alertas para mezclarlas con las denuncias en
 * la bandeja. Sin `incluirCerradas` solo las pendientes.
 */
export async function listarSolicitudesFoto(incluirCerradas = false): Promise<Alerta[]> {
  return (await leerSolicitudesFoto(incluirCerradas)).map(alertaDeSolicitudFoto);
}

/**
 * Una solicitud para su pantalla. No hay funcion de "una sola": se pide la
 * lista (con historico, para poder ensenar una ya decidida) y se busca. Si no
 * sale es porque la persona subio otra encima o se borro la cuenta.
 */
export async function leerSolicitudFoto(requestId: string): Promise<AvatarAdminRequestRow> {
  const fila = (await leerSolicitudesFoto(true)).find((f) => f.id === requestId);
  if (!fila) throw new ErrorAdmin('REQUEST_NOT_FOUND');
  return fila;
}

/**
 * Aprueba o rechaza. Al aprobar se mandan las URL publicas de los dos ficheros:
 * las construye esta app, la del admin (de confianza), porque el servidor no
 * conoce la URL base del proyecto y no debe fiarse de una que traiga un
 * usuario. Aun asi comprueba que terminen en la ruta de esa solicitud.
 * Rechazar exige motivo: es lo que ve la persona.
 */
export async function decidirFoto(
  solicitud: Pick<AvatarAdminRequestRow, 'id' | 'foto_path' | 'thumb_path'>,
  decision: { aprobar: true } | { aprobar: false; motivo: string },
): Promise<void> {
  const { error } = await supabase.rpc('avatar_admin_decide', {
    p_request_id: solicitud.id,
    p_approve: decision.aprobar,
    p_reason: decision.aprobar ? '' : decision.motivo,
    p_foto_url: decision.aprobar ? urlPublicaAvatar(solicitud.foto_path) : null,
    p_thumb_url: decision.aprobar ? urlPublicaAvatar(solicitud.thumb_path) : null,
  });
  if (error) fallo(error);
}

export type { AvatarAdminRequestRow };

/** Los mensajes a la organizacion, ya como alertas para la bandeja (0026). */
export async function listarAlertasMensajes(incluirCerrados = false): Promise<Alerta[]> {
  return (await listarMensajes(incluirCerrados)).map(alertaDeMensaje);
}
