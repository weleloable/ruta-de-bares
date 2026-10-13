import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { supabase } from '../../lib/supabase';
import { useSondeo } from '../../lib/useSondeo';
import type { RouteRow } from '../../types/database';
import { DesplegablePuntos, type DatosPuntos } from './DesplegablePuntos';

/** Lee las mismas reglas y limites que modifica el panel de administracion. */
export function InfoPuntos({ ruta, visible, onCambiar, onHistorico, retos }: {
  ruta: RouteRow | null; visible: boolean; onCambiar: (abierto: boolean) => void;
  onHistorico: () => void;
  retos?: ReactNode;
}) {
  const [datos, setDatos] = useState<DatosPuntos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generacion = useRef(0);
  const rutaId = ruta?.id ?? null;

  const cargar = useCallback(async () => {
    if (!visible || !rutaId) return;
    const peticion = ++generacion.current;
    try {
      const [reglas, limites, retos] = await Promise.all([
        supabase.rpc('casas_puntos'),
        supabase.from('routes').select('consumo_minutos, consumo_por_bar, consumo_por_ruta, variedad_max, qr_max, racha_repetible').eq('id', rutaId).single(),
        supabase.rpc('retos_mios', { p_route_id: rutaId }),
      ]);
      if (peticion !== generacion.current) return;
      if (reglas.error || limites.error || retos.error || !limites.data) {
        setError('No se pudieron leer las reglas actuales.');
        return;
      }
      setDatos({
        puntos: Object.fromEntries((reglas.data ?? []).map((r) => [r.action, r.points])),
        limites: limites.data,
        retos: (retos.data ?? []).filter((r) => r.activo),
      });
      setError(null);
    } catch {
      if (peticion === generacion.current) setError('No se pudo conectar.');
    }
  }, [visible, rutaId]);

  useEffect(() => {
    setDatos(null);
    setError(null);
    void cargar();
    return () => { generacion.current += 1; };
  }, [cargar]);
  useSondeo(cargar, 30_000, visible && rutaId !== null);

  return <DesplegablePuntos abierto={visible} datos={datos} error={error} onCambiar={onCambiar} onHistorico={onHistorico} onReintentar={() => void cargar()} retos={retos} />;
}
