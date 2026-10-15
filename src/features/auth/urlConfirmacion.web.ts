import Constants from 'expo-constants';

import { rutasPwa } from '../../lib/pwa-rutas';
import { urlVueltaWeb } from './googleUrl';

/**
 * El enlace del correo vuelve a la raiz de la app (con la subruta de GitHub
 * Pages), igual que Google. Sin esto manda la Site URL de Supabase, y si esa es
 * la raiz del dominio (weleloable.github.io/) cae en un 404. Esta URL tiene que
 * estar en Redirect URLs de Supabase Auth (docs/SETUP.md), o Supabase la
 * ignora y vuelve a la Site URL.
 */
export function urlConfirmacion(): string | undefined {
  const alcance = rutasPwa(Constants.expoConfig?.experiments?.baseUrl).alcance;
  return urlVueltaWeb(window.location.origin, alcance);
}
