/**
 * Parejas de Barra: memoria de 4 x 4 (8 parejas). Toda la logica vive aqui,
 * pura: el componente solo pinta y llama a `tocar` / `avanzar` con la hora.
 *
 * La nota es el TIEMPO (segundos, dos decimales) y MENOS es mejor: es el primer
 * juego asi (ver `JUEGOS_MENOS_ES_MEJOR` en nota.ts y la 0070).
 *
 * El reloj es inyectable: cada funcion recibe `ahora` en segundos. Nada de
 * Date.now() suelto, asi los tests juegan partidas enteras sin esperar.
 *
 * Sin importaciones: los tests lo cargan tal cual.
 */

export const ID_PAREJAS = 'parejas-de-barra';

/** Los 8 simbolos. Lista cerrada: la valido el usuario, no se cambia sin preguntar. */
export const SIMBOLOS = ['mahou', 'cruzcampo', 'estrella', 'alhambra', 'pato', 'rxb', 'jarra', 'chapa'] as const;
export type Simbolo = (typeof SIMBOLOS)[number];

export const FILAS = 4;
export const COLUMNAS = 4;
export const CARTAS = FILAS * COLUMNAS;

/**
 * Lo que dura darse la vuelta una carta (s). Mientras gira, ningun toque vale:
 * es lo que pone el suelo fisico al tiempo (ver TIEMPO_MINIMO).
 */
export const VOLTEO = 0.25;

/** Lo que se ven dos cartas distintas, ya dadas la vuelta, antes de taparse (s). */
export const VISTA_FALLO = 0.8;

/**
 * El minimo fisicamente posible. Una partida perfecta son 16 toques sin un solo
 * fallo; el reloj arranca con el primero, cada uno tiene que esperar a que acabe
 * el volteo del anterior (VOLTEO), y la partida acaba cuando termina de girar la
 * ultima carta. 16 volteos seguidos: 16 x 0,25 = 4,00 s. Los fallos (VISTA_FALLO)
 * no entran: la partida perfecta no falla. modelo.test.ts lo demuestra jugando.
 *
 * El servidor (0070) rechaza cualquier tiempo por debajo: es lo unico que frena
 * a un cliente trucado, porque el tiempo lo manda el movil.
 */
export const TIEMPO_MINIMO = CARTAS * VOLTEO;

/** Mas alla, la partida no se guarda en la ruta (y el servidor la rechaza). */
export const TIEMPO_MAXIMO = 600;

export type EstadoCarta = 'tapada' | 'vista' | 'emparejada';
export type Carta = { simbolo: Simbolo; estado: EstadoCarta };

export type Partida = {
  cartas: Carta[];
  /** Indices de las cartas vistas que aun no forman pareja (0, 1 o 2). */
  abiertas: number[];
  /** Hasta cuando no vale ningun toque (una carta esta girando). */
  bloqueadaHasta: number;
  /** Cuando se tapan las dos de un fallo; null si no hay fallo a la vista. */
  taparEn: number | null;
  /** Primer toque: el reloj arranca aqui. */
  inicio: number | null;
  /** Termina de girar la ultima carta: el reloj se para aqui. */
  fin: number | null;
  /** Pares de cartas volteadas. */
  intentos: number;
  fallos: number;
};

/** Generador con semilla (mulberry32): la misma semilla da siempre el mismo tablero. */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Las 16 cartas barajadas (Fisher-Yates) con la semilla. */
export function barajar(semilla: number): Simbolo[] {
  const azar = crearAzar(semilla);
  const mazo: Simbolo[] = [...SIMBOLOS, ...SIMBOLOS];
  for (let i = mazo.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [mazo[i], mazo[j]] = [mazo[j] as Simbolo, mazo[i] as Simbolo];
  }
  return mazo;
}

export function crearPartida(semilla: number): Partida {
  return {
    cartas: barajar(semilla).map((simbolo) => ({ simbolo, estado: 'tapada' })),
    abiertas: [],
    bloqueadaHasta: 0,
    taparEn: null,
    inicio: null,
    fin: null,
    intentos: 0,
    fallos: 0,
  };
}

