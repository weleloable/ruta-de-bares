/**
 * Tapon al Vuelo: logica pura, sin React ni red (los tests la cargan tal cual,
 * por eso no importa nada).
 *
 * Unidades: METROS y SEGUNDOS, con el origen en la barra justo debajo de la
 * chapa, `x` hacia la derecha e `y` hacia ARRIBA (la pantalla la da la vuelta).
 *
 * La fisica avanza a pasos FIJOS de `PASO` segundos, nunca uno por fotograma:
 * `avanzarVuelo` acumula el tiempo real y gasta pasos enteros, asi que el mismo
 * tiro acaba igual a 30 que a 60 fps (y en un movil que se atasca). Es la misma
 * idea que `suavizarEnTiempo` de la cana: el resultado depende del tiempo, no
 * del ritmo al que se pinta.
 */

export const GRAVEDAD = 9.8;
/** Paso de la simulacion (s). */
export const PASO = 1 / 120;
/** Radio de la chapa (m). */
export const RADIO_CHAPA = 0.03;
/** Altura desde la que sale la chapa: la cuchara de la catapulta en reposo (m). */
export const ALTURA_SALIDA = 0.35;
/** Velocidad de salida con el arrastre a tope (m/s). */
export const VELOCIDAD_MAXIMA = 7.5;
/**
 * Cuanto se perdona (m) por fuera de la boca dibujada: el centro de la chapa
 * puede caer a esta distancia mas alla del borde y cuenta como acierto. A ojo,
 * una chapa que MORDIA el borde parecia dentro y no lo era.
 */
export const GENEROSIDAD = 0.035;
/** Grosor de las paredes de los vasos (m): por donde se roza el borde. */
export const PARED = 0.015;
/** Un vuelo no dura mas que esto, pase lo que pase (s). */
export const VUELO_MAXIMO = 3;
/** Lo que se ve del campo, para la escala de la pantalla (m). */
// xMin deja ver la catapulta entera (su base llega a -0,34).
export const CAMPO = { xMin: -0.4, xMax: 3.45, yMax: 1.7 };

export const TIROS = 10;
/** Desde que tiro (1..10) hay viento, y desde cual se mueven las dianas. */
export const TIRO_VIENTO = 4;
export const TIRO_MOVIMIENTO = 7;
/** Viento: aceleracion horizontal (m/s2), con un minimo para que se note. */
export const VIENTO_MAXIMO = 1.5;
export const VIENTO_MINIMO = 0.4;

export type IdDiana = 'vaso' | 'jarra' | 'caja' | 'oreja';

export type FichaDiana = {
  id: IdDiana;
  nombre: string;
  /** Distancia del centro de la boca a la chapa (m), antes de la variacion de la semilla. */
  distancia: number;
  /** Altura de la boca (m). Las que estan en la barra tienen cuerpo debajo. */
  alturaBoca: number;
  /** Ancho de la boca (m). */
  boca: number;
  /**
   * Ancho del cuerpo por fuera (m). En los vasos es la boca mas las paredes; en
   * la caja es mas: la boca es el hueco del centro y a los lados hay botellines,
   * y caer en sus chapas es borde, no acierto.
   */
  ancho: number;
  puntos: number;
  /** Tiene cuerpo solido de la barra a la boca (contra el que se choca por el lado). */
  cuerpo: boolean;
};

export const DIANAS: readonly FichaDiana[] = [
  // Alturas con forma de vaso de verdad (la primera version era chata y no parecia un vaso).
  { id: 'vaso', nombre: 'Vaso de caña', distancia: 1.2, alturaBoca: 0.42, boca: 0.3, ancho: 0.33, puntos: 10, cuerpo: true },
  { id: 'jarra', nombre: 'Jarra', distancia: 2.0, alturaBoca: 0.36, boca: 0.24, ancho: 0.27, puntos: 20, cuerpo: true },
  { id: 'caja', nombre: 'Caja de botellines', distancia: 3.0, alturaBoca: 0.3, boca: 0.2, ancho: 0.4, puntos: 35, cuerpo: true },
  // La oreja es la del camarero, que asoma por detras de la barra: sin cuerpo. Su
  // CABEZA si choca (ver CABEZA).
  { id: 'oreja', nombre: 'Oreja del camarero', distancia: 2.5, alturaBoca: 0.9, boca: 0.12, ancho: 0.12, puntos: 50, cuerpo: false },
];

