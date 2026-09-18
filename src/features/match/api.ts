import { supabase } from '../../lib/supabase';
import type {
  BeerAnswer,
  BeerQuestionState,
  MatchCatalogRow,
  MatchConnectionDetail,
  MatchGridRow,
  MatchInboxRow,
  MatchMessageRow,
  MatchProfileState,
  MatchVote,
} from '../../types/database';
import { codigoErrorCana, describirErrorCana } from './reglas';

/**
 * Llamadas de "Tirate una cana". Solo funciones match_* y los catalogos: las
 * tablas no tienen privilegios para la app (ver 0004_tirate_una_cana.sql).
 * Cada error sale ya traducido para ensenarlo tal cual.
 */

/** Error con el mensaje para ensenar y el codigo del SQL para decidir que hacer. */
export class ErrorCana extends Error {
  readonly codigo: string | null;

  constructor(mensajeServidor: string) {
    super(describirErrorCana(mensajeServidor));
    this.name = 'ErrorCana';
    this.codigo = codigoErrorCana(mensajeServidor);
  }
}

function fallo(error: { message: string }): never {
  throw new ErrorCana(error.message);
}

export async function getMatchProfile(): Promise<MatchProfileState> {
  const { data, error } = await supabase.rpc('match_get_profile');
  if (error) fallo(error);
  const [perfil] = data ?? [];
  if (!perfil) throw new Error('No se pudo leer tu perfil cervecero.');
  return perfil;
}

/**
 * Activa la feature. La primera vez hace falta todo (mayoria de edad, frase y
 * etiquetas); despues basta sin argumentos, porque desactivar es una pausa.
 */
export async function activateMatch(primeraVez?: {
  mayorDeEdad: boolean;
  bio: string;
  etiquetas: string[];
}): Promise<void> {
  const { error } = await supabase.rpc(
    'match_activate',
    primeraVez
      ? { p_adult_confirmed: primeraVez.mayorDeEdad, p_bio: primeraVez.bio, p_tag_ids: primeraVez.etiquetas }
      : {},
  );
  if (error) fallo(error);
}

export async function deactivateMatch(): Promise<void> {
  const { error } = await supabase.rpc('match_deactivate');
  if (error) fallo(error);
}

export async function updateMatchProfile(bio: string, etiquetas: string[]): Promise<void> {
  const { error } = await supabase.rpc('match_update_profile', { p_bio: bio, p_tag_ids: etiquetas });
  if (error) fallo(error);
}

/** Quien lo tiene activado en la ruta, con tu voto. El orden lo decide el servidor (D12). */
export async function getMatchGrid(routeId: string): Promise<MatchGridRow[]> {
  const { data, error } = await supabase.rpc('match_grid', { p_route_id: routeId });
  if (error) fallo(error);
  return data ?? [];
}

/**
 * Da o quita un Me gusta. Quitarlo deja a la persona en Visto. Devuelve tu
 * voto y la conexion si el Me gusta la ha abierto (o sigue abierta).
 */
export async function setMatchLike(
  routeId: string,
  targetId: string,
  liked: boolean,
): Promise<{ myVote: MatchVote; connectionId: string | null }> {
  const { data, error } = await supabase.rpc('match_set_like', {
    p_route_id: routeId,
    p_target_id: targetId,
    p_liked: liked,
  });
  if (error) fallo(error);
  const [fila] = data ?? [];
  return { myVote: fila?.my_vote ?? (liked ? 'like' : 'seen'), connectionId: fila?.connection_id ?? null };
}

/** Apunta que has abierto su ficha (Visto). No rebaja un Me gusta. */
export async function markMatchSeen(routeId: string, targetId: string): Promise<void> {
  const { error } = await supabase.rpc('match_mark_seen', { p_route_id: routeId, p_target_id: targetId });
  if (error) fallo(error);
}

/** Conexiones abiertas; primero lo que espera tu respuesta (lo ordena el servidor). */
export async function getMatchInbox(routeId: string): Promise<MatchInboxRow[]> {
  const { data, error } = await supabase.rpc('match_inbox', { p_route_id: routeId });
  if (error) fallo(error);
  return data ?? [];
}

export async function getMatchConnection(connectionId: string): Promise<MatchConnectionDetail> {
  const { data, error } = await supabase.rpc('match_get_connection', { p_connection_id: connectionId });
  if (error) fallo(error);
  const [detalle] = data ?? [];
  if (!detalle) throw new Error('Esta conversación no existe.');
  return detalle;
}

/** Mensajes desde `despues` (null = todos). Tambien marca la conversacion como leida. */
export async function fetchMatchMessages(connectionId: string, despues: string | null): Promise<MatchMessageRow[]> {
  const { data, error } = await supabase.rpc('match_fetch_messages', {
    p_connection_id: connectionId,
    p_after: despues,
  });
  if (error) fallo(error);
  return data ?? [];
}

async function enviado(
  peticion: PromiseLike<{ data: MatchMessageRow[] | null; error: { message: string } | null }>,
): Promise<MatchMessageRow> {
  const { data, error } = await peticion;
  if (error) fallo(error);
  const [mensaje] = data ?? [];
  if (!mensaje) throw new Error('No se pudo enviar.');
  return mensaje;
}

export function sendMatchText(connectionId: string, body: string): Promise<MatchMessageRow> {
  return enviado(supabase.rpc('match_send_text', { p_connection_id: connectionId, p_body: body }));
}

export function askBeer(connectionId: string): Promise<MatchMessageRow> {
  return enviado(supabase.rpc('match_ask_beer', { p_connection_id: connectionId }));
}

/** Tras un "no" la conexion queda cerrada: is_open llega a false. */
export async function answerBeer(
  connectionId: string,
  answer: BeerAnswer,
): Promise<{ questionState: BeerQuestionState; isOpen: boolean }> {
  const { data, error } = await supabase.rpc('match_answer_beer', {
    p_connection_id: connectionId,
    p_answer: answer,
  });
  if (error) fallo(error);
  const [fila] = data ?? [];
  if (!fila) throw new Error('No se pudo guardar tu respuesta.');
  return { questionState: fila.question_state, isOpen: fila.is_open };
}

export async function listMatchTags(): Promise<MatchCatalogRow[]> {
  const { data, error } = await supabase.from('match_tags').select('*').order('sort_order');
  if (error) fallo(error);
  return data ?? [];
}