/** Tapa las dos de un fallo cuando les toca. Hay que llamarlo con el paso del tiempo. */
export function avanzar(p: Partida, ahora: number): Partida {
  if (p.taparEn === null || ahora < p.taparEn) return p;
  const cartas = p.cartas.map((c, i) => (p.abiertas.includes(i) ? { ...c, estado: 'tapada' as const } : c));
  return { ...p, cartas, abiertas: [], taparEn: null };
}

/**
 * Un toque en la carta `i`. Devuelve la MISMA partida si el toque no vale: una
 * carta girando, dos de un fallo a la vista, una carta ya vista o emparejada, o
 * la partida terminada. Asi el componente sabe que no ha pasado nada.
 */
export function tocar(antes: Partida, i: number, ahora: number): Partida {
  const p = avanzar(antes, ahora);
  if (p.fin !== null || ahora < p.bloqueadaHasta || p.abiertas.length >= 2) return p;
  const carta = p.cartas[i];
  if (!carta || carta.estado !== 'tapada') return p;

  const cartas = p.cartas.map((c, k) => (k === i ? { ...c, estado: 'vista' as const } : c));
  const abiertas = [...p.abiertas, i];
  const base: Partida = {
    ...p,
    cartas,
    abiertas,
    bloqueadaHasta: ahora + VOLTEO,
    inicio: p.inicio ?? ahora,
  };
  if (abiertas.length < 2) return base;

  const [a, b] = abiertas as [number, number];
  const intentos = p.intentos + 1;
  if (cartas[a]?.simbolo === cartas[b]?.simbolo) {
    const emparejadas = cartas.map((c, k) => (k === a || k === b ? { ...c, estado: 'emparejada' as const } : c));
    const todas = emparejadas.every((c) => c.estado === 'emparejada');
    return { ...base, cartas: emparejadas, abiertas: [], intentos, fin: todas ? ahora + VOLTEO : null };
  }
  // Se ven VISTA_FALLO una vez terminado el giro; hasta taparse, ningun toque vale.
  const taparEn = ahora + VOLTEO + VISTA_FALLO;
  return { ...base, intentos, fallos: p.fallos + 1, taparEn, bloqueadaHasta: taparEn };
}

export function terminada(p: Partida): boolean {
  return p.fin !== null;
}

/** Segundos de reloj: 0 antes del primer toque, parado al terminar. */
export function tiempo(p: Partida, ahora: number): number {
  if (p.inicio === null) return 0;
  return Math.max(0, (p.fin ?? ahora) - p.inicio);
}

/** La nota: el tiempo final con dos decimales. null si no ha terminado. */
export function nota(p: Partida): number | null {
  if (p.fin === null || p.inicio === null) return null;
  return Math.round((p.fin - p.inicio) * 100) / 100;
}

/** Si esa nota se puede guardar en la ruta (el servidor dice lo mismo, 0070). */
export function notaValida(n: number): boolean {
  // Dos decimales con TOLERANCIA: en coma flotante 4.35 * 100 es 434,99999999999994,
  // y comparar con === rechazaba 1 de cada 8 tiempos buenos (lo cazo el critico).
  return Number.isFinite(n) && n >= TIEMPO_MINIMO && n <= TIEMPO_MAXIMO && Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

export function parejasEncontradas(p: Partida): number {
  return p.cartas.filter((c) => c.estado === 'emparejada').length / 2;
}

/**
 * "23,47 s": lo que se ve en el reloj de arriba. Redondea IGUAL que `nota` (y que
 * formatearNota): si truncase, al terminar el reloj diria 23,47 y la nota
 * enviada 23,48, y el tiempo que se ve no seria el que se guarda.
 */
export function formatearTiempo(segundos: number): string {
  return `${(Math.round(segundos * 100) / 100).toFixed(2).replace('.', ',')} s`;
}

/** Una frase para la tarjeta de fin, segun cuanto se fallo. */
export function mensajeFinal(fallos: number): string {
  if (fallos === 0) return '¡Sin un fallo! Memoria de camarero.';
  if (fallos <= 4) return 'Muy fino. Te acuerdas de cada ronda.';
  if (fallos <= 10) return 'Bien jugado. Otra y lo bajas.';
  return 'Conseguido. La próxima, menos vueltas.';
}
