import Constants from 'expo-constants';

import { supabase } from '../../lib/supabase';
import { rutasPwa } from '../../lib/pwa-rutas';
import { traducirErrorGoogle, urlVueltaWeb } from './googleUrl';

/**
 * Entrar con Google en la web: redireccion completa a Google y vuelta a la app.
 * La sesion la recoge supabase-js al cargar la pagina (detectSessionInUrl, ver
 * src/lib/supabase.ts) y AuthGate reacciona: aqui no hay nada mas que hacer, la
 * pagina se va.
 *
 * Vuelve a la RAIZ de la app y no a la pagina de login: el token de una
 * invitacion pendiente vive en localStorage (invites/pendiente.ts) y AuthGate lo
 * usa nada mas haber sesion, igual que al confirmar el correo.
 *
 * Esa URL (localhost:8081 y https://weleloable.github.io/ruta-de-bares/) tiene
 * que estar en Redirect URLs de Supabase Auth (docs/SETUP.md).
 */
export async function signInWithGoogle(): Promise<boolean> {
  const alcance = rutasPwa(Constants.expoConfig?.experiments?.baseUrl).alcance;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: urlVueltaWeb(window.location.origin, alcance) },
  });
  if (error) throw new Error(traducirErrorGoogle(error.message));
  // El navegador ya esta yendo a Google: la promesa se resuelve pero la pagina se descarga.
  return true;
}
