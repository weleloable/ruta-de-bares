/**
 * Mapas de La Conga Cervecera. Cada mapa es una cuadricula de texto: asi se
 * dibuja a ojo y se revisa en un diff. Anadir un nivel es sumar un objeto a
 * `MAPAS`; el test comprueba que esta bien formado y que se puede jugar.
 *
 *   .  suelo               P  salida de la conga (suelo)
 *   E  edificio            S  soportal (Calle Mayor)
 *   U  la Universidad      F  fuente
 *   B  banco               A  arbol
 *   C  Cervantes (estatua): ocupa un bloque de 2x2 C, para que se reconozca
 *
 * Todo lo que no es `.` ni `P` es un obstaculo, y fuera de la cuadricula tambien
 * se choca. Es un Alcala "inspirado en", no un plano.
 */

import type { Mapa } from './modelo';

export const OBSTACULOS = ['E', 'S', 'U', 'F', 'B', 'A', 'C'] as const;
export type Obstaculo = (typeof OBSTACULOS)[number];

/** Obstaculos que ocupan un bloque de N x N casillas y se dibujan con un solo sprite grande. */
export const TAMANO: Partial<Record<Obstaculo, number>> = { C: 2 };

export const MAPAS: readonly Mapa[] = [
  {
    id: 'casco-historico',
    nombre: 'Casco histórico',
    filas: [
      'EEEEEUUUUUEEEEE', // fachada de la Universidad
      'E.............E',
      'E.A.........A.E',
      'E.............E',
      'E...B.....B...E',
      'E.............E',
      'E.............E',
      'E......CC.....E', // Plaza de Cervantes
      'E......CC.....E',
      'E.............E',
      'E...B.....B...E',
      'E.............E',
      'EEE.........EEE',
      'E.............E',
      'E.............E',
      'E.............E',
      'ESSS.......SSSE', // Calle Mayor, con sus soportales
      'E.............E',
      'E.....P.......E',
      'EEEEEEEEEEEEEEE',
    ],
  },
];

/**
 * Todos los obstaculos con su sitio, para dibujarlos una sola vez. Los de
 * varias casillas (`TAMANO`) salen una vez, en su esquina de arriba a la
 * izquierda; el resto del bloque sigue siendo solido, solo que no se dibuja aparte.
 */
export function obstaculos(mapa: Mapa): { x: number; y: number; id: Obstaculo; tam: number }[] {
  const lista: { x: number; y: number; id: Obstaculo; tam: number }[] = [];
  mapa.filas.forEach((fila, y) => {
    [...fila].forEach((c, x) => {
      if (!(OBSTACULOS as readonly string[]).includes(c)) return;
      const id = c as Obstaculo;
      const tam = TAMANO[id] ?? 1;
      if (tam === 1) {
        lista.push({ x, y, id, tam });
        return;
      }
      // Cuantas casillas iguales hay justo a la izquierda y justo encima: un bloque
      // empieza donde ese recuento es multiplo del tamano (asi dos bloques pegados salen los dos).
      let izq = 0;
      while (fila[x - izq - 1] === id) izq++;
      let arriba = 0;
      while (mapa.filas[y - arriba - 1]?.[x] === id) arriba++;
      if (izq % tam !== 0 || arriba % tam !== 0) return;
      lista.push({ x, y, id, tam });
    });
  });
  return lista;
}
