import type { Dir } from './modelo';

export type AccionesTeclado = {
  girar: (dir: Dir) => void;
  /** Empezar / pausar / seguir. */
  alternar: () => void;
};

/** En nativo no hay teclado: no hace nada (ver teclado.web.ts). */
export function useTecladoConga(_acciones: AccionesTeclado, _activo: boolean): void {}
