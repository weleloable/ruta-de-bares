import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Repite `tarea` cada `intervaloMs` mientras la pantalla tiene el foco y la app
 * esta en primer plano. Es el "tiempo real" de Tirate una cana: sin Supabase
 * Realtime, se pregunta cada poco (docs/TIRATE-UNA-CANA.md).
 *
 * Se para al cambiar de pestana o de pantalla (useFocusEffect) y se salta los
 * ticks en segundo plano: en web AppState refleja la visibilidad de la pestana
 * del navegador, asi que una pestana oculta no gasta peticiones. Al volver a
 * primer plano pregunta en el acto en vez de esperar al siguiente tick.
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
      const id = setInterval(() => {
        if (AppState.currentState === 'active') void ultima.current();
      }, intervaloMs);
      const suscripcion = AppState.addEventListener('change', (estado) => {
        if (estado === 'active') void ultima.current();
      });
      return () => {
        clearInterval(id);
        suscripcion.remove();
      };
    }, [activo, intervaloMs]),
  );
}
