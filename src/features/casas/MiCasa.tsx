import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useActiveRoute } from '../routes/ActiveRouteProvider';
import { esCasa, type IdCasa } from './casas';

/**
 * Tu casa (0043), para toda la app: el perfil la ensena y, la primera vez,
 * sale la animacion de descubrimiento. Se asigna en el servidor al entrar en
 * tu primera ruta, asi que se vuelve a mirar cuando cambian tus rutas.
 */
type Estado = {
  casa: IdCasa | null;
  /** Ya vio la animacion de "tu casa es...". */
  vista: boolean;
  marcarVista: () => Promise<void>;
};

const Contexto = createContext<Estado>({ casa: null, vista: true, marcarVista: async () => {} });

export function MiCasaProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { routes } = useActiveRoute();
  const yo = session?.user.id ?? null;
  const [casa, setCasa] = useState<IdCasa | null>(null);
  const [vista, setVista] = useState(true);

  useEffect(() => {
    if (!yo) {
      setCasa(null);
      setVista(true);
      return;
    }
    let vigente = true;
    void supabase
      .from('user_houses')
      .select('house, seen_at')
      .eq('user_id', yo)
      .maybeSingle()
      .then(({ data }) => {
        if (!vigente) return;
        setCasa(esCasa(data?.house) ? data.house : null);
        setVista(data ? data.seen_at !== null : true);
      });
    return () => {
      vigente = false;
    };
    // Las rutas cambian al canjear una invitacion: es cuando puede llegar la casa.
  }, [yo, routes]);

  const marcarVista = useCallback(async () => {
    setVista(true);
    await supabase.rpc('casa_marcar_vista');
  }, []);

  return <Contexto.Provider value={{ casa, vista, marcarVista }}>{children}</Contexto.Provider>;
}

export function useMiCasa(): Estado {
  return useContext(Contexto);
}
