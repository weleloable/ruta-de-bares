// Utilidades compartidas por create-invite y redeem-invite (Deno).

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function fail(code: string, message: string, status: number): Response {
  return json({ error: code, message }, status);
}

/** 32 bytes aleatorios en base64url, 43 caracteres. Igual que src/features/invites/link.ts. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** sha256 en hexadecimal. Es lo unico que toca la base de datos. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Deliberadamente permisivo: quien valida de verdad el correo es Supabase Auth.
// Esto solo evita ir al servidor con basura obvia.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(email: unknown, password: unknown): string | null {
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return 'Correo electronico no valido.';
  }
  if (typeof password !== 'string' || password.length < 8) {
    return 'La contrasena debe tener al menos 8 caracteres.';
  }
  if (password.length > 72) {
    return 'La contrasena no puede pasar de 72 caracteres.';
  }
  return null;
}
