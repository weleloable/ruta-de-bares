import { useEffect, useState } from 'react';

/**
 * Hora actual, refrescada cada `intervalMs`.
 *
 * Existe porque las ventanas horarias son el centro de la app: sin esto, un
 * "abre en 3 min" se queda congelado en pantalla y el boton de sellar no se
 * habilita solo cuando llega la hora.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
