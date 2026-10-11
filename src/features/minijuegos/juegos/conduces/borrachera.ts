import type { Entrada } from './modelo';

/**
 * Los efectos de la borrachera en "¿Conduces tú?".
 *
 * Todo sale de una INTENSIDAD de 0 a 1 que da el nivel elegido (nivel 1 = casi
 * nada, el maximo = casi imposible). Unos efectos estan siempre (balanceo,
 * retraso, el volante que tira) y otros van y vienen en RAFAGAS al azar, mas a
 * menudo cuanto mas alto es el nivel (vision borrosa o doble fuerte, controles
 * al reves, hipo).
 *
 * Para ajustar el juego se toca EFECTOS y nada mas. Sin importaciones salvo
 * tipos: los tests lo cargan tal cual.
 */

type Rango = readonly [number, number];
type Rafaga = { porSegundo: number; duracion: Rango };

export const EFECTOS = {
  /** Vision borrosa: px de desenfoque a intensidad 1, y la rafaga que lo empeora. */
  borroso: { desde: 0.2, maximo: 2.5, rafaga: { porSegundo: 0.1, duracion: [2, 4] } as Rafaga, extra: 4 },
  /** Vision doble: px de separacion entre las dos imagenes. */
  doble: {
    desde: 0.15,
    maximo: 10,
    frecuencia: 0.35,
    rafaga: { porSegundo: 0.08, duracion: [2, 4] } as Rafaga,
    extra: 14,
  },
  /** Balanceo de la camara: radianes y metros, y lo lento que va (Hz). */
  balanceo: { angulo: 0.12, desplazamiento: 1.4, frecuencia: 0.2 },
  /** Lo que tardan en llegar los mandos al coche, en segundos. */
  retraso: { maximo: 0.4 },
  /** El volante tira solo hacia un lado (fraccion del volante) y cambia de lado cada tanto. */
  tiron: { desde: 0.1, maximo: 0.3, cambio: [3, 8] as Rango },
  /** Controles al reves: solo el volante, unos segundos, con aviso. */
  invertidos: { desde: 0.3, rafaga: { porSegundo: 0.06, duracion: [2.5, 4] } as Rafaga },
  /** Hipo: tirones bruscos del volante. */
  hipo: { desde: 0.1, porSegundo: 0.35, fuerza: 1, duracion: 0.18 },
} as const;

/** Del nivel elegido (1..maximo) a una intensidad de 0 a 1. */
export function intensidad(nivel: number, maximo: number): number {
  if (maximo <= 1) return 0.04;
  const n = Math.min(Math.max((nivel - 1) / (maximo - 1), 0), 1);
  // Sube despacio al principio: los primeros niveles son casi normales.
  return 0.04 + 0.96 * n ** 1.3;
}

type Azar = () => number;

export type EstadoBorrachera = {
  t: number;
  /** Hasta cuando dura cada rafaga (segundos de juego). */
  borroso: number;
  doble: number;
  invertidos: number;
  hipo: number;
  hipoLado: 1 | -1;
  tironLado: 1 | -1;
  tironCambia: number;
  /** Desfase del balanceo, para que no empiece siempre igual. */
  fase: number;
  /** Los mandos de los ultimos instantes, para aplicarlos con retraso. */
  historial: { t: number; m: Entrada }[];
};

const entre = (r: Rango, azar: Azar) => r[0] + azar() * (r[1] - r[0]);

export function nuevaBorrachera(azar: Azar): EstadoBorrachera {
  return {
    t: 0,
    borroso: 0,
    doble: 0,
    invertidos: 0,
    hipo: 0,
    hipoLado: 1,
    tironLado: azar() < 0.5 ? 1 : -1,
    tironCambia: entre(EFECTOS.tiron.cambio, azar),
    fase: azar() * Math.PI * 2,
    historial: [],
  };
}

/** Si salta una rafaga en este paso: Poisson con la frecuencia escalada por la intensidad. */
const salta = (porSegundo: number, I: number, dt: number, azar: Azar) => azar() < porSegundo * I * dt;

