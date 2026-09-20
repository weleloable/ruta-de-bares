import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { contarAlertas } from '../admin/api';
import { useAuth } from '../auth/AuthProvider';
import { useAvisosCana } from '../match/AvisosCana';
import { contarAvisos } from '../notices/api';
import { hayNotificaciones, totalNotificaciones, type FuentesNotificacion } from './reglas';

/**
 * Cuantas notificaciones tiene esta persona, para el punto rojo de Mi perfil en
 * la barra superior. Junta tres fuentes: la cana (que ya cuenta AvisosCana), los
 * avisos de moderacion sin leer y, solo para admins, las alertas pendientes.
 *
 * Vive por encima del Stack, como AvisosCana, y por lo mismo: el punto tiene
 * que verse desde Sellos o desde Ruta, no solo estando en Mi perfil (donde ya
 * se contaban los avisos y las alertas, pero solo al abrir esa pantalla).
 *
 * Pregunta al arrancar, cada 60 s con la app en primer plano, al volver del
 * segundo plano y cuando la barra pide refrescar (al cambiar de pantalla: asi el
 * punto se apaga al salir de Avisos, donde se marcan leidos). Sin sesion no
 * pregunta nada. Un fallo suelto no apaga ni enciende el punto: se queda como
 * estaba y el siguiente intento lo corrige.
 */
const REFRESCO_MS = 60_000;

type Contexto = {
  avisos: number;
  alertas: number;
  refrescar: () => void;
};

const Ctx = createContext<Contexto>({ avisos: 0, alertas: 0, refrescar: () => {} });

export function NotificacionesProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin } = useAuth();
  const yo = session?.user.id ?? '';
  const [avisos, setAvisos] = useState(0);
  const [alertas, setAlertas] = useState(0);
  const enCurso = useRef(false);
  const repetir = useRef(false);
  // Quien es la persona AHORA, para descartar la respuesta tardia de la anterior.
  const yoActual = useRef(yo);
  yoActual.current = yo;
  /*
    `isAdmin` tambien por referencia, y no capturado en el closure de `mirar`.

    El bug que arregla: al arrancar, `isAdmin` es false (la sesion llega antes
    que el perfil), asi que la primera consulta no pide las alertas. Cuando pasa
    a true, esa primera consulta suele seguir en vuelo, con lo que la segunda
    entra por `repetir.current = true` y el bucle de abajo se repite... con el
    closure VIEJO, que sigue creyendo que no es admin. Resultado medido: quien
    modera no veia el punto rojo de una denuncia nueva hasta el siguiente tick
    de 60 s. Leyendolo de la referencia, la vuelta del bucle ya usa el valor de
    ahora.
  */
  const esAdmin = useRef(isAdmin);
  esAdmin.current = isAdmin;

  // Al cerrar sesion o cambiar de persona no se hereda el punto de la anterior.
  useEffect(() => {
    if (!yo) {
      setAvisos(0);
      setAlertas(0);
    }
  }, [yo]);

  const mirar = useCallback(async () => {
    if (!yo) return;
    // Si llega otra peticion mientras se pregunta (p. ej. se salio de Avisos justo
    // despues de marcarlos leidos), no se descarta: se repite al terminar. Con el
    // ejemplo, la respuesta que vuela podia ser anterior a "marcar leidos".
    if (enCurso.current) {
      repetir.current = true;
      return;
    }
    enCurso.current = true;
    try {
      do {
        repetir.current = false;
        // Cada fuente por su cuenta: si una falla, la otra se actualiza igual.
        const [a, b] = await Promise.allSettled([
          contarAvisos(),
          esAdmin.current ? contarAlertas() : Promise.resolve(0),
        ]);
        if (yoActual.current !== yo) return;
        if (a.status === 'fulfilled') setAvisos(a.value);
        if (b.status === 'fulfilled') setAlertas(b.value);
      } while (repetir.current);
    } finally {
      enCurso.current = false;
    }
  }, [yo]);

  // `isAdmin` esta en las dependencias aunque `mirar` ya no lo capture: en
  // cuanto el perfil llega y dice que si, hay que volver a preguntar, o las
  // alertas se quedan a 0 hasta el siguiente tick. Rehacer el intervalo en ese
  // momento no cuesta nada: pasa una vez por sesion.
  useEffect(() => {
    if (!yo) return undefined;
    void mirar();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') void mirar();
    }, REFRESCO_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void mirar();
    });
    return () => {
      clearInterval(id);
      suscripcion.remove();
    };
  }, [yo, isAdmin, mirar]);

  // Estable a proposito: BarraSuperior la usa de dependencia de un efecto, y si
  // cambiase con cada contador, cada cambio provocaria una consulta de mas.
  const refrescar = useCallback(() => void mirar(), [mirar]);
  const valor = useMemo<Contexto>(() => ({ avisos, alertas, refrescar }), [avisos, alertas, refrescar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Las tres fuentes juntas, su total y como pedir que se pongan al dia. */
export function useNotificaciones(): { fuentes: FuentesNotificacion; total: number; hay: boolean; refrescar: () => void } {
  const { avisos, alertas, refrescar } = useContext(Ctx);
  const { avisos: cana } = useAvisosCana();
  const fuentes = { cana, avisos, alertas };
  return { fuentes, total: totalNotificaciones(fuentes), hay: hayNotificaciones(fuentes), refrescar };
}
