import { useCallback, useEffect, useState } from 'react';
import { listPublicBars } from '../lib/api/bars';
import { listPublicProfiles, type PublicProfile } from '../lib/api/profiles';
import { getActiveRoute } from '../lib/api/routes';
import { listRouteSeals } from '../lib/api/stamps';
import type { Bar, Route, Seal } from '../types/domain';

interface ActiveRouteState {
  loading: boolean;
  error: string | null;
  route: Route | null;
  bars: Bar[];
  seals: Seal[];
  profiles: PublicProfile[];
  refresh: () => void;
}

/** Carga la ruta activa, sus bares y todos los sellos del grupo. Usado por
 * el mapa y la compostelana, que necesitan los tres para dibujarse. */
export function useActiveRoute(): ActiveRouteState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [seals, setSeals] = useState<Seal[]>([]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const activeRoute = await getActiveRoute();
        if (cancelled) return;
        setRoute(activeRoute);
        if (!activeRoute) {
          setBars([]);
          setSeals([]);
          setProfiles([]);
          return;
        }
        const [barsData, sealsData, profilesData] = await Promise.all([
          listPublicBars(activeRoute.id),
          listRouteSeals(activeRoute.id),
          listPublicProfiles(),
        ]);
        if (cancelled) return;
        setBars(barsData);
        setSeals(sealsData);
        setProfiles(profilesData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { loading, error, route, bars, seals, profiles, refresh };
}
