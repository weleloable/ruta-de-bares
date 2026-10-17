/**
 * Don Quijote Cervecero: la logica de la partida, sin pintar nada (eso es
 * escena3d.ts). Sin importaciones: los tests lo cargan tal cual.
 *
 * El camino es una recta de tres carriles; `dist` es lo recorrido, en metros.
 * Todo avanza con `dt` (segundos), asi que va igual a 30 que a 120 fotogramas.
 * Los obstaculos llegan en PATRONES prediseñados (filas a ciertos segundos de
 * camino) que se combinan al azar segun los metros; cada fila deja siempre al
 * menos una forma de pasar (ver `filaPasable`). Con cada patron llegan jarras
 * (en fila, en zigzag o en arco sobre una valla) y, de vez en cuando, el yelmo
 * o el queso.
 */

export const ID_QUIJOTE = 'quijote-cervecero';

/** Los numeros del juego, para ajustarlos probando. Metros y segundos. */
export const CONFIG = {
  carriles: 3,
  anchoCarril: 2.4,

  /** Velocidad (m/s): empieza en la inicial y se acerca a la maxima con los metros. */
  velocidadInicial: 18,
  velocidadMaxima: 38,
  /** Metros en los que recorre ~63 % del camino de la inicial a la maxima (a los 300 m ya va a ~28). */
  metrosAceleracion: 420,

  /** Lo que tarda en pasar de un carril al de al lado. */
  tiempoCambioCarril: 0.14,
  salto: { altura: 1.7, duracion: 0.62 },
  /** Lo que dura agachado tras deslizar abajo. */
  agachado: 0.62,
  /** Al deslizar abajo en el aire, baja de golpe a esta velocidad (m/s). */
  caidaRapida: 14,
  /** Un salto pedido en el aire se guarda este tiempo y salta al tocar suelo. */
  bufferSalto: 0.22,

  vidas: 3,
  /** Segundos de invulnerable (parpadeando) tras un choque. */
  invulnerable: 2,
  /** Lo mismo cuando el yelmo para el golpe (mas corto: no has perdido nada). */
  invulnerableEscudo: 1,

  /** La caja del jugador (Quijote a caballo). */
  jugador: { ancho: 1.0, largo: 1.6, alto: 2.0, altoAgachado: 1.0 },

  /** Hasta donde se genera camino por delante y cuanto se guarda por detras. */
  vista: { delante: 160, detras: 12 },
  /** Hueco (en segundos de camino) entre un patron y el siguiente: al principio y como minimo. */
  huecoInicial: 1.7,
  huecoMinimo: 0.95,
  /** Metros en los que el hueco va del inicial al minimo. */
  metrosDificultad: 900,
  /** Metros sin obstaculos al empezar. */
  salidaLibre: 60,

  /** Jarras: puntos de cada una y cuantas llenan la barra de Embestida. */
  puntosJarra: 10,
  jarrasEmbestida: 10,
  /** Embestida: lo que dura, cuanto acelera y los puntos por lo que derriba. */
  embestida: { duracion: 3, acelera: 1.3, puntosObstaculo: 25, puntosMolino: 250 },
  /** Probabilidad, por patron, de que salga un yelmo o un queso (y desde que metros). */
  yelmo: { desde: 300, prob: 0.05 },
  queso: { desde: 500, prob: 0.03 },
} as const;

/** Las cajas de cada tipo: de `base` a `techo` de altura, `largo` de fondo y `ancho` de lado. */
export const OBSTACULOS = {
  /** Vallas bajas: se saltan. */
  bajo: { base: 0, techo: 0.9, largo: 0.8, ancho: 2.0 },
  /** Carteles y arcos: hay que agacharse. */
  alto: { base: 1.25, techo: 2.4, largo: 0.6, ancho: 2.2 },
  /** Carretas y pajares: tapan el carril entero, hay que cambiarse. */
  bloque: { base: 0, techo: 2.8, largo: 3.2, ancho: 2.0 },
  /** Un rebaño de ovejas cruzando: bajo (se salta) y ocupa el carril de lado a lado. */
  ovejas: { base: 0, techo: 0.95, largo: 1.8, ancho: 2.3 },
  /** Odres de vino colgados (el episodio del libro): hay que agacharse. */
  odre: { base: 1.25, techo: 2.6, largo: 0.8, ancho: 1.6 },
  /** Molino al borde del camino: su caja es la del plano de las aspas (choca segun `peligroMolino`). */
  molino: { base: 0, techo: 9, largo: 0.6, ancho: 0 },
} as const;

