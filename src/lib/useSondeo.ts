import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { esperaAleatoria } from './dispersion';

/**
 * Repite `tarea` cada `intervaloMs` mientras la pantalla tiene el foco y la app
 * esta en primer plano. Es el "tiempo real" de Tirate una cana: sin Supabase
 * Realtime, se pregunta cada poco (docs/TIRATE-UNA-CANA.md).
 *
 * Se para al cambiar de pestana o de pantalla (useFocusEffect) y se salta los
 * ticks en segundo plano: en web AppState refleja la visibilidad de la pestana
 * del navegador, asi que una pestana oculta no gasta peticiones. Al volver a
 * primer plano pregunta en el acto en vez de esperar al siguiente tick.
 *
 * El reloj de cada movil arranca con un desfase al azar (hasta un tercio del
 * intervalo, 10 s como mucho): si 150 personas abren la app a la vez, sus
 * sondeos no se quedan sincronizados para siempre pidiendo en el mismo segundo.
 */
export function useSondeo(tarea: () => unknown, intervaloMs: number, activo = true): void {
  // La ultima version de la tarea, sin reiniciar el intervalo cada render.
  const ultima = useRef(tarea);
  useEffect(() => {
    ultima.current = tarea;
  }, [tarea]);

  useFocusEffect(
    useCallback(() => {
      if (!activo) return undefined;
      let id: ReturnType<typeof setInterval> | null = null;
      const arranque = setTimeout(() => {
        id = setInterval(() => {
          if (AppState.currentState === 'active') void ultima.current();
        }, intervaloMs);
      }, esperaAleatoria(Math.min(intervaloMs / 3, 10_000)));
      const suscripcion = AppState.addEventListener('change', (estado) => {
        if (estado === 'active') void ultima.current();
      });
      return () => {
        clearTimeout(arranque);
        if (id !== null) clearInterval(id);
        suscripcion.remove();
      };
    }, [activo, intervaloMs]),
  );
}
