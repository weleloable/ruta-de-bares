/**
 * Lo que dice Don Quijote por el camino: frases cortas, en tono cervantino,
 * cuando pasa algo (un molino a la vista, una Embestida, un golpe) y alguna
 * suelta de vez en cuando. Sin importaciones: los tests lo cargan tal cual.
 *
 * Nunca dos seguidas (hay un respiro entre bocadillos) y ninguna repetida
 * hasta haber dicho las demas de su lista.
 */

export type Motivo = 'inicio' | 'molino' | 'alcala' | 'embestida' | 'gigante' | 'choque' | 'escudo' | 'yelmo' | 'queso' | 'suelta';

export const FRASES: Record<Motivo, readonly string[]> = {
  inicio: ['En un lugar de La Mancha…', '¡Arre, Rocinante!', 'La aventura nos espera, Sancho.'],
  molino: ['¡Gigantes a la vista!', 'Mira, Sancho: ¡gigantes!', 'Aquellos que allí ves son gigantes.'],
  alcala: ['¡Alcalá, cuna de Cervantes!', 'Complutum, Sancho: aquí empezó todo.', 'Por la Calle Mayor, que hay soportales.'],
  embestida: ['¡Gigantes a la vista! ¡Por Dulcinea!', '¡Non fuyades, cobardes y viles criaturas!', '¡A la carga, Rocinante!'],
  gigante: ['¡Gigante derribado!', '¡Uno menos, Sancho!', 'Así se trata a los gigantes.'],
  choque: ['¡Válgame Dios!', 'Cosas de los encantadores…', 'Ha sido un mago, Sancho.'],
  escudo: ['¡Bendito yelmo!', 'El yelmo de Mambrino me salva.'],
  yelmo: ['¡El yelmo de Mambrino!', 'No es bacía, Sancho: es yelmo.'],
  queso: ['Queso manchego: medicina de caballeros.', '¡Esto resucita a un muerto!'],
  suelta: [
    'La libertad, Sancho, es de los más preciosos dones.',
    'Cada uno es hijo de sus obras.',
    'Donde una puerta se cierra, otra se abre.',
    '¿Quién quiere ser cervecero?',
    'Vuelve a la ruta, Sancho, que hay sellos.',
    'Otra jarra, que la aventura da sed.',
    'Con pan y cerveza, todo se endereza.',
  ],
};

/**
 * Segundos que se ve un bocadillo, el respiro minimo entre dos y cada cuanto sale
 * uno suelto. Pocos a proposito: si habla todo el rato, molesta y no se lee.
 */
export const TIEMPOS = { dura: 2.4, respiro: 15, sueltaMin: 45, sueltaMax: 75 };

/** Lo que importa mas gana si dos llegan a la vez. */
const PRIORIDAD: readonly Motivo[] = ['gigante', 'embestida', 'escudo', 'choque', 'yelmo', 'queso', 'alcala', 'molino', 'inicio', 'suelta'];

export type Bocadillos = {
  /** El que se ve ahora (o null) y hasta cuando. */
  texto: string | null;
  hasta: number;
  /** Cuando se puede decir el siguiente. */
  libreDesde: number;
  proximaSuelta: number;
  /** Por cada lista, las que ya han salido (para no repetir hasta agotarlas). */
  dichas: Partial<Record<Motivo, number[]>>;
};

export function crearBocadillos(azar: () => number): Bocadillos {
  return { texto: null, hasta: 0, libreDesde: 0, proximaSuelta: TIEMPOS.sueltaMin + azar() * (TIEMPOS.sueltaMax - TIEMPOS.sueltaMin), dichas: {} };
}

/** Una frase de esa lista que no haya salido aun (si ya salieron todas, vuelve a empezar). */
export function elegirFrase(b: Bocadillos, motivo: Motivo, azar: () => number): string {
  const lista = FRASES[motivo];
  let dichas = b.dichas[motivo] ?? [];
  if (dichas.length >= lista.length) dichas = [];
  const libres = lista.map((_, k) => k).filter((k) => !dichas.includes(k));
  const k = libres[Math.floor(azar() * libres.length)]!;
  b.dichas[motivo] = [...dichas, k];
  return lista[k]!;
}

/**
 * Un paso: con lo que ha pasado (`motivos`) decide si Quijote dice algo. Muta
 * y devuelve el estado. `t` es el tiempo de la partida.
 */
export function avanzarBocadillos(b: Bocadillos, t: number, motivos: readonly Motivo[], azar: () => number): Bocadillos {
  if (b.texto && t >= b.hasta) b.texto = null;
  const lista = t >= b.proximaSuelta ? [...motivos, 'suelta' as const] : motivos;
  if (lista.length === 0) return b;
  // Lo importante (un gigante, la Embestida) se dice aunque haya otro bocadillo; lo demas espera su turno.
  const motivo = PRIORIDAD.find((m) => lista.includes(m))!;
  const urgente = motivo === 'gigante' || motivo === 'embestida';
  if (!urgente && t < b.libreDesde) return b;
  b.texto = elegirFrase(b, motivo, azar);
  b.hasta = t + TIEMPOS.dura;
  b.libreDesde = t + TIEMPOS.dura + TIEMPOS.respiro;
  b.proximaSuelta = t + TIEMPOS.sueltaMin + azar() * (TIEMPOS.sueltaMax - TIEMPOS.sueltaMin);
  return b;
}
