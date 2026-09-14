// POST /functions/v1/create-invite
// Cabecera: Authorization: Bearer <access_token de un admin>
// Cuerpo:   { "label"?: string, "expiresInDays"?: number }
// Devuelve: { "token": string, "expiresAt": string, "id": string }
//
// El token se devuelve UNA vez, aqui. La base de datos solo guarda su sha256,
// asi que no se puede volver a consultar: si el admin lo pierde, crea otro.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, fail, generateToken, hashToken, json } from '../_shared/invite.ts';

const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Usa POST.', 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return fail('NO_AUTH', 'Falta el token de sesion.', 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) {
    return fail('NO_AUTH', 'Sesion no valida.', 401);
  }

  // La comprobacion de rol se hace aqui con service_role y no se delega a RLS:
  // esta funcion escribe con service_role, que salta RLS por definicion.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return fail('NOT_ADMIN', 'Solo los administradores pueden crear invitaciones.', 403);
  }

  let body: { label?: unknown; expiresInDays?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Cuerpo vacio es valido: todo son opcionales.
  }

  const label = typeof body.label === 'string' ? body.label.slice(0, 120) : '';
  const dias =
    typeof body.expiresInDays === 'number' && Number.isFinite(body.expiresInDays)
      ? Math.min(MAX_EXPIRY_DAYS, Math.max(1, Math.floor(body.expiresInDays)))
      : DEFAULT_EXPIRY_DAYS;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error: insertError } = await admin
    .from('invites')
    .insert({
      token_hash: await hashToken(token),
      label,
      created_by: userData.user.id,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single();

  if (insertError || !invite) {
    return fail('INSERT_FAILED', insertError?.message ?? 'No se pudo crear la invitacion.', 500);
  }

  return json({ token, id: invite.id, expiresAt: invite.expires_at }, 201);
});
