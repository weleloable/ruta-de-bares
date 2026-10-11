import type { Caja, Vec } from './modelo';

/**
 * El trafico: coches que van por el camino de la ciudad, por su carril. Los
 * de tu sentido van despacio por la derecha (los adelantas); los que vienen
 * de frente, por la izquierda. No esquivan: si les cortas el paso, frenan y se
 * quedan quietos, y si les das, se quedan parados ahi (como en la vida real).
 *
 * Nada de fisica: cada coche es un punto del camino (`s`, en metros) y un
 * carril. Sin importaciones salvo tipos: los tests lo cargan tal cual.
 */

/** Lo que el trafico necesita de la ciudad (ver Ciudad). */
export type Camino = {
  puntoEn(s: number): { p: Vec; t: Vec };
  readonly longitudCamino: number;
};

export type CocheTrafico = {
  id: number;
  /** Metros a lo largo del camino. */
  s: number;
  /** 1 = tu sentido (carril derecho), -1 = de frente (izquierdo). */
  carril: 1 | -1;
  /** m/s a lo largo del camino (negativa: viene hacia ti). */
  vel: number;
  color: string;
  /** Le has dado: ya no se mueve. */
  golpeado: boolean;
  /** Frenado ahora mismo (por ti o por el de delante): enciende los pilotos. */
  frenando: boolean;
};

export const TRAFICO = {
  /** Centro del carril respecto a la raya (ver ciudad.ts). */
  carril: 2.1,
  velMismoSentido: 7,
  velDeFrente: 9,
  /** Cuantos de cada sentido como mucho. */
  maximo: 3,
  /** Distancia minima con el de delante en el mismo carril. */
  hueco: 10,
  /** Frena si te tiene delante a menos de esto. */
  frenaAnte: 8,
  /** Donde aparecen, por delante de ti (metros de camino). */
  apareceDesde: 70,
  apareceHasta: 150,
  /** Se quitan al quedarse tan atras. */
  olvidarDetras: 50,
} as const;

const largo = 4.2;
const ancho = 1.85;

/** Donde esta un coche del trafico y hacia donde mira. */
export function situar(c: CocheTrafico, camino: Camino): { x: number; y: number; ang: number } {
  const { p, t } = camino.puntoEn(c.s);
  // Derecha de la marcha del camino: (-t.y, t.x).
  const x = p.x + -t.y * c.carril * TRAFICO.carril;
  const y = p.y + t.x * c.carril * TRAFICO.carril;
  const ang = Math.atan2(t.x, -t.y) + (c.carril === -1 ? Math.PI : 0);
  return { x, y, ang };
}

export function cajaDe(c: CocheTrafico, camino: Camino): Caja {
  const { x, y, ang } = situar(c, camino);
  return { x, y, w: ancho, h: largo, ang };
}

/**
 * Un paso del trafico: mueve, frena ante ti o ante el de delante, quita los
 * que se quedan atras y saca nuevos por delante. `sJugador` son los metros de
 * camino que llevas; `jugador`, donde estas.
 */
export function avanzarTrafico(
  coches: readonly CocheTrafico[],
  camino: Camino,
  jugador: Vec,
  sJugador: number,
  dt: number,
  azar: () => number,
  colores: readonly string[],
  siguienteId: () => number,
): CocheTrafico[] {
  const vivos = coches.filter((c) => c.s > sJugador - TRAFICO.olvidarDetras && c.s < camino.longitudCamino - 1);

  const movidos = vivos.map((c) => {
    if (c.golpeado) return { ...c, frenando: true };
    const sentido = Math.sign(c.vel);
    // El de delante en su carril (en su sentido de marcha).
    const tapado = vivos.some(
      (o) => o !== c && o.carril === c.carril && (o.s - c.s) * sentido > 0 && Math.abs(o.s - c.s) < TRAFICO.hueco,
    );
    // Tu coche, delante de el y en su camino.
    const { x, y, ang } = situar(c, camino);
    const fx = Math.sin(ang);
    const fy = -Math.cos(ang);
    const dx = jugador.x - x;
    const dy = jugador.y - y;
    const delante = dx * fx + dy * fy;
    const lado = Math.abs(dx * -fy + dy * fx);
    const teVe = delante > 0 && delante < TRAFICO.frenaAnte && lado < 2.6;
    const frenando = tapado || teVe;
    return { ...c, s: frenando ? c.s : c.s + c.vel * dt, frenando };
  });

  // Nuevos coches por delante, si caben.
  const nuevos: CocheTrafico[] = [];
  for (const carril of [1, -1] as const) {
    const delCarril = movidos.filter((c) => c.carril === carril && c.s > sJugador);
    if (delCarril.length >= TRAFICO.maximo || azar() > 0.02) continue;
    const s = sJugador + TRAFICO.apareceDesde + azar() * (TRAFICO.apareceHasta - TRAFICO.apareceDesde);
    if (s > camino.longitudCamino - 5) continue;
    if (movidos.some((c) => c.carril === carril && Math.abs(c.s - s) < TRAFICO.hueco * 1.5)) continue;
    nuevos.push({
      id: siguienteId(),
      s,
      carril,
      vel: carril === 1 ? TRAFICO.velMismoSentido : -TRAFICO.velDeFrente,
      color: colores[Math.min(Math.floor(azar() * colores.length), colores.length - 1)],
      golpeado: false,
      frenando: false,
    });
  }
  return [...movidos, ...nuevos];
}
