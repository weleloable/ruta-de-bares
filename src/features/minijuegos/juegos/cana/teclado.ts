/** Acciones que el teclado puede disparar. En nativo no hay teclado: no hace nada (ver teclado.web.ts). */
export type AccionesTeclado = {
  abrir: () => void;
  cerrar: () => void;
  /** Suma grados (negativo = enderezar). */
  ajustar: (delta: number) => void;
};

export function useTecladoCana(_acciones: AccionesTeclado, _activo: boolean): void {}
