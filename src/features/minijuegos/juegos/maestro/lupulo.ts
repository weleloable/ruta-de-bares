/**
 * Lupulo: una barra con el tiempo de hervido y un indicador que avanza. Hay que
 * tocar en dos momentos marcados. En el hervido real el lupulo que entra al
 * principio da AMARGOR y el que entra al final da AROMA (los aceites aromaticos
 * se evaporan si hierven mucho). Logica pura: el componente pone el `dt`.
 */

/** Segundos que dura la barra. Representa el hervido entero. */
export const DURACION = 10;
/** Margen (segundos) a cada lado del momento marcado. Fuera de el, el toque no vale. */
export const VENTANA = 1;

export type MarcaId = 'amargor' | 'aroma';

export type Marca = { id: MarcaId; nombre: string; en: number };

// Del hervido: amargor pronto, aroma casi al final. `en` va en segundos de la barra.
export const MARCAS: readonly Marca[] = [
  { id: 'amargor', nombre: 'Amargor', en: 2 },
  { id: 'aroma', nombre: 'Aroma', en: 8 },
];

export type Estado = {
  t: number;
  /** Precision de cada marca (0..1), o null si todavia no se ha jugado ni se ha dejado pasar. */
  resultados: Record<MarcaId, number | null>;
};

export const INICIO: Estado = { t: 0, resultados: { amargor: null, aroma: null } };

const limitar = (x: number) => Math.min(Math.max(x, 0), 1);

/** Avanza el reloj y da por perdida (0) toda marca cuya ventana ya ha pasado. */
export function avanzar(e: Estado, dt: number): Estado {
  if (terminado(e)) return e;
  const t = Math.min(e.t + dt, DURACION);
  const resultados = { ...e.resultados };
  for (const m of MARCAS) {
    if (resultados[m.id] === null && t > m.en + VENTANA) resultados[m.id] = 0;
  }
  return { t, resultados };
}

export type Toque = {
  estado: Estado;
  /** Marca a la que ha ido el toque, o null si era demasiado pronto / no quedaba ninguna. */
  marca: MarcaId | null;
  precision: number;
};

/**
 * Un toque. Va a la primera marca sin resolver; si aun falta para su ventana,
 * se ignora (tocar antes de tiempo no gasta la marca ni penaliza).
 */
export function tocar(e: Estado): Toque {
  const pendiente = MARCAS.find((m) => e.resultados[m.id] === null);
  if (!pendiente || e.t < pendiente.en - VENTANA) return { estado: e, marca: null, precision: 0 };
  const precision = limitar(1 - Math.abs(e.t - pendiente.en) / VENTANA);
  return {
    estado: { ...e, resultados: { ...e.resultados, [pendiente.id]: precision } },
    marca: pendiente.id,
    precision,
  };
}

export function terminado(e: Estado): boolean {
  return e.t >= DURACION - 1e-9;
}

/** Lo que se lleva la receta: lo que no se jugo cuenta como 0. */
export function resumen(e: Estado): { amargor: number; aroma: number } {
  return { amargor: e.resultados.amargor ?? 0, aroma: e.resultados.aroma ?? 0 };
}
