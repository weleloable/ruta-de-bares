import { useEffect } from 'react';
import { AppState } from 'react-native';

import { esperaAleatoria } from '../../lib/dispersion';
import { refrescarAnuncios } from './almacen';

const CADA_MS = 20_000;

/**
 * Mantiene al dia los anuncios de la ruta. Va en el layout de las pestanas, no
 * en la pestana Ruta: la burbuja roja tiene que encenderse estando en cualquier
 * otra. No usa `useSondeo` porque ese se para al cambiar de pantalla, y aqui no.
 * No pinta nada.
 */
export function SondeoAnuncios({ rutaId }: { rutaId: string | undefined }) {
  useEffect(() => {
    void refrescarAnuncios(rutaId);
    if (!rutaId) return undefined;
    // Desfase al azar del reloj: 150 moviles abiertos a la vez no preguntan siempre en el mismo segundo.
    let id: ReturnType<typeof setInterval> | null = null;
    const arranque = setTimeout(() => {
      id = setInterval(() => {
        if (AppState.currentState === 'active') void refrescarAnuncios(rutaId);
      }, CADA_MS);
    }, esperaAleatoria(CADA_MS / 3));
    // Al volver a primer plano (pestana del navegador, app del segundo plano) se pregunta en el acto.
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') void refrescarAnuncios(rutaId);
    });
    return () => {
      clearTimeout(arranque);
      if (id !== null) clearInterval(id);
      sub.remove();
    };
  }, [rutaId]);
  return null;
}
