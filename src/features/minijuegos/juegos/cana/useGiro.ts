import { useCallback, useRef } from 'react';

import { limitarGiro, suavizarEnTiempo, TAU_GIRO } from './inclinacion';

/**
 * El giro del vaso, con SIGNO y suavizado en el tiempo. Lo usan los dos hooks de
 * inclinacion (nativo y web): de donde sale la lectura cambia, lo que se hace
 * con ella no.
 *
 *  - `objetivo`: lo que mide el sensor (o marca el deslizador), tal cual. Se
 *    escribe cuando llega una lectura, sean 20 por segundo o 60.
 *  - `giro`: lo que se DIBUJA: se acerca al objetivo en cada fotograma segun el
 *    tiempo que paso (`avanzarGiro`). Es lo que quita los trompicones: el sensor
 *    llega a saltos, el vaso se mueve fluido.
 *
 * Positivo = inclinado a la derecha, negativo = a la izquierda. El modelo de la
 * espuma solo mira cuanto (valor absoluto): `Math.abs(giro.current)`.
 */
export function useGiro() {
  const objetivo = useRef(0);
  const giro = useRef(0);

  /** Llamar UNA vez por fotograma con los segundos transcurridos. */
  const avanzarGiro = useCallback((dt: number) => {
    giro.current = suavizarEnTiempo(giro.current, objetivo.current, dt, TAU_GIRO);
  }, []);

  /** Pone el objetivo (con signo). Lo que llegue de fuera de rango se recorta. */
  const apuntar = useCallback((grados: number) => {
    objetivo.current = limitarGiro(grados);
  }, []);

  /** Vaso recto de golpe (al cambiar de sensor a deslizador): sin recorrido que animar. */
  const reiniciar = useCallback(() => {
    objetivo.current = 0;
    giro.current = 0;
  }, []);

  return { objetivo, giro, avanzarGiro, apuntar, reiniciar };
}
