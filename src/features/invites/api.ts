import { supabase } from '../../lib/supabase';
import type { InviteRow } from '../../types/database';

export { inviteStatus, type InviteStatus } from './estado';

export type CreatedInvite = { id: string; token: string; expiresAt: string };

type FunctionError = { error?: string; message?: string };

function mensajeDeError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const { message } = payload as FunctionError;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return fallback;
}

/**
 * Crea una invitacion. El token vuelve UNA sola vez, en esta respuesta: la base
 * de datos solo guarda su sha256. Si el admin lo pierde, crea otra invitacion.
 */
export async function createInvite(label: string, expiresInDays = 7): Promise<CreatedInvite> {
  const { data, error } = await supabase.functions.invoke<CreatedInvite>('create-invite', {
    body: { label, expiresInDays },
  });

  if (error) {
    // functions.invoke mete el cuerpo del error en context.
    const contexto = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (contexto?.json) {
      try {
        throw new Error(mensajeDeError(await contexto.json(), error.message));
      } catch (e) {
        if (e instanceof Error) throw e;
      }
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error('La funcion no devolvio la invitacion.');
  return data;
}

/** Canje. Se llama SIN sesion: es la unica via de alta en la app. */
export async function redeemInvite(input: {
  token: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<void> {
  const { error } = await supabase.functions.invoke('redeem-invite', { body: input });
  if (!error) return;

  const contexto = (error as { context?: { json?: () => Promise<unknown> } }).context;
  if (contexto?.json) {
    try {
      const cuerpo = await contexto.json();
      throw new Error(mensajeDeError(cuerpo, error.message));
    } catch (e) {
      if (e instanceof Error) throw e;
    }
  }
  throw new Error(error.message);
}

export async function listInvites(): Promise<InviteRow[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Anular una invitacion sin usar: se borra la fila, el token deja de existir. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.from('invites').delete().eq('id', inviteId);
  if (error) throw new Error(error.message);
}

