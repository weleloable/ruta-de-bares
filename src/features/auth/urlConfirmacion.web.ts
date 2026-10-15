import Constants from 'expo-constants';

import { rutasPwa } from '../../lib/pwa-rutas';
import { urlConfirmacionWeb } from './confirmacionUrl';

/**
 * Web: el enlace del correo vuelve a la app, y a /invitacion si venia de una
 * (ver confirmacionUrl.ts). Sin esto manda la Site URL de Supabase.
 */
export function urlConfirmacion(token: string | null): string | undefined {
  const alcance = rutasPwa(Constants.expoConfig?.experiments?.baseUrl).alcance;
  return urlConfirmacionWeb(window.location.origin, alcance, token);
}