/** Hace pasar el tiempo: decide rafagas, hipo y cambios del tiron. */
export function avanzarBorrachera(e: EstadoBorrachera, I: number, dt: number, azar: Azar): EstadoBorrachera {
  const t = e.t + dt;
  const n: EstadoBorrachera = { ...e, t };
  if (t >= e.borroso && I >= EFECTOS.borroso.desde && salta(EFECTOS.borroso.rafaga.porSegundo, I, dt, azar)) {
    n.borroso = t + entre(EFECTOS.borroso.rafaga.duracion, azar);
  }
  if (t >= e.doble && I >= EFECTOS.doble.desde && salta(EFECTOS.doble.rafaga.porSegundo, I, dt, azar)) {
    n.doble = t + entre(EFECTOS.doble.rafaga.duracion, azar);
  }
  if (t >= e.invertidos && I >= EFECTOS.invertidos.desde && salta(EFECTOS.invertidos.rafaga.porSegundo, I, dt, azar)) {
    n.invertidos = t + entre(EFECTOS.invertidos.rafaga.duracion, azar);
  }
  if (t >= e.hipo && I >= EFECTOS.hipo.desde && salta(EFECTOS.hipo.porSegundo, I, dt, azar)) {
    n.hipo = t + EFECTOS.hipo.duracion;
    n.hipoLado = azar() < 0.5 ? 1 : -1;
  }
  if (t >= e.tironCambia) {
    n.tironLado = e.tironLado === 1 ? -1 : 1;
    n.tironCambia = t + entre(EFECTOS.tiron.cambio, azar);
  }
  return n;
}

const limitar = (v: number) => Math.min(1, Math.max(-1, v));

/**
 * Lo que llega al coche: lo que pides, pero con retraso, y con el volante
 * tirando, al reves en las rafagas y con los tirones del hipo.
 */
export function mandosBorrachos(e: EstadoBorrachera, I: number, pedidos: Entrada): { estado: EstadoBorrachera; mandos: Entrada } {
  const retraso = EFECTOS.retraso.maximo * I;
  // Se guarda lo pedido y se olvida lo que ya no hace falta.
  const historial = [...e.historial.filter((h) => h.t >= e.t - retraso - 0.25), { t: e.t, m: pedidos }];
  let base = historial[0].m;
  for (const h of historial) {
    if (h.t <= e.t - retraso) base = h.m;
    else break;
  }
  let giro = base.giro;
  if (e.t < e.invertidos) giro = -giro;
  if (I >= EFECTOS.tiron.desde) giro += e.tironLado * EFECTOS.tiron.maximo * I;
  if (e.t < e.hipo) giro += e.hipoLado * EFECTOS.hipo.fuerza;
  return { estado: { ...e, historial }, mandos: { ...base, giro: limitar(giro) } };
}

export type Visuales = {
  /** px CSS de desenfoque. */
  borroso: number;
  /** Separacion de la segunda imagen, px CSS (0 = no hay vision doble). */
  doble: { x: number; y: number };
  /** Giro y desplazamiento extra de la camara (radianes y metros). */
  balanceo: { ang: number; x: number; y: number };
  /** Hay que avisar de que el volante va al reves. */
  invertidos: boolean;
  hipo: boolean;
  /** Oscurecer los bordes (efecto tunel), 0..1. */
  tunel: number;
};

export function visuales(e: EstadoBorrachera, I: number): Visuales {
  const t = e.t;
  const B = EFECTOS.borroso;
  const borroso = (I >= B.desde ? B.maximo * I : 0) + (t < e.borroso ? B.extra * I : 0);
  const D = EFECTOS.doble;
  const amp = (I >= D.desde ? D.maximo * I : 0) + (t < e.doble ? D.extra * I : 0);
  const w = 2 * Math.PI * D.frecuencia * t;
  const L = EFECTOS.balanceo;
  const wb = 2 * Math.PI * L.frecuencia * t + e.fase;
  return {
    borroso,
    doble: { x: amp * Math.cos(w), y: amp * 0.35 * Math.sin(w * 1.3) },
    balanceo: {
      ang: L.angulo * I * Math.sin(wb),
      x: L.desplazamiento * I * Math.sin(wb * 0.7 + 1),
      y: L.desplazamiento * I * 0.5 * Math.cos(wb * 0.9),
    },
    invertidos: t < e.invertidos,
    hipo: t < e.hipo,
    tunel: Math.min(0.45, I * 0.5),
  };
}
