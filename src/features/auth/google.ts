import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '../../lib/supabase';
import { extraerCodigo, extraerErrorVuelta, traducirErrorGoogle } from './googleUrl';

/**
 * Entrar con Google en el movil: abre el navegador del sistema (NUNCA una
 * WebView: Google la bloquea) y vuelve por el esquema rutadebares://.
 *
 * Flujo PKCE: Supabase devuelve la URL de Google (skipBrowserRedirect: sin ella
 * intentaria redirigir una web que aqui no existe), el navegador vuelve con un
 * `code` y aqui se canjea por la sesion. AuthGate reacciona al cambio.
 *
 * `rutadebares://auth-callback` tiene que estar en Redirect URLs de Supabase Auth
 * (docs/SETUP.md). Devuelve false si la persona cierra el navegador sin
 * terminar: no es un error y no hay nada que enseñarle.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(traducirErrorGoogle(error.message));
  if (!data.url) throw new Error('No se pudo abrir Google.');

  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (resultado.type !== 'success') return false;

  const errorVuelta = extraerErrorVuelta(resultado.url);
  if (errorVuelta) throw new Error(traducirErrorGoogle(errorVuelta));
  const codigo = extraerCodigo(resultado.url);
  if (!codigo) throw new Error('Google no devolvio ningun codigo. Prueba otra vez.');

  const { error: errorCanje } = await supabase.auth.exchangeCodeForSession(codigo);
  if (errorCanje) throw new Error(traducirErrorGoogle(errorCanje.message));
  return true;
}