/**
 * La cabeza del camarero, respecto al centro de su oreja (m). Darle es fallar,
 * y se dice ("¡Al camarero no!"): la primera version la dejaba atravesar y no
 * se entendia que era aquella figura. Va a la DERECHA de la oreja y lo bastante
 * separada para que una chapa que cae limpia en la oreja no la roce antes.
 */
export const CABEZA = { dx: 0.17, dy: 0.04, r: 0.085 };

const FICHA: Record<IdDiana, FichaDiana> = Object.fromEntries(DIANAS.map((d) => [d.id, d])) as Record<IdDiana, FichaDiana>;
export const ficha = (id: IdDiana) => FICHA[id];

/** Multiplicador de racha en DECIMAS: 1.er acierto x1, 2.o x1,5 ... desde el 5.o, x3. */
export const MULTIPLICADORES = [10, 15, 20, 25, 30] as const;
export const multiplicador = (racha: number) =>
  racha <= 0 ? 10 : MULTIPLICADORES[Math.min(racha, MULTIPLICADORES.length) - 1];

/** Puntos de un acierto que deja la racha en `racha` (1 = primer acierto seguido). */
export const puntosAcierto = (id: IdDiana, racha: number) => Math.floor((FICHA[id].puntos * multiplicador(racha)) / 10);

/** 10 aciertos seguidos a la diana mas valiosa: 50 x (1 + 1,5 + 2 + 2,5 + 3 x 6) = 1250. */
export const PUNTUACION_MAXIMA = (() => {
  let total = 0;
  const mejor = Math.max(...DIANAS.map((d) => d.puntos));
  for (let i = 1; i <= TIROS; i++) total += Math.floor((mejor * multiplicador(i)) / 10);
  return total;
})();

// --- Azar con semilla ----------------------------------------------------------

/** mulberry32: pequeno, rapido y el mismo en todas partes. Devuelve [0, 1). */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Partida -----------------------------------------------------------------

export type Movimiento = { amplitud: number; periodo: number; fase: number };

export type DianaEnJuego = {
  id: IdDiana;
  /** Centro de la boca en reposo (m). */
  x: number;
  mov: Movimiento;
};

export type Partida = {
  semilla: number;
  dianas: DianaEnJuego[];
  /** Viento de cada tiro (m/s2, + hacia la derecha). 0 antes de TIRO_VIENTO. */
  vientos: number[];
  /** Tiros ya hechos (0..10). */
  tiro: number;
  puntos: number;
  racha: number;
  mejorRacha: number;
  aciertos: Record<IdDiana, number>;
};

export function crearPartida(semilla: number): Partida {
  const r = azar(semilla);
  const dianas = DIANAS.map((d): DianaEnJuego => {
    // La oreja se pasea entre 2,2 y 2,8; el resto, +-0,15 de su sitio.
    const x = d.id === 'oreja' ? 2.2 + r() * 0.6 : d.distancia + (r() * 2 - 1) * 0.15;
    const mov: Movimiento =
      d.id === 'oreja'
        ? { amplitud: 0.3, periodo: 2.2, fase: r() * Math.PI * 2 }
        : { amplitud: 0.2, periodo: 1.6 + r() * 1.2, fase: r() * Math.PI * 2 };
    return { id: d.id, x, mov };
  });
  const vientos = Array.from({ length: TIROS }, (_, i) => {
    const signo = r() < 0.5 ? -1 : 1;
    const fuerza = VIENTO_MINIMO + r() * (VIENTO_MAXIMO - VIENTO_MINIMO);
    return i + 1 >= TIRO_VIENTO ? Math.round(signo * fuerza * 10) / 10 : 0;
  });
  return {
    semilla,
    dianas,
    vientos,
    tiro: 0,
    puntos: 0,
    racha: 0,
    mejorRacha: 0,
    aciertos: { vaso: 0, jarra: 0, caja: 0, oreja: 0 },
  };
}

export const terminada = (p: Partida) => p.tiro >= TIROS;
/** Numero del tiro que toca (1..10). */
export const tiroActual = (p: Partida) => Math.min(p.tiro + 1, TIROS);
export const vientoActual = (p: Partida) => p.vientos[p.tiro] ?? 0;

/** Si en el tiro `n` (1..10) se mueve esta diana. La oreja, siempre. */
export const seMueve = (id: IdDiana, n: number) => id === 'oreja' || n >= TIRO_MOVIMIENTO;

/** Centro de la boca de cada diana en el instante `t` (s, reloj del tiro). */
export function posicionDiana(d: DianaEnJuego, n: number, t: number): number {
  if (!seMueve(d.id, n)) return d.x;
  return d.x + d.mov.amplitud * Math.sin((2 * Math.PI * t) / d.mov.periodo + d.mov.fase);
}

