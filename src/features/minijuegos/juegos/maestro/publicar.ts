import type { ResultadoJuego } from '../../tipos';

/**
 * Lo que se manda al servidor de una cerveza terminada: la receta (malta,
 * levadura, tres porcentajes) y el nombre. La nota y el estilo NO van: los
 * calcula el servidor. Se saca de `detalles` de `onFinish`, que es donde el
 * juego deja lo que hizo. Devuelve null si falta algo o no tiene sentido, en
 * vez de mandar basura.
 */
export type RecetaParaEnviar = {
  nombre: string;
  malta: string;
  levadura: string;
  maceracion: number;
  amargor: number;
  aroma: number;
};

const esPorcentaje = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 100;

export function recetaDesdeResultado(r: ResultadoJuego): RecetaParaEnviar | null {
  const d = r.detalles;
  if (!d) return null;
  const { nombre, malta, levadura, maceracion, amargor, aroma } = d;
  if (typeof nombre !== 'string' || nombre.trim().length === 0) return null;
  if (typeof malta !== 'string' || malta.length === 0) return null;
  if (typeof levadura !== 'string' || levadura.length === 0) return null;
  if (!esPorcentaje(maceracion) || !esPorcentaje(amargor) || !esPorcentaje(aroma)) return null;
  return { nombre, malta, levadura, maceracion, amargor, aroma };
}
