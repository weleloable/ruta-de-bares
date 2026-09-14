import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { sessionStorage } from './secure-session-store';
import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fallar aqui y no mas adelante: sin esto el error aparece como un 401
  // indescifrable en la primera consulta.
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Copia .env.example a .env, rellena los valores y reinicia con: npx expo start --clear',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    // En movil no hay callback por URL: la sesion no llega nunca en el hash.
    detectSessionInUrl: false,
  },
});

/**
 * supabase-js refresca el token con un temporizador. En segundo plano iOS y
 * Android congelan los temporizadores, asi que al volver del background el
 * token puede estar caducado. Se para el refresco al salir y se reanuda al
 * volver, que ademas fuerza un refresco inmediato.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

export const supabaseFunctionsUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