export type Resultado =
  | { tipo: 'dentro'; diana: IdDiana }
  | { tipo: 'borde'; diana: IdDiana }
  | { tipo: 'camarero' }
  | { tipo: 'fuera' };

/** Apunta el resultado de un tiro. Solo 'dentro' suma y alarga la racha. */
export function registrarTiro(p: Partida, r: Resultado): Partida {
  if (terminada(p)) return p;
  if (r.tipo !== 'dentro') return { ...p, tiro: p.tiro + 1, racha: 0 };
  const racha = p.racha + 1;
  return {
    ...p,
    tiro: p.tiro + 1,
    racha,
    mejorRacha: Math.max(p.mejorRacha, racha),
    puntos: p.puntos + puntosAcierto(r.diana, racha),
    aciertos: { ...p.aciertos, [r.diana]: p.aciertos[r.diana] + 1 },
  };
}

export const totalAciertos = (p: Partida) => DIANAS.reduce((s, d) => s + p.aciertos[d.id], 0);

/** La diana en la que mas se acerto; a igualdad, la que mas vale. null si ninguna. */
export function dianaFavorita(p: Partida): IdDiana | null {
  let mejor: IdDiana | null = null;
  for (const d of DIANAS) {
    const n = p.aciertos[d.id];
    if (n === 0) continue;
    if (mejor === null || n > p.aciertos[mejor] || (n === p.aciertos[mejor] && d.puntos > FICHA[mejor].puntos)) mejor = d.id;
  }
  return mejor;
}

// --- Lanzamiento ---------------------------------------------------------------

/**
 * Del arrastre (en pixeles de pantalla, desde la chapa hasta el dedo; `y` hacia
 * ABAJO) a la velocidad de salida: tirachinas, sale hacia el lado contrario.
 * `alcance` son los pixeles de arrastre que dan la velocidad maxima.
 */
export function velocidadDesdeArrastre(dx: number, dy: number, alcance: number): { vx: number; vy: number; fuerza: number } {
  const largo = Math.hypot(dx, dy);
  if (!(largo > 0) || !(alcance > 0)) return { vx: 0, vy: 0, fuerza: 0 };
  const fuerza = Math.min(1, largo / alcance);
  const v = fuerza * VELOCIDAD_MAXIMA;
  // Arrastrar hacia abajo e izquierda lanza hacia arriba y derecha.
  return { vx: (-dx / largo) * v, vy: (dy / largo) * v, fuerza };
}

/** Por debajo de esta fuerza (0..1) soltar no lanza: es un toque, no un tiro. */
export const FUERZA_MINIMA = 0.12;

export type Vuelo = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Reloj del tiro (s): mueve las dianas. */
  t: number;
  /** Instante en que se solto (s, mismo reloj). */
  t0: number;
  /** Tiempo real aun sin gastar en pasos (s). */
  resto: number;
  /** Viento de este tiro (m/s2). */
  viento: number;
  /** Numero de tiro (1..10): decide que se mueve. */
  n: number;
  resultado: Resultado | null;
};

/** El vuelo que sale al soltar en el instante `t` del reloj del tiro. */
export function lanzar(p: Partida, vx: number, vy: number, t: number): Vuelo {
  return { x: 0, y: ALTURA_SALIDA, vx, vy, t, t0: t, resto: 0, viento: vientoActual(p), n: tiroActual(p), resultado: null };
}

/**
 * Lo que pasa en el tramo de (x0,y0) a (x1,y1) contra una diana cuya boca esta
 * centrada en `cx`. Exportada para probarla sin depender de una parabola.
 *
 *  - 'dentro': cruza la linea de la boca BAJANDO con el CENTRO de la chapa a
 *    menos de boca/2 + GENEROSIDAD del centro (sin pasar del cuerpo del vaso).
 *    La primera version pedia la chapa ENTERA dentro y se quedaba en "ha tocado
 *    el borde" tiros que a la vista habian entrado: frustraba;
 *  - 'borde': cruza esa linea por fuera de eso (sobre el vidrio o rozandolo), o
 *    se mete en el cuerpo por el lado. Rebota y se acabo;
 *  - null: no toca.
 */