/**
 * Los molinos del camino: torre fuera del camino y aspas que barren uno o dos
 * carriles. `eje` es la altura del eje y `radio` lo que miden las aspas.
 */
export const MOLINO = {
  /** Distancia del eje al centro del camino. */
  hx: 5.8,
  alcance1: { eje: 5.2, radio: 5.6 },
  alcance2: { eje: 6.0, radio: 8.0 },
  /** Velocidad de giro (rad/s) y media anchura angular de un aspa (rad). */
  giro: 1.5,
  ancho: 0.2,
  /** A que altura se mira si el aspa pasa por el jugador (por su pecho). */
  alturaJugador: 1.2,
} as const;

export type TipoObstaculo = keyof typeof OBSTACULOS;
export type Accion = 'izquierda' | 'derecha' | 'arriba' | 'abajo' | 'embestida';
export type Carril = 0 | 1 | 2;

export type Obstaculo = {
  id: number;
  s: number;
  carril: Carril;
  tipo: TipoObstaculo;
  golpeado: boolean;
  /** Para pintar variantes (carreta o pajar...). */
  variante: number;
  /** Solo molinos: a que lado esta (-1 izquierda), cuantos carriles barre y su fase. */
  molino?: { lado: -1 | 1; alcance: 1 | 2; fase: number };
  /** Cuando lo derribo la Embestida (en `t`), para la animacion. */
  derribadoEn?: number;
};

export type TipoRecogible = 'jarra' | 'yelmo' | 'queso';
export type Recogible = { id: number; s: number; carril: Carril; altura: number; tipo: TipoRecogible; cogidoEn?: number };

export type Evento =
  | 'carril'
  | 'salto'
  | 'agacharse'
  | 'aterriza'
  | 'choque'
  | 'escudo'
  | 'tope'
  | 'jarra'
  | 'yelmo'
  | 'queso'
  | 'embestida'
  | 'derribo'
  | 'gigante'
  | 'molino-cerca'
  | 'fin';

export type Estado = {
  t: number;
  dist: number;
  velocidad: number;
  carril: Carril;
  /** Posicion lateral real (se desliza hacia la del carril). */
  x: number;
  y: number;
  vy: number;
  /** Hasta cuando esta agachado (en `t`). */
  agachadoHasta: number;
  /** Salto pedido en el aire, pendiente hasta este `t`. */
  saltoPendienteHasta: number;
  vidas: number;
  invulnerableHasta: number;
  /** Lleva el yelmo de Mambrino: el siguiente golpe no quita vida. */
  escudo: boolean;
  /** Jarras para la Embestida (0 a `jarrasEmbestida`). */
  carga: number;
  embestidaHasta: number;
  obstaculos: Obstaculo[];
  recogibles: Recogible[];
  /** Por donde va la generacion de camino (en `s`). */
  generadoHasta: number;
  siguienteId: number;
  /** Puntos que no son metros: jarras y lo derribado. */
  bonus: number;
  jarras: number;
  molinos: number;
  terminado: boolean;
  /** Lo que ha pasado en el ultimo `avanzar` (para sonido, vibracion, camara, bocadillos). */
  eventos: Evento[];
};

export const xDeCarril = (c: number) => (c - 1) * CONFIG.anchoCarril;

export function crearEstado(): Estado {
  return {
    t: 0,
    dist: 0,
    velocidad: CONFIG.velocidadInicial,
    carril: 1,
    x: 0,
    y: 0,
    vy: 0,
    agachadoHasta: -1,
    saltoPendienteHasta: -1,
    vidas: CONFIG.vidas,
    invulnerableHasta: -1,
    escudo: false,
    carga: 0,
    embestidaHasta: -1,
    obstaculos: [],
    recogibles: [],
    generadoHasta: CONFIG.salidaLibre,
    siguienteId: 1,
    bonus: 0,
    jarras: 0,
    molinos: 0,
    terminado: false,
    eventos: [],
  };
}

