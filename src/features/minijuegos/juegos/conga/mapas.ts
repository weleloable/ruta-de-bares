/**
 * Mapas de La Conga Cervecera. Cada mapa es una cuadricula de texto: asi se
 * dibuja a ojo y se revisa en un diff. Anadir un nivel es sumar un objeto a
 * `MAPAS`; el test comprueba que esta bien formado y que se puede jugar.
 *
 *   .  suelo               P  salida de la conga (suelo)
 *   E  edificio            S  soportal (Calle Mayor)
 *   U  la Universidad      F  fuente
 *   B  banco               A  arbol
 *   C  Cervantes (estatua)
 *
 * Todo lo que no es `.` ni `P` es un obstaculo, y fuera de la cuadricula tambien
 * se choca. Es un Alcala "inspirado en", no un plano.
 */

import type { Mapa } from './modelo';

export const OBSTACULOS = ['E', 'S', 'U', 'F', 'B', 'A', 'C'] as const;
export type Obstaculo = (typeof OBSTACULOS)[number];

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
      'E.....F.F.....E', // Plaza de Cervantes
      'E......C......E',
      'E.....F.F.....E',
      'E.............E',
      'E...B.....B...E',
      'E.............E',
      'EEEE.......EEEE',
      'E.............E',
      'ES.S.S.S.S.S.SE', // Calle Mayor, con sus soportales
      'E.............E',
      'ESSSS.....SSSSE',
      'E.............E',
      'E.....P.......E',
      'EEEEEEEEEEEEEEE',
    ],
  },
];

/** Todos los obstaculos con su sitio, para dibujarlos una sola vez. */
export function obstaculos(mapa: Mapa): { x: number; y: number; id: Obstaculo }[] {
  const lista: { x: number; y: number; id: Obstaculo }[] = [];
  mapa.filas.forEach((fila, y) => {
    [...fila].forEach((c, x) => {
      if ((OBSTACULOS as readonly string[]).includes(c)) lista.push({ x, y, id: c as Obstaculo });
    });
  });
  return lista;
}