export function choque(
  d: FichaDiana,
  cx: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): 'dentro' | 'borde' | null {
  const yb = d.alturaBoca;
  const mitad = d.boca / 2;
  const fuera = d.ancho / 2;
  if (y0 >= yb && y1 < yb) {
    // Donde corta la linea de la boca, interpolando: un paso largo no se la salta.
    const x = x0 + ((x1 - x0) * (y0 - yb)) / (y0 - y1);
    const lejos = Math.abs(x - cx);
    if (lejos <= (d.cuerpo ? Math.min(mitad + GENEROSIDAD, fuera) : mitad + GENEROSIDAD)) return 'dentro';
    if (lejos <= fuera + RADIO_CHAPA) return d.cuerpo ? 'borde' : null;
  }
  // Por el lado: el cuerpo es un bloque de la barra a la boca.
  if (d.cuerpo && y1 < yb && y1 >= 0 && Math.abs(x1 - cx) <= fuera + RADIO_CHAPA) return 'borde';
  return null;
}

/** Un paso fijo de fisica. */
export function paso(v: Vuelo, dianas: readonly DianaEnJuego[]): Vuelo {
  if (v.resultado) return v;
  const vx = v.vx + v.viento * PASO;
  const vy = v.vy - GRAVEDAD * PASO;
  // Semi-implicito (velocidad primero): estable y exacto lo que hace falta aqui.
  const x = v.x + vx * PASO;
  const y = v.y + vy * PASO;
  const t = v.t + PASO;
  // Primero las que se pueden colar por arriba: si un paso cruza dos, gana la boca.
  let resultado: Resultado | null = null;
  for (const d of dianas) {
    const c = choque(FICHA[d.id], posicionDiana(d, v.n, t), v.x, v.y, x, y);
    if (c === 'dentro') {
      resultado = { tipo: 'dentro', diana: d.id };
      break;
    }
    if (c === 'borde' && !resultado) resultado = { tipo: 'borde', diana: d.id };
    if (d.id === 'oreja' && !resultado) {
      const hx = posicionDiana(d, v.n, t) + CABEZA.dx;
      const hy = FICHA.oreja.alturaBoca + CABEZA.dy;
      if (Math.hypot(x - hx, y - hy) <= CABEZA.r + RADIO_CHAPA) resultado = { tipo: 'camarero' };
    }
  }
  if (!resultado && (y < 0 || x > CAMPO.xMax + 0.5 || x < CAMPO.xMin - 0.5 || t - v.t0 > VUELO_MAXIMO)) {
    resultado = { tipo: 'fuera' };
  }
  return { ...v, x, y, vx, vy, t, resultado };
}

/** Avanza `dt` segundos de tiempo REAL en pasos fijos; lo que sobra se guarda para el siguiente. */
export function avanzarVuelo(v: Vuelo, dianas: readonly DianaEnJuego[], dt: number): Vuelo {
  if (!(dt > 0) || v.resultado) return v;
  let actual: Vuelo = { ...v, resto: v.resto + dt };
  // Pequeno margen para que 1/60 + 1/60 no se quede a una millonesima de dos pasos.
  while (actual.resto >= PASO - 1e-9 && !actual.resultado) {
    actual = { ...paso(actual, dianas), resto: actual.resto - PASO };
  }
  return actual;
}

/**
 * El arranque de la trayectoria, para pintarlo con puntos mientras se apunta:
 * `segundos` de vuelo SIN viento ni dianas (el viento lo tiene que leer quien
 * juega en la flecha, y el final de la parabola es cosa suya).
 */
export function previsualizar(vx: number, vy: number, segundos: number, puntos: number): { x: number; y: number }[] {
  const salida: { x: number; y: number }[] = [];
  for (let i = 1; i <= puntos; i++) {
    const t = (segundos * i) / puntos;
    const y = ALTURA_SALIDA + vy * t - (GRAVEDAD * t * t) / 2;
    if (y < 0) break;
    salida.push({ x: vx * t, y });
  }
  return salida;
}

/** Simula el tiro entero de una vez (tests y verificacion). */
export function simular(p: Partida, vx: number, vy: number, t = 0): Vuelo {
  let v = lanzar(p, vx, vy, t);
  while (!v.resultado) v = paso(v, p.dianas);
  return v;
}

export function mensajeFinal(aciertos: number): string {
  if (aciertos >= 9) return '¡Pulso de cirujano cervecero!';
  if (aciertos >= 6) return 'Tienes buena muñeca.';
  if (aciertos >= 3) return 'Alguna chapa se ha colado.';
  if (aciertos >= 1) return 'Al menos una ha entrado.';
  return 'Las chapas, al suelo. Otra ronda.';
}
