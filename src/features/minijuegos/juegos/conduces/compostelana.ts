import { useMemo } from 'react';

import { useActiveRoute } from '../../../routes/ActiveRouteProvider';

/**
 * Lo que "¿Conduces tú?" necesita de la ruta y de la Compostelana: cuantos
 * bares tiene la ruta (el nivel maximo de cañas) y cuantos sellos llevas en
 * ella (el nivel por defecto). Ya existia en la app: sale de `useActiveRoute`,
 * que tiene los bares de la ruta activa y tus sellos.
 *
 * Sin ruta (solo en pruebas: la pestaña Juegos no sale fuera de una ruta) se
 * juega en modo prueba con NIVELES_PRUEBA niveles, y los records quedan en el movil.
 */
export const NIVELES_PRUEBA = 8;

export type DatosRuta = {
  rutaId: string | null;
  /** Bares de la ruta: el nivel maximo. Al menos 1. */
  numeroBares: number;
  /** Tus sellos en ESTA ruta. */
  sellos: number;
};

export function useDatosRuta(): DatosRuta {
  const { activeRoute, bars, stamps } = useActiveRoute();
  return useMemo(() => {
    if (!activeRoute) return { rutaId: null, numeroBares: NIVELES_PRUEBA, sellos: 0 };
    const deEstaRuta = new Set(bars.map((b) => b.id));
    return {
      rutaId: activeRoute.id,
      numeroBares: Math.max(bars.length, 1),
      sellos: stamps.filter((s) => deEstaRuta.has(s.route_bar_id)).length,
    };
  }, [activeRoute, bars, stamps]);
}

/** El nivel con el que arranca el selector: tus sellos, entre 1 y el maximo. */
export function nivelPorDefecto(d: DatosRuta): number {
  return Math.min(Math.max(d.sellos, 1), d.numeroBares);
}
