import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '../../lib/supabase';
import type { ProfileRow } from '../../types/database';
import { olvidarFirmasDeAvatar } from '../profile/avatarFirmado';

type AuthState = {
  /** null = sin sesion. undefined nunca: `loading` cubre el "aun no lo se". */
  session: Session | null;
  profile: ProfileRow | null;
  isAdmin: boolean;
  /** true hasta que se sabe si hay sesion Y se ha resuelto su perfil. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Alta abierta (migracion 0004). Devuelve false cuando Supabase exige
   * confirmar el correo y por tanto NO deja sesion abierta: la pantalla tiene
   * que decir "mira tu correo" en vez de quedarse esperando a un AuthGate que
   * no va a disparar.
   */
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Mensajes de Supabase Auth traducidos. El resto pasa tal cual. */
export function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Correo o contrasena incorrectos.';
  if (/email not confirmed/i.test(message)) return 'Esta cuenta aun no esta confirmada.';
  // Desde 0004 el alta es abierta, asi que este error ya no es una regla del
  // producto sino un despiste de configuracion: falta activar el registro en
  // Supabase Auth (ver docs/SETUP.md).
  if (/signups? not allowed|signup is disabled/i.test(message)) {
    return 'El registro esta desactivado en el servidor. Avisa a un administrador.';
  }
  if (/user already registered|already registered/i.test(message)) {
    return 'Ese correo ya tiene cuenta. Inicia sesion.';
  }
  if (/password.*(6|8|at least|should be)/i.test(message)) {
    return 'La contrasena es demasiado corta.';
  }
  if (/rate limit|too many requests/i.test(message)) {
    return 'Demasiados intentos. Prueba en unos minutos.';
  }
  if (/network|fetch/i.test(message)) return 'Sin conexion con el servidor.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  // El usuario cuyo perfil se esta pidiendo. Evita que una respuesta lenta de
  // un usuario anterior pise el perfil del actual al cambiar de cuenta.
  const usuarioPedido = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    usuarioPedido.current = userId;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (usuarioPedido.current !== userId) return;
    if (error) {
      console.warn('[auth] no se pudo cargar el perfil:', error.message);
      setProfile(null);
      return;
    }
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      if (activo) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, nuevaSesion) => {
      if (!activo) return;
      setSession(nuevaSesion);
      if (!nuevaSesion) {
        usuarioPedido.current = null;
        setProfile(null);
        // Una URL firmada de una foto (0023) es una llave temporal concedida a
        // QUIEN la pidio. Aqui y no en signOut() porque borrar la cuenta cierra
        // la sesion por su cuenta (`scope: 'local'`), sin pasar por alli.
        olvidarFirmasDeAvatar();
        setLoading(false);
        return;
      }
      // TOKEN_REFRESHED llega cada hora y no cambia quien eres: recargar el
      // perfil ahi solo produce parpadeos en la UI.
      if (event !== 'TOKEN_REFRESHED') {
        await loadProfile(nuevaSesion.user.id);
      }
      if (activo) setLoading(false);
    });

    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    // Sin espacios y <= 30: lo exige profiles_display_name_formato (0003). Si
    // el nombre ya lo tiene otro rutero, handle_new_user le pone "-2", "-3"...
    // y el alta no falla, solo cambia el nombre final.
    const nombre = displayName.replace(/\s/g, '').slice(0, 30);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: nombre.length > 0 ? { display_name: nombre } : undefined },
    });
    if (error) throw new Error(translateAuthError(error.message));
    // Con la confirmacion por correo activada, Supabase crea el usuario pero no
    // devuelve sesion. Distinguirlo es lo que evita dejar la pantalla colgada.
    return data.session !== null;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(translateAuthError(error.message));
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user.id;
    if (userId) await loadProfile(userId);
  }, [session?.user.id, loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      isAdmin: profile?.role === 'admin',
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>');
  return contexto;
}
