import { supabase } from '../../lib/supabase';
import type { AdminMessageRow, MensajeKind, MiMensajeRow } from '../../types/database';
import { traducirErrorMensaje } from './reglas';

/**
 * El canal de contacto y reclamacion (0026).
 *
 * Todo pasa por funciones `SECURITY DEFINER`: `user_messages` no tiene
 * privilegios para la app, asi que nadie lee los mensajes de otra persona ni se
 * inventa una respuesta.
 *
 * Lo importante de `enviarMensaje`: **no exige estar en una ruta ni estar sin
 * sancion**, al reves que denunciar o bloquear (0016). Quien mas necesita este
 * canal es justo la cuenta suspendida o expulsada.
 */

export async function enviarMensaje(
  kind: MensajeKind,
  cuerpo: string,
  noticeId: string | null = null,
): Promise<string> {
  const { data, error } = await supabase.rpc('send_admin_message', {
    p_kind: kind,
    p_body: cuerpo,
    p_notice_id: noticeId,
  });
  if (error) throw new Error(traducirErrorMensaje(error.message));
  return data as string;
}

/** Lo que he escrito y que me han contestado. */
export async function misMensajes(): Promise<MiMensajeRow[]> {
  const { data, error } = await supabase.rpc('my_admin_messages');
  if (error) throw new Error(traducirErrorMensaje(error.message));
  return data ?? [];
}

/** La bandeja, para admins. Sin `incluirCerrados`, solo lo que espera. */
export async function listarMensajes(incluirCerrados = false): Promise<AdminMessageRow[]> {
  const { data, error } = await supabase.rpc('admin_messages', { p_solo_pendientes: !incluirCerrados });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Cuantos esperan, para la burbujita de Mi perfil. */
export async function contarMensajes(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_message_count');
  if (error) throw new Error(error.message);
  return data ?? 0;
}

/**
 * Se reclama al ABRIRLO, no con un boton: con dos admins en la misma bandeja,
 * si no, los dos se ponen con lo mismo (misma decision que la 0013 para las
 * denuncias). Devuelve false si otra persona llego antes.
 */
export async function reclamarMensaje(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_take_message', { p_id: id });
  if (error) throw new Error(error.message);
  return data ?? false;
}

/** Responder cierra el mensaje y genera un aviso para la persona. */
export async function responderMensaje(id: string, respuesta: string): Promise<void> {
  const { error } = await supabase.rpc('admin_answer_message', { p_id: id, p_answer: respuesta });
  if (error) throw new Error(error.message);
}
