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

import { useAuth } from '../auth/AuthProvider';
import { listMyStamps } from '../stamps/api';
import type { RouteBarRow, RouteRow, StampRow } from '../../types/database';
import { getRouteWithBars, listPublishedRoutes } from './api';

/**
 * Ruta activa compartida por las pestanas Sellos y Ruta.
 *
 * Vive aqui y no en cada pantalla para que el selector de ruta sea uno solo:
 * si el usuario cambia de ruta en Sellos, el mapa ya esta mirando la misma.
 */
type ActiveRouteState = {
  routes: RouteRow[];
  activeRoute: RouteRow | null;
  bars: RouteBarRow[];
  stamps: StampRow[];
  loading: boolean;
  error: string | null;
  selectRoute: (routeId: string) => void;
  refresh: () => Promise<void>;
  /** Anade un sello recien conseguido sin esperar a recargar. */
  addStamp: (stamp: StampRow) => void;
};

const ActiveRouteContext = createContext<ActiveRouteState | null>(null);

export function ActiveRouteProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bars, setBars] = useState<RouteBarRow[]>([]);
  const [stamps, setStamps] = useState<StampRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contador de peticiones: una recarga lenta que termina despues de otra mas
  // reciente no puede pisar el resultado bueno.
  const peticion = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRoutes([]);
      setBars([]);
      setStamps([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }

    const miPeticion = peticion.current + 1;
    peticion.current = miPeticion;
    setLoading(true);
    setError(null);

    try {
      const [publicadas, misSellos] = await Promise.all([
        listPublishedRoutes(),
        listMyStamps(userId),
      ]);
      if (peticion.current !== miPeticion) return;

      setRoutes(publicadas);
      setStamps(misSellos);

      // Se mantiene la ruta elegida si sigue publicada; si no, la mas reciente.
      const elegida =
        publicadas.find((r) => r.id === selectedId) ?? publicadas[0] ?? null;
      setSelectedId(elegida?.id ?? null);

      if (!elegida) {
        setBars([]);
        return;
      }

      const detalle = await getRouteWithBars(elegida.id);
      if (peticion.current !== miPeticion) return;
      setBars(detalle?.bars ?? []);
    } catch (e) {
      if (peticion.current !== miPeticion) return;
      setError(e instanceof Error ? e.message : 'No se pudo cargar la ruta.');
    } finally {
      if (peticion.current === miPeticion) setLoading(false);
    }
  }, [userId, selectedId]);

  // Solo depende de userId: refresh cambia con selectedId y volveria a disparar
  // una recarga completa en cada cambio de ruta, que ya gestiona selectRoute.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const selectRoute = useCallback(
    (routeId: string) => {
      if (routeId === selectedId) return;
      setSelectedId(routeId);
      setLoading(true);
      const miPeticion = peticion.current + 1;
      peticion.current = miPeticion;
      getRouteWithBars(routeId)
        .then((detalle) => {
          if (peticion.current !== miPeticion) return;
          setBars(detalle?.bars ?? []);
        })
        .catch((e: unknown) => {
          if (peticion.current !== miPeticion) return;
          setError(e instanceof Error ? e.message : 'No se pudo cargar la ruta.');
        })
        .finally(() => {
          if (peticion.current === miPeticion) setLoading(false);
        });
    },
    [selectedId],
  );

  const addStamp = useCallback((stamp: StampRow) => {
    setStamps((previos) =>
      previos.some((s) => s.id === stamp.id) ? previos : [...previos, stamp],
    );
  }, []);

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === selectedId) ?? null,
    [routes, selectedId],
  );

  const value = useMemo<ActiveRouteState>(
    () => ({ routes, activeRoute, bars, stamps, loading, error, selectRoute, refresh, addStamp }),
    [routes, activeRoute, bars, stamps, loading, error, selectRoute, refresh, addStamp],
  );

  return <ActiveRouteContext.Provider value={value}>{children}</ActiveRouteContext.Provider>;
}

export function useActiveRoute(): ActiveRouteState {
  const contexto = useContext(ActiveRouteContext);
  if (!contexto) throw new Error('useActiveRoute tiene que usarse dentro de <ActiveRouteProvider>');
  return contexto;
}
