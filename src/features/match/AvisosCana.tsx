import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useActiveRoute } from '../routes/ActiveRouteProvider';
import { getMatchInbox } from './api';
import { chatsPendientes } from './reglas';

/**
 * Cuantas conversaciones piden atencion, para la burbujita del icono de la
 * pestana Cana.
 *
 * Vive aqui y no en la pantalla de la cana porque el aviso tiene que verse
 * desde Sellos o desde Ruta: si dependiera de la pantalla, solo se enteraria
 * quien ya esta mirando la cana, que es justo quien no lo necesita.
 *
 * Por eso mismo pregunta despacio (cada 60 s, y no cada 15 como la pantalla
 * abierta): son 200 personas preguntando aunque no esten en la cana, y lo
 * urgente ya lo refresca la propia pantalla cuando estas dentro. Se calla con
 * la app en segundo plano y vuelve a preguntar al primer plano.
 */
const REFRESCO_MS = 60_000;

const Contexto = createContext<{ avisos: number; refrescar: () => void; fijar: (cuantos: number) => void }>({
  avisos: 0,
  refrescar: () => {},
  fijar: () => {},
});

export function AvisosCanaProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { activeRoute } = useActiveRoute();
  const [avisos, setAvisos] = useState(0);
  const yo = session?.user.id ?? '';
  const rutaId = activeRoute?.id ?? null;
  // Sin sesion, sin ruta o con la cana desactivada no hay nada que contar:
  // match_inbox responde con un error y se deja en cero sin insistir.
  const parado = useRef(false);

  const mirar = useCallback(async () => {
    if (!rutaId || !yo) {
      setAvisos(0);
      return;
    }
    try {
      setAvisos(chatsPendientes(await getMatchInbox(rutaId), yo));
      parado.current = false;
    } catch {
      setAvisos(0);
      parado.current = true;
    }
  }, [rutaId, yo]);

  useEffect(() => {
    void mirar();
    const id = setInterval(() => {
      if (AppState.currentState === 'active' && !parado.current) void mirar();
    }, REFRESCO_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      // Al volver del bolsillo, lo primero es mirar si ha pasado algo.
      if (estado === 'active') void mirar();
    });
    return () => {
      clearInterval(id);
      suscripcion.remove();
    };
  }, [mirar]);

  // La pantalla de la cana ya pide la bandeja cada poco: cuando lo hace pone
  // aqui la cuenta y la burbujita se apaga al leer, sin esperar al siguiente
  // minuto ni pedir la bandeja dos veces.
  return <Contexto.Provider value={{ avisos, refrescar: mirar, fijar: setAvisos }}>{children}</Contexto.Provider>;
}

/** Numero para la burbujita; 0 = sin burbujita. */
export function useAvisosCana(): { avisos: number; refrescar: () => void; fijar: (cuantos: number) => void } {
  return useContext(Contexto);
}
