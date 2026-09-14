// POST /functions/v1/redeem-invite
// Sin sesion (se llama con la anon key): es la unica via para crear una cuenta.
// Cuerpo:   { "token": string, "email": string, "password": string, "displayName"?: string }
// Devuelve: { "ok": true, "email": string }
//
// El registro publico esta DESACTIVADO en Supabase Auth (ver docs/SETUP.md).
// Sin esta funcion no hay forma de darse de alta.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  TOKEN_PATTERN,
  corsHeaders,
  fail,
  hashToken,
  json,
  validateCredentials,
} from '../_shared/invite.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Usa POST.', 405);

  let body: { token?: unknown; email?: unknown; password?: unknown; displayName?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail('BAD_BODY', 'Cuerpo JSON no valido.', 400);
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!TOKEN_PATTERN.test(token)) {
    return fail('BAD_TOKEN', 'El codigo de invitacion no tiene un formato valido.', 400);
  }

  const credentialError = validateCredentials(body.email, body.password);
  if (credentialError) return fail('BAD_CREDENTIALS', credentialError, 400);

  const email = (body.email as string).trim().toLowerCase();
  const password = body.password as string;
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim().length > 0
      ? body.displayName.trim().slice(0, 80)
      : email.split('@')[0];

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Paso 1: reclamar la invitacion ANTES de crear nada.
  // El UPDATE ... WHERE used_at IS NULL es atomico: Postgres bloquea la fila, y
  // de dos peticiones simultaneas con el mismo token solo una ve 1 fila afectada.
  // Reclamar primero y deshacer si falla evita el agujero contrario (crear la
  // cuenta y que el token siga vivo).
  const { data: claimed, error: claimError } = await admin
    .from('invites')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', await hashToken(token))
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();

  if (claimError) {
    return fail('CLAIM_FAILED', claimError.message, 500);
  }
  if (!claimed) {
    // No se distingue "no existe" de "ya usada" de "caducada": decirlo
    // convertiria la funcion en un oraculo para adivinar tokens.
    return fail('INVITE_UNUSABLE', 'Esta invitacion no es valida, ya se ha usado o ha caducado.', 410);
  }

  const releaseInvite = async () => {
    await admin.from('invites').update({ used_at: null, used_by: null }).eq('id', claimed.id);
  };

  // Paso 2: crear el usuario. email_confirm: true porque el admin ya ha
  // verificado a esta persona al mandarle el enlace, y asi no hace falta SMTP.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (createError || !created.user) {
    await releaseInvite();
    const yaExiste = /already|registered|exists/i.test(createError?.message ?? '');
    return fail(
      yaExiste ? 'EMAIL_TAKEN' : 'CREATE_FAILED',
      yaExiste
        ? 'Ese correo ya tiene cuenta. Inicia sesion en vez de usar la invitacion.'
        : (createError?.message ?? 'No se pudo crear la cuenta.'),
      yaExiste ? 409 : 500,
    );
  }

  // Paso 3: cerrar el circulo. El trigger handle_new_user ya creo el perfil con
  // rol 'user'; aqui solo se fija el nombre y se marca quien uso la invitacion.
  // Si algo de esto falla la cuenta ya existe y es usable, asi que no se deshace.
  await admin
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', created.user.id);

  await admin.from('invites').update({ used_by: created.user.id }).eq('id', claimed.id);

  return json({ ok: true, email }, 201);
});