/** La velocidad para unos metros: sube rapido al principio y se acerca a la maxima sin pasarla. */
export function velocidadEn(dist: number): number {
  const { velocidadInicial: v0, velocidadMaxima: v1, metrosAceleracion: k } = CONFIG;
  return v0 + (v1 - v0) * (1 - Math.exp(-Math.max(0, dist) / k));
}

/** Segundos de hueco entre patrones a esos metros (cada vez mas juntos). */
export function huecoEn(dist: number): number {
  const p = Math.min(1, Math.max(0, dist) / CONFIG.metrosDificultad);
  return CONFIG.huecoInicial + (CONFIG.huecoMinimo - CONFIG.huecoInicial) * p;
}

const enSuelo = (e: Estado) => e.y <= 0 && e.vy <= 0;
const velocidadSalto = () => (4 * CONFIG.salto.altura) / CONFIG.salto.duracion;
const gravedad = () => (8 * CONFIG.salto.altura) / (CONFIG.salto.duracion * CONFIG.salto.duracion);

function saltar(e: Estado) {
  e.vy = velocidadSalto();
  e.agachadoHasta = -1;
  e.saltoPendienteHasta = -1;
  e.eventos.push('salto');
}

export const estaAgachado = (e: Estado) => e.t < e.agachadoHasta;
export const esInvulnerable = (e: Estado) => e.t < e.invulnerableHasta;
export const embistiendo = (e: Estado) => e.t < e.embestidaHasta;
export const embestidaLista = (e: Estado) => e.carga >= CONFIG.jarrasEmbestida && !embistiendo(e);
/** La puntuacion: metros mas jarras mas lo derribado. */
export const puntuacion = (e: Estado) => Math.floor(e.dist) + e.bonus;
export const metros = (e: Estado) => Math.floor(e.dist);

/** Un gesto (o una tecla). Los cambios de carril se encadenan; un salto en el aire se guarda un momento. */
export function aplicarAccion(e: Estado, a: Accion): Estado {
  if (e.terminado) return e;
  switch (a) {
    case 'izquierda':
    case 'derecha': {
      const nuevo = e.carril + (a === 'izquierda' ? -1 : 1);
      if (nuevo < 0 || nuevo >= CONFIG.carriles) {
        e.eventos.push('tope');
      } else {
        e.carril = nuevo as Carril;
        e.eventos.push('carril');
      }
      break;
    }
    case 'arriba':
      if (enSuelo(e)) saltar(e);
      else e.saltoPendienteHasta = e.t + CONFIG.bufferSalto;
      break;
    case 'abajo':
      e.saltoPendienteHasta = -1;
      if (enSuelo(e)) {
        e.agachadoHasta = e.t + CONFIG.agachado;
        e.eventos.push('agacharse');
      } else {
        // En el aire: baja de golpe y se agacha al llegar.
        e.vy = Math.min(e.vy, -CONFIG.caidaRapida);
        e.agachadoHasta = Number.POSITIVE_INFINITY;
      }
      break;
    case 'embestida':
      if (embestidaLista(e)) {
        e.carga = 0;
        e.embestidaHasta = e.t + CONFIG.embestida.duracion;
        e.eventos.push('embestida');
      }
      break;
  }
  return e;
}

// ---------------------------------------------------------------------------
// Molinos
// ---------------------------------------------------------------------------

export function medidasMolino(alcance: 1 | 2) {
  return alcance === 1 ? MOLINO.alcance1 : MOLINO.alcance2;
}

/** El angulo de la primera aspa (desde +x, en el plano de las aspas) en el instante `t`. */
export function anguloAspas(o: Obstaculo, t: number): number {
  const m = o.molino!;
  // Los de la izquierda giran al reves que los de la derecha: los dos barren el camino de arriba abajo.
  return m.fase - m.lado * MOLINO.giro * t;
}

