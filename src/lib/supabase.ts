import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Variables EXPO_PUBLIC_* se inlinean en build time (soporte nativo de Expo
// para .env, ver https://docs.expo.dev/versions/v57.0.0/guides/environment-variables/).
// Ver .env.example para lo que hay que rellenar.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** false hasta que exista un .env real: App.tsx muestra una pantalla de
 * configuración en vez de esto, así que todo lo demás asume "true" y usa
 * `supabase` sin comprobar null en cada sitio. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : (null as unknown as SupabaseClient);
