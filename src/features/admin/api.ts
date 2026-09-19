import { supabase } from '../../lib/supabase';
import type {
  ModeracionRow,
  MatchAdminReportMessageRow,
  MatchAdminReportRow,
  MatchAdminTicketRow,
  MatchReportResolution,
} from '../../types/database';
import { alertaDeDenuncia, ordenarAlertas, type Alerta } from './alertas';

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
    /\b(NOT_ADMIN|NOT_AUTHENTICATED|REPORT_NOT_FOUND|INVALID_RESOLUTION|TARGET_IS_ADMIN|INVALID_TARGET)\b/.exec(mensaje);
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

/** Solo el numero, para la burbujita del boton de Mi perfil. */
export async function contarAlertas(): Promise<number> {
  const { data, error } = await supabase.rpc('match_admin_alert_count');
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
