import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { listarVigentes } from './api';
import { leCorresponde, vigente, type Anuncio } from './reglas';

/**
 * Los anuncios vigentes de la ruta activa, compartidos por la pestana Ruta (la
 * tira), la barra de abajo (la burbuja roja) y la pantalla de admins. Una sola
 * copia y una sola consulta: `SondeoAnuncios` la mantiene al dia.
 *
 * "Entendido" se guarda en ESTE dispositivo (AsyncStorage / localStorage), no
 * en el servidor: es solo para que la burbuja se apague, y un anuncio dura como
 * mucho una hora. En otro dispositivo volvera a salir sin leer.
 */
let vigentes: readonly Anuncio[] = [];
let rutaDeVigentes: string | null = null;
let leidos: ReadonlySet<string> = new Set();
let tic = 0;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};

const CLAVE_LEIDOS = 'rutadebares.anuncios.leidos';
const MAX_LEIDOS = 100;

// Lo leido sobrevive a recargar la pagina. Sin almacenamiento (privado, bloqueado) simplemente no se recuerda.
void AsyncStorage.getItem(CLAVE_LEIDOS)
  .then((crudo) => {
    if (!crudo) return;
    const ids = JSON.parse(crudo) as unknown;
    if (Array.isArray(ids)) {
      leidos = new Set([...ids.filter((x): x is string => typeof x === 'string'), ...leidos]);
      avisar();
    }
  })
  .catch(() => undefined);

export function marcarLeido(id: string): void {
  leidos = new Set([...leidos, id]);
  avisar();
  void AsyncStorage.setItem(CLAVE_LEIDOS, JSON.stringify([...leidos].slice(-MAX_LEIDOS))).catch(() => undefined);
}

let ultima = 0;
/**
 * Pide lo vigente. Solo vale la respuesta de la ULTIMA consulta: una lenta que
 * llega tarde pisaria a una reciente (p. ej. recien enviado un anuncio).
 */
export async function refrescarAnuncios(rutaId: string | undefined): Promise<void> {
  const esta = ++ultima;
  if (!rutaId) {
    vigentes = [];
    rutaDeVigentes = null;
    avisar();
    return;
  }
  const lista = await listarVigentes(rutaId);
  if (esta !== ultima || lista === null) return;
  vigentes = lista;
  rutaDeVigentes = rutaId;
  avisar();
}

// Un reloj cada 15 s para que un anuncio caduque aunque no llegue ninguna respuesta nueva.
const suscribirReloj = (f: () => void) => {
  const id = setInterval(() => {
    tic += 1;
    f();
  }, 15_000);
  return () => clearInterval(id);
};

/** Los vigentes de la ruta que se pide, ya sin los caducados ni los que no le tocan a quien mira. */
export function useVigentes(rutaId: string | undefined, esAdmin: boolean): { visibles: readonly Anuncio[]; ahora: number } {
  const todos = useSyncExternalStore(suscribir, () => vigentes);
  useSyncExternalStore(suscribirReloj, () => tic);
  const ahora = Date.now();
  const visibles = rutaId && rutaId === rutaDeVigentes ? todos.filter((a) => leCorresponde(a, esAdmin) && vigente(a, ahora)) : [];
  return { visibles, ahora };
}

export function useLeidos(): ReadonlySet<string> {
  return useSyncExternalStore(suscribir, () => leidos);
}

/** Cuantos vigentes no se han marcado como "Entendido": la burbuja del boton de Ruta. */
export function useSinLeer(rutaId: string | undefined, esAdmin: boolean): number {
  const { visibles } = useVigentes(rutaId, esAdmin);
  const l = useLeidos();
  return visibles.filter((a) => !l.has(a.id)).length;
}
