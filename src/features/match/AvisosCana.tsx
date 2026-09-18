import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useActiveRoute } from '../routes/ActiveRouteProvider';
import { getMatchInbox, getMatchProfile } from './api';
import { chatsPendientes } from './reglas';

/**
 * Cuantas conversaciones piden atencion, para la burbujita del icono de la
 * pestana Cana.
 *
 * Vive por encima del Stack y no en la pantalla de la cana porque el aviso
 * tiene que verse desde Sellos o desde Ruta: si dependiera de la pantalla,
 * solo se enteraria quien ya esta mirando la cana, que es justo quien no lo
 * necesita.
 *
 * **Quien no tiene la cana activada no pregunta nada.** Al arrancar se mira el
 * perfil una vez (una fila) y ahi acaba todo para esas personas: sin eso, cada
 * vuelta al primer plano gastaba una peticion que el servidor rechazaba con
 * MATCH_NOT_ACTIVE. Activar o desactivar desde la pestana avisa a este
 * proveedor, asi que la burbujita arranca o se apaga sin recargar la app.
 *
 * Con la cana activada pregunta cada 60 s, no cada 15 como la pantalla
 * abierta: son 200 personas preguntando aunque no esten dentro, y lo urgente
 * ya lo refresca la propia pantalla. Se calla en segundo plano y mira nada mas
 * volver al primer plano.
 */
const REFRESCO_MS = 60_000;

type Avisos = {
  avisos: number;
  /** La pantalla de la cana pone al dia la cuenta sin pedir la bandeja otra vez. */
  fijar: (cuantos: number) => void;
  /** Y avisa de si la cana sigue activada, para arrancar o parar las consultas. */
  fijarEstado: (activa: boolean) => void;
};

const Contexto = createContext<Avisos>({ avisos: 0, fijar: () => {}, fijarEstado: () => {} });

export function AvisosCanaProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { activeRoute } = useActiveRoute();
  const [avisos, setAvisos] = useState(0);
  const [activa, setActiva] = useState<boolean | null>(null);
  const yo = session?.user.id ?? '';
  const rutaId = activeRoute?.id ?? null;

  // Una sola consulta por arranque para saber si hay algo que vigilar.
  useEffect(() => {
    if (!yo) {
      setActiva(false);
      setAvisos(0);
      return;
    }
    let vivo = true;
    getMatchProfile()
      .then((perfil) => vivo && setActiva(perfil.is_active))
      .catch(() => vivo && setActiva(false));
    return () => {
      vivo = false;
    };
  }, [yo]);

  const mirar = useCallback(async () => {
    if (!rutaId || !yo) return;
    try {
      setAvisos(chatsPendientes(await getMatchInbox(rutaId), yo));
    } catch {
      // Un fallo suelto no borra la burbujita: el siguiente tick lo reintenta.
    }
  }, [rutaId, yo]);

  useEffect(() => {
    if (activa !== true || !rutaId) {
      setAvisos(0);
      return;
    }
    void mirar();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') void mirar();
    }, REFRESCO_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      // Al volver del bolsillo, lo primero es mirar si ha pasado algo.
      if (estado === 'active') void mirar();
    });
    return () => {
      clearInterval(id);
      suscripcion.remove();
    };
  }, [activa, rutaId, mirar]);

  return (
    <Contexto.Provider value={{ avisos, fijar: setAvisos, fijarEstado: setActiva }}>{children}</Contexto.Provider>
  );
}

/** Numero para la burbujita; 0 = sin burbujita. */
export function useAvisosCana(): Avisos {
  return useContext(Contexto);
}
