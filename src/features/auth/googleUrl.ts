/**
 * Piezas puras del inicio de sesion con Google (sin red ni window, para Node).
 * La llamada de verdad esta en google.ts (nativo) y google.web.ts (web).
 */

/**
 * A donde vuelve la web tras Google: la raiz de la app, con la subruta de
 * GitHub Pages si la hay (/ruta-de-bares/). Tiene que estar en Redirect URLs de
 * Supabase Auth, o Supabase la rechaza y manda a la Site URL.
 */
export function urlVueltaWeb(origen: string, alcance: string): string {
  return `${origen.replace(/\/+$/, '')}${alcance.startsWith('/') ? alcance : `/${alcance}`}`;
}

/** El `code` de PKCE de la URL a la que vuelve el navegador, o null si no viene. */
export function extraerCodigo(url: string): string | null {
  const consulta = url.split('#')[0].split('?')[1];
  if (!consulta) return null;
  return new URLSearchParams(consulta).get('code');
}

/** El error que Google/Supabase devuelven en la URL de vuelta (persona que cancela, etc.). */
export function extraerErrorVuelta(url: string): string | null {
  const partes = [url.split('#')[0].split('?')[1], url.split('#')[1]].filter(Boolean) as string[];
  for (const parte of partes) {
    const params = new URLSearchParams(parte);
    const descripcion = params.get('error_description') ?? params.get('error');
    if (descripcion) return descripcion;
  }
  return null;
}

/** Mensajes de Google/Supabase en lenguaje de persona; el resto pasa tal cual. */
export function traducirErrorGoogle(mensaje: string): string {
  if (/provider is not enabled|unsupported provider/i.test(mensaje)) {
    return 'Entrar con Google aun no esta activado en el servidor. Avisa a un administrador.';
  }
  if (/access_denied|user denied|cancel/i.test(mensaje)) {
    return 'Has cancelado el acceso con Google.';
  }
  if (/redirect/i.test(mensaje) && /(not allowed|invalid|mismatch)/i.test(mensaje)) {
    return 'Google no puede volver a la app: falta permitir esta direccion en Supabase.';
  }
  if (/disallowed_useragent/i.test(mensaje)) {
    return 'Google no deja entrar desde este navegador. Abre el enlace en Chrome o Safari.';
  }
  if (/network|fetch/i.test(mensaje)) return 'Sin conexion con el servidor.';
  return mensaje;
}
