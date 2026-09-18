import { supabase } from '../../lib/supabase';
import type {
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
  const encontrado = /\b(NOT_ADMIN|NOT_AUTHENTICATED|REPORT_NOT_FOUND|INVALID_RESOLUTION)\b/.exec(mensaje);
  return encontrado ? encontrado[1] : null;
}

function describirError(mensaje: string): string {
  switch (codigo(mensaje)) {
    case 'NOT_ADMIN':
      return 'Esto es solo para quien esta detras de la barra.';
    case 'NOT_AUTHENTICATED':
      return 'Vuelve a entrar en tu cuenta.';
    case 'REPORT_NOT_FOUND':
      return 'Esa alerta ya no existe.';
    case 'INVALID_RESOLUTION':
      return 'Esa forma de cerrar la alerta no vale.';
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

export async function retirarFoto(userId: string, reportId: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc('match_admin_remove_photo', {
    p_user_id: userId,
    p_report_id: reportId,
    p_note: nota,
  });
  if (error) fallo(error);
}

export async function desactivarCana(userId: string, reportId: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc('match_admin_deactivate', {
    p_user_id: userId,
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

export type { Alerta, MatchAdminReportRow, MatchAdminTicketRow };
