import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { useSondeo } from '../../lib/useSondeo';
import { esCasa } from './casas';
import type { FilaServidor } from './ranking';

/** Por si el tiempo real se cae (sin red un rato, Realtime apagado): se pregunta igual. */
const SONDEO_MS = 30_000;

/**
 * El ranking de las casas en una ruta, en directo: se suscribe con Realtime al
 * marcador de la ruta (0044), que el servidor toca cada vez que alguien gana
 * puntos, y entonces vuelve a pedir el ranking. Ademas pregunta cada 30 s por
 * si el tiempo real no llega.
 */
export function useRankingCasas(rutaId: string | null) {
  const [filas, setFilas] = useState<FilaServidor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vigente = useRef(rutaId);
  vigente.current = rutaId;

  const cargar = useCallback(async () => {
    if (!rutaId) return;
    const { data, error: e } = await supabase.rpc('casas_ranking', { p_route_id: rutaId });
    if (vigente.current !== rutaId) return;
    if (e) {
      // Sin la 0044 la funcion no existe: no es un error de la persona, se calla.
      setError(/PGRST202|Could not find the function/i.test(e.message) ? null : e.message);
      return;
    }
    setError(null);
    setFilas((data ?? []).filter((f) => esCasa(f.house)) as FilaServidor[]);
  }, [rutaId]);

  useEffect(() => {
    setFilas(null);
    if (!rutaId) return;
    void cargar();
    const canal = supabase
      .channel(`casas-marcador-${rutaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'casas_marcador', filter: `route_id=eq.${rutaId}` },
        () => void cargar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [rutaId, cargar]);

  useSondeo(cargar, SONDEO_MS, rutaId !== null);

  return { filas, error, recargar: cargar };
}
