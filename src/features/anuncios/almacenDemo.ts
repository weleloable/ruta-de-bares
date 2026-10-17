import { useSyncExternalStore } from 'react';

import { leCorresponde, vigente, type AnuncioBase, type DuracionMin } from './reglas';

/**
 * PROTOTIPO: los anuncios viven en memoria de esta pestana (al recargar se
 * reinicia). Cuando se haga de verdad, esto es una tabla en Supabase por ruta y
 * estas dos funciones llaman a la API. La pantalla no cambia.
 */
export type Anuncio = AnuncioBase & { id: string; texto: string; autor: string; ruta: string };

let anuncios: Anuncio[] = [];
let leidos: ReadonlySet<string> = new Set();
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

export function enviarAnuncio(
  texto: string,
  autor: string,
  ruta: string,
  opciones: { duracionMin: DuracionMin; soloAdmins: boolean },
): void {
  anuncios = [
    { id: String(Date.now()), texto, autor, ruta, creadoMs: Date.now(), retirado: false, ...opciones },
    ...anuncios,
  ];
  avisar();
}

export function retirarAnuncio(id: string): void {
  anuncios = anuncios.map((a) => (a.id === id ? { ...a, retirado: true } : a));
  avisar();
}

export function marcarLeido(id: string): void {
  leidos = new Set([...leidos, id]);
  avisar();
}

/** Todos los enviados (para que el admin vea y retire), con su estado. */
export function useEnviados(): readonly Anuncio[] {
  return useSyncExternalStore(suscribir, () => anuncios);
}

export function useLeidos(): ReadonlySet<string> {
  return useSyncExternalStore(suscribir, () => leidos);
}

/** Los que ve la gente ahora: vigentes y de esta ruta. Se refresca solo cada 15 s (para que caduquen). */
export function useVigentes(ruta: string | undefined, esAdmin: boolean): { visibles: readonly Anuncio[]; ahora: number } {
  const todos = useEnviados();
  useSyncExternalStore(suscribirReloj, () => tic);
  const ahora = Date.now();
  const visibles = todos.filter((a) => (a.ruta === '*' || a.ruta === ruta) && leCorresponde(a, esAdmin) && vigente(a, ahora));
  return { visibles, ahora };
}

let tic = 0;
const suscribirReloj = (f: () => void) => {
  const id = setInterval(() => {
    tic += 1;
    f();
  }, 15_000);
  return () => clearInterval(id);
};

/** Cuantos anuncios vigentes de esta ruta no se han marcado como "Entendido": el punto rojo de la pestana Ruta. */
export function useSinLeer(ruta: string | undefined, esAdmin: boolean): number {
  const { visibles } = useVigentes(ruta, esAdmin);
  const leidos = useLeidos();
  return visibles.filter((a) => !leidos.has(a.id)).length;
}