/** Diferencia angular minima entre dos angulos (0 a pi). */
function difAngulo(a: number, b: number): number {
  const d = (((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
}

/** Si alguna de las cuatro aspas pasa ahora mismo por el punto `x` del camino, a la altura del jugador. */
export function aspaEn(o: Obstaculo, t: number, x: number): boolean {
  const m = o.molino!;
  const { eje, radio } = medidasMolino(m.alcance);
  const hx = m.lado * MOLINO.hx;
  const dx = x - hx;
  const dy = MOLINO.alturaJugador - eje;
  if (Math.hypot(dx, dy) > radio + 0.3) return false;
  const objetivo = Math.atan2(dy, dx);
  const base = anguloAspas(o, t);
  for (let k = 0; k < 4; k++) {
    if (difAngulo(base + (k * Math.PI) / 2, objetivo) < MOLINO.ancho) return true;
  }
  return false;
}

/** Los carriles que barre un molino (para comprobar que siempre queda uno libre). */
export function carrilesBarridos(o: Obstaculo): Carril[] {
  const m = o.molino!;
  const { eje, radio } = medidasMolino(m.alcance);
  return ([0, 1, 2] as Carril[]).filter((c) => Math.hypot(xDeCarril(c) - m.lado * MOLINO.hx, MOLINO.alturaJugador - eje) <= radio + 0.3);
}

/** Si la caja del jugador toca la de un obstaculo (en las tres dimensiones). */
export function tocaObstaculo(e: Estado, o: Obstaculo): boolean {
  const J = CONFIG.jugador;
  const O = OBSTACULOS[o.tipo];
  if (Math.abs(o.s - e.dist) > (J.largo + O.largo) / 2) return false;
  if (o.tipo === 'molino') {
    // Las aspas barren desde lo alto hasta el suelo: no se saltan ni se pasan agachado.
    return aspaEn(o, e.t, e.x - J.ancho / 2) || aspaEn(o, e.t, e.x) || aspaEn(o, e.t, e.x + J.ancho / 2);
  }
  if (Math.abs(xDeCarril(o.carril) - e.x) > (J.ancho + O.ancho) / 2) return false;
  const pies = e.y;
  const cabeza = e.y + (estaAgachado(e) ? J.altoAgachado : J.alto);
  return cabeza > O.base && pies < O.techo;
}

// ---------------------------------------------------------------------------
// Patrones de camino
// ---------------------------------------------------------------------------

/**
 * Una fila: a `en` segundos de camino del inicio del patron, que hay en cada
 * carril. Un 'molino' en un carril quiere decir "un molino a ese lado cuyas
 * aspas barren ese carril" (uno o dos, siempre desde un borde).
 */
export type Fila = { en: number; carriles: readonly (TipoObstaculo | null)[] };
export type Patron = { nombre: string; desde: number; peso: number; filas: readonly Fila[] };

const _ = null;

/**
 * Los patrones, de mas faciles a mas dificiles. `desde` son los metros a partir
 * de los que pueden salir. Se pueden voltear (izquierda <-> derecha) al azar.
 */
export const PATRONES: readonly Patron[] = [
  { nombre: 'valla', desde: 0, peso: 3, filas: [{ en: 0, carriles: ['bajo', _, _] }] },
  { nombre: 'cartel', desde: 0, peso: 3, filas: [{ en: 0, carriles: [_, 'alto', _] }] },
  { nombre: 'carreta', desde: 0, peso: 3, filas: [{ en: 0, carriles: [_, 'bloque', _] }] },
  { nombre: 'dos carretas', desde: 70, peso: 3, filas: [{ en: 0, carriles: ['bloque', 'bloque', _] }] },
  { nombre: 'vallado', desde: 120, peso: 2, filas: [{ en: 0, carriles: ['bajo', 'bajo', 'bajo'] }] },
  { nombre: 'arco', desde: 120, peso: 2, filas: [{ en: 0, carriles: ['alto', 'alto', 'alto'] }] },
  { nombre: 'mixto', desde: 200, peso: 2, filas: [{ en: 0, carriles: ['bajo', 'alto', 'bloque'] }] },
  { nombre: 'rebaño', desde: 250, peso: 3, filas: [{ en: 0, carriles: ['ovejas', 'ovejas', _] }] },
  { nombre: 'odres', desde: 250, peso: 2, filas: [{ en: 0, carriles: [_, 'odre', _] }] },
  { nombre: 'molino', desde: 300, peso: 3, filas: [{ en: 0, carriles: ['molino', _, _] }] },
  {
    nombre: 'eslalon',
    desde: 300,
    peso: 2,
    filas: [
      { en: 0, carriles: ['bloque', 'bloque', _] },
      { en: 0.75, carriles: [_, 'bloque', 'bloque'] },
    ],
  },
  {
    nombre: 'salta y agacha',
    desde: 420,
    peso: 2,
    filas: [
      { en: 0, carriles: ['bajo', 'bajo', 'bajo'] },
      { en: 0.8, carriles: ['alto', 'odre', 'alto'] },
    ],
  },
  { nombre: 'gran molino', desde: 500, peso: 2, filas: [{ en: 0, carriles: ['molino', 'molino', _] }] },
  {
    nombre: 'pasillo',
    desde: 550,
    peso: 1,
    filas: [
      { en: 0, carriles: ['bloque', _, 'bloque'] },
      { en: 0.6, carriles: ['bloque', 'bajo', 'bloque'] },
      { en: 1.2, carriles: ['bloque', 'alto', 'bloque'] },
    ],
  },
  {
    nombre: 'rebaño y molino',
    desde: 700,
    peso: 1,
    filas: [
      { en: 0, carriles: [_, 'ovejas', 'ovejas'] },
      { en: 0.9, carriles: ['molino', _, _] },
    ],
  },
];

/** Lo que no se puede pasar de ninguna forma por ese carril (ni saltando ni agachado). */
const tapa = (c: TipoObstaculo | null) => c === 'bloque' || c === 'molino';

/** Una fila se puede pasar si en algun carril no hay nada o hay algo que se salta o se pasa agachado. */
export function filaPasable(f: Fila): boolean {
  return f.carriles.some((c) => !tapa(c));
}

/** Elige un patron de los que tocan a esos metros, segun su peso. `azar` en [0, 1). */
export function elegirPatron(dist: number, azar: () => number): Patron {
  const posibles = PATRONES.filter((p) => p.desde <= dist);
  const total = posibles.reduce((n, p) => n + p.peso, 0);
  let r = azar() * total;
  for (const p of posibles) {
    r -= p.peso;
    if (r < 0) return p;
  }
  return posibles[posibles.length - 1]!;
}

function ponerRecogible(e: Estado, s: number, carril: number, tipo: TipoRecogible, altura = 1.0) {
  e.recogibles.push({ id: e.siguienteId++, s, carril: carril as Carril, altura, tipo });
}

/** Pone un patron en el camino a partir de `s0`; devuelve donde acaba (en `s`). */
function colocarPatron(e: Estado, p: Patron, s0: number, azar: () => number): number {
  const v = velocidadEn(s0);
  const voltear = azar() < 0.5;
  // Los de un solo obstaculo cambian de carril al azar; los demas solo se voltean.
  const unSolo = p.filas.length === 1 && p.filas[0]!.carriles.filter((c) => c !== null).length === 1 && p.filas[0]!.carriles[0] !== 'molino';
  const desplazar = unSolo ? Math.floor(azar() * 3) : 0;
  const carrilDe = (k: number) => ((voltear ? 2 - k : k) + desplazar) % 3;
  let fin = s0;
  const libres = new Set([0, 1, 2]);
  const vallas: { s: number; carril: number }[] = [];
  for (const fila of p.filas) {
    const s = s0 + fila.en * v;
    const molinoEn = fila.carriles.map((c, k) => (c === 'molino' ? carrilDe(k) : -1)).filter((c) => c >= 0);
    if (molinoEn.length > 0) {
      // Un molino al lado de los carriles que barre (siempre desde un borde).
      const lado: -1 | 1 = molinoEn.includes(0) ? -1 : 1;
      e.obstaculos.push({
        id: e.siguienteId++,
        s,
        carril: (lado < 0 ? 0 : 2) as Carril,
        tipo: 'molino',
        golpeado: false,
        variante: 0,
        molino: { lado, alcance: molinoEn.length >= 2 ? 2 : 1, fase: azar() * Math.PI * 2 },
      });
      molinoEn.forEach((c) => libres.delete(c));
      e.eventos.push('molino-cerca');
    }
    fila.carriles.forEach((tipo, k) => {
      if (!tipo || tipo === 'molino') return;
      const c = carrilDe(k);
      libres.delete(c);
      if (tipo === 'bajo') vallas.push({ s, carril: c });
      e.obstaculos.push({ id: e.siguienteId++, s, carril: c as Carril, tipo, golpeado: false, variante: Math.floor(azar() * 2) });
    });
    fin = Math.max(fin, s + OBSTACULOS.bloque.largo);
  }

  // Jarras: en fila por un carril libre, o en arco sobre una valla (a la altura del salto).
  const r = azar();
  if (libres.size > 0 && r < 0.6) {
    const lista = [...libres];
    const c = lista[Math.floor(azar() * lista.length)]!;
    for (let s = s0 - 8; s <= fin + 2; s += 3.2) ponerRecogible(e, s, c, 'jarra');
  } else if (vallas.length > 0 && r < 0.9) {
    const valla = vallas[Math.floor(azar() * vallas.length)]!;
    const medio = (velocidadSalto() / gravedad()) * v; // metros hasta lo mas alto del salto
    for (let k = -2; k <= 2; k++) {
      const u = k / 2.5;
      ponerRecogible(e, valla.s + k * (medio / 2.5), valla.carril, 'jarra', 1.0 + CONFIG.salto.altura * 0.85 * (1 - u * u));
    }
  }

  // Muy de vez en cuando, el yelmo o el queso, en un carril libre justo despues.
  if (libres.size > 0) {
    const lista = [...libres];
    const c = lista[Math.floor(azar() * lista.length)]!;
    const tirada = azar();
    if (s0 >= CONFIG.queso.desde && tirada < CONFIG.queso.prob) ponerRecogible(e, fin + 4, c, 'queso');
    else if (s0 >= CONFIG.yelmo.desde && tirada < CONFIG.queso.prob + CONFIG.yelmo.prob) ponerRecogible(e, fin + 4, c, 'yelmo');
  }
  return fin;
}

/** Jarras en zigzag por el hueco entre dos patrones (ahi no hay obstaculos). */
function zigzag(e: Estado, desde: number, hasta: number, azar: () => number) {
  let c = Math.floor(azar() * 3);
  let paso = azar() < 0.5 ? 1 : -1;
  let k = 0;
  for (let s = desde + 4; s < hasta - 4; s += 3.5) {
    ponerRecogible(e, s, c, 'jarra');
    if (++k % 2 === 0) {
      if (c + paso < 0 || c + paso > 2) paso = -paso;
      c += paso;
    }
  }
}

/** Genera camino hasta `vista.delante` por delante y olvida lo que queda atras. */
export function asegurarCamino(e: Estado, azar: () => number): Estado {
  while (e.generadoHasta < e.dist + CONFIG.vista.delante) {
    const fin = colocarPatron(e, elegirPatron(e.generadoHasta, azar), e.generadoHasta, azar);
    const siguiente = fin + huecoEn(fin) * velocidadEn(fin);
    if (azar() < 0.3 && siguiente - fin > 18) zigzag(e, fin, siguiente, azar);
    e.generadoHasta = siguiente;
  }
  const atras = e.dist - CONFIG.vista.detras;
  e.obstaculos = e.obstaculos.filter((o) => o.s > atras);
  e.recogibles = e.recogibles.filter((r) => r.s > atras);
  return e;
}

// ---------------------------------------------------------------------------
// Avanzar
// ---------------------------------------------------------------------------

/** Si el jugador coge un recogible (su caja, con algo de margen: coger tiene que ser generoso). */
function alcanza(e: Estado, r: Recogible): boolean {
  if (Math.abs(r.s - e.dist) > 1.3) return false;
  if (Math.abs(xDeCarril(r.carril) - e.x) > 1.2) return false;
  const cabeza = e.y + (estaAgachado(e) ? CONFIG.jugador.altoAgachado : CONFIG.jugador.alto);
  return r.altura > e.y - 0.4 && r.altura < cabeza + 0.6;
}

/** Durante la Embestida: lo que tiene delante (en su carril, sin mirar la altura) cae; los molinos, todos. */
function derriba(e: Estado, o: Obstaculo): boolean {
  if (o.tipo === 'molino') return Math.abs(o.s - e.dist) < 2;
  return Math.abs(o.s - e.dist) < (CONFIG.jugador.largo + OBSTACULOS[o.tipo].largo) / 2 + 0.8 && Math.abs(xDeCarril(o.carril) - e.x) < 1.6;
}

/** Un paso de `dt` segundos. Muta y devuelve el estado (el bucle no crea basura por fotograma). */
export function avanzar(e: Estado, dt: number, azar: () => number): Estado {
  e.eventos = [];
  if (e.terminado || dt <= 0) return e;
  e.t += dt;

  e.velocidad = velocidadEn(e.dist) * (embistiendo(e) ? CONFIG.embestida.acelera : 1);
  e.dist += e.velocidad * dt;

  // Hacia el carril elegido, a velocidad fija.
  const objetivo = xDeCarril(e.carril);
  const paso = (CONFIG.anchoCarril / CONFIG.tiempoCambioCarril) * dt;
  e.x = Math.abs(objetivo - e.x) <= paso ? objetivo : e.x + Math.sign(objetivo - e.x) * paso;

  // Salto: parabola con gravedad constante.
  if (!enSuelo(e) || e.vy > 0) {
    e.vy -= gravedad() * dt;
    e.y += e.vy * dt;
    if (e.y <= 0) {
      e.y = 0;
      e.vy = 0;
      e.eventos.push('aterriza');
      if (e.agachadoHasta === Number.POSITIVE_INFINITY) e.agachadoHasta = e.t + CONFIG.agachado;
      if (e.t < e.saltoPendienteHasta) saltar(e);
    }
  }

  asegurarCamino(e, azar);

  // Lo que se recoge.
  for (const r of e.recogibles) {
    if (r.cogidoEn !== undefined || !alcanza(e, r)) continue;
    r.cogidoEn = e.t;
    if (r.tipo === 'jarra') {
      e.jarras += 1;
      e.bonus += CONFIG.puntosJarra;
      e.carga = Math.min(CONFIG.jarrasEmbestida, e.carga + 1);
      e.eventos.push('jarra');
    } else if (r.tipo === 'yelmo') {
      e.escudo = true;
      e.eventos.push('yelmo');
    } else {
      e.vidas = Math.min(CONFIG.vidas, e.vidas + 1);
      e.eventos.push('queso');
    }
  }

  // Embistiendo: todo lo que tiene delante cae (y no choca con nada).
  if (embistiendo(e)) {
    for (const o of e.obstaculos) {
      if (o.derribadoEn !== undefined || o.golpeado || !derriba(e, o)) continue;
      o.derribadoEn = e.t;
      if (o.tipo === 'molino') {
        e.molinos += 1;
        e.bonus += CONFIG.embestida.puntosMolino;
        e.eventos.push('gigante');
      } else {
        e.bonus += CONFIG.embestida.puntosObstaculo;
        e.eventos.push('derribo');
      }
    }
    return e;
  }

  // Choques: solo uno por paso, y nada mientras parpadea.
  if (!esInvulnerable(e)) {
    const o = e.obstaculos.find((ob) => !ob.golpeado && ob.derribadoEn === undefined && tocaObstaculo(e, ob));
    if (o) {
      o.golpeado = true;
      if (e.escudo) {
        // El yelmo de Mambrino para el golpe y se pierde.
        e.escudo = false;
        e.invulnerableHasta = e.t + CONFIG.invulnerableEscudo;
        e.eventos.push('escudo');
      } else {
        e.vidas -= 1;
        e.invulnerableHasta = e.t + CONFIG.invulnerable;
        e.eventos.push('choque');
        if (e.vidas <= 0) {
          e.terminado = true;
          e.eventos.push('fin');
        }
      }
    }
  }
  return e;
}
