/**
 * Don Quijote Cervecero: la logica de la partida, sin pintar nada (eso es
 * escena3d.ts). Sin importaciones: los tests lo cargan tal cual.
 *
 * El camino es una recta de tres carriles; `dist` es lo recorrido, en metros.
 * Todo avanza con `dt` (segundos), asi que va igual a 30 que a 120 fotogramas.
 * Los obstaculos llegan en PATRONES prediseñados (filas a ciertos segundos de
 * camino) que se combinan al azar segun los metros; cada fila deja siempre al
 * menos una forma de pasar (ver `filaPasable`).
 */

export const ID_QUIJOTE = 'quijote-cervecero';

/** Los numeros del juego, para ajustarlos probando. Metros y segundos. */
export const CONFIG = {
  carriles: 3,
  anchoCarril: 2.4,

  /** Velocidad (m/s): empieza en la inicial y se acerca a la maxima con los metros. */
  velocidadInicial: 11,
  velocidadMaxima: 28,
  /** Metros en los que recorre ~63 % del camino de la inicial a la maxima. */
  metrosAceleracion: 1800,

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

  /** La caja del jugador (Quijote a caballo). */
  jugador: { ancho: 1.0, largo: 1.6, alto: 2.0, altoAgachado: 1.0 },

  /** Hasta donde se genera camino por delante y cuanto se guarda por detras. */
  vista: { delante: 150, detras: 12 },
  /** Hueco (en segundos de camino) entre un patron y el siguiente: al principio y como minimo. */
  huecoInicial: 1.7,
  huecoMinimo: 0.95,
  /** Metros en los que el hueco va del inicial al minimo. */
  metrosDificultad: 2500,
  /** Metros sin obstaculos al empezar. */
  salidaLibre: 60,
} as const;

/** Las cajas de cada tipo: de `base` a `techo` de altura, `largo` de fondo y `ancho` de lado. */
export const OBSTACULOS = {
  /** Piedras y vallas bajas: se saltan. */
  bajo: { base: 0, techo: 0.9, largo: 0.8, ancho: 2.0 },
  /** Ramas, carteles, arcos: hay que agacharse. */
  alto: { base: 1.25, techo: 2.4, largo: 0.6, ancho: 2.2 },
  /** Carretas y pajares: tapan el carril entero, hay que cambiarse. */
  bloque: { base: 0, techo: 2.8, largo: 3.2, ancho: 2.0 },
} as const;

export type TipoObstaculo = keyof typeof OBSTACULOS;
export type Accion = 'izquierda' | 'derecha' | 'arriba' | 'abajo';
export type Carril = 0 | 1 | 2;

export type Obstaculo = { id: number; s: number; carril: Carril; tipo: TipoObstaculo; golpeado: boolean };

export type Evento = 'carril' | 'salto' | 'agacharse' | 'aterriza' | 'choque' | 'tope' | 'fin';

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
  obstaculos: Obstaculo[];
  /** Por donde va la generacion de camino (en `s`). */
  generadoHasta: number;
  siguienteId: number;
  terminado: boolean;
  /** Lo que ha pasado en el ultimo `avanzar` (para sonido, vibracion, camara). */
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
    obstaculos: [],
    generadoHasta: CONFIG.salidaLibre,
    siguienteId: 1,
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
  }
  return e;
}

export const estaAgachado = (e: Estado) => e.t < e.agachadoHasta;
export const esInvulnerable = (e: Estado) => e.t < e.invulnerableHasta;

/** Si la caja del jugador toca la de un obstaculo (en las tres dimensiones). */
export function tocaObstaculo(e: Estado, o: Obstaculo): boolean {
  const J = CONFIG.jugador;
  const O = OBSTACULOS[o.tipo];
  if (Math.abs(o.s - e.dist) > (J.largo + O.largo) / 2) return false;
  if (Math.abs(xDeCarril(o.carril) - e.x) > (J.ancho + O.ancho) / 2) return false;
  const pies = e.y;
  const cabeza = e.y + (estaAgachado(e) ? J.altoAgachado : J.alto);
  return cabeza > O.base && pies < O.techo;
}

// ---------------------------------------------------------------------------
// Patrones de camino
// ---------------------------------------------------------------------------

/** Una fila: a `en` segundos de camino del inicio del patron, que hay en cada carril. */
export type Fila = { en: number; carriles: readonly (TipoObstaculo | null)[] };
export type Patron = { nombre: string; desde: number; peso: number; filas: readonly Fila[] };

const _ = null;

/**
 * Los patrones, de mas faciles a mas dificiles. `desde` son los metros a partir
 * de los que pueden salir. Se pueden voltear (izquierda <-> derecha) al azar.
 */
export const PATRONES: readonly Patron[] = [
  { nombre: 'piedra', desde: 0, peso: 3, filas: [{ en: 0, carriles: ['bajo', _, _] }] },
  { nombre: 'rama', desde: 0, peso: 3, filas: [{ en: 0, carriles: [_, 'alto', _] }] },
  { nombre: 'carreta', desde: 0, peso: 3, filas: [{ en: 0, carriles: [_, 'bloque', _] }] },
  { nombre: 'dos carretas', desde: 120, peso: 3, filas: [{ en: 0, carriles: ['bloque', 'bloque', _] }] },
  { nombre: 'valla', desde: 200, peso: 2, filas: [{ en: 0, carriles: ['bajo', 'bajo', 'bajo'] }] },
  { nombre: 'arco', desde: 200, peso: 2, filas: [{ en: 0, carriles: ['alto', 'alto', 'alto'] }] },
  { nombre: 'mixto', desde: 350, peso: 2, filas: [{ en: 0, carriles: ['bajo', 'alto', 'bloque'] }] },
  {
    nombre: 'eslalon',
    desde: 500,
    peso: 2,
    filas: [
      { en: 0, carriles: ['bloque', 'bloque', _] },
      { en: 0.75, carriles: [_, 'bloque', 'bloque'] },
    ],
  },
  {
    nombre: 'salta y agacha',
    desde: 700,
    peso: 2,
    filas: [
      { en: 0, carriles: ['bajo', 'bajo', 'bajo'] },
      { en: 0.8, carriles: ['alto', 'alto', 'alto'] },
    ],
  },
  {
    nombre: 'pasillo',
    desde: 900,
    peso: 1,
    filas: [
      { en: 0, carriles: ['bloque', _, 'bloque'] },
      { en: 0.6, carriles: ['bloque', 'bajo', 'bloque'] },
      { en: 1.2, carriles: ['bloque', 'alto', 'bloque'] },
    ],
  },
];

/** Una fila se puede pasar si en algun carril no hay nada o hay algo que se salta o se pasa agachado. */
export function filaPasable(f: Fila): boolean {
  return f.carriles.some((c) => c !== 'bloque');
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

/** Pone un patron en el camino a partir de `s0`; devuelve donde acaba (en `s`). */
function colocarPatron(e: Estado, p: Patron, s0: number, azar: () => number): number {
  const v = velocidadEn(s0);
  const voltear = azar() < 0.5;
  // Los de un solo obstaculo cambian de carril al azar; los demas solo se voltean.
  const desplazar = p.filas.length === 1 && p.filas[0]!.carriles.filter((c) => c !== null).length === 1 ? Math.floor(azar() * 3) : 0;
  let fin = s0;
  for (const fila of p.filas) {
    const s = s0 + fila.en * v;
    fila.carriles.forEach((tipo, k) => {
      if (!tipo) return;
      const c = ((voltear ? 2 - k : k) + desplazar) % 3;
      e.obstaculos.push({ id: e.siguienteId++, s, carril: c as Carril, tipo, golpeado: false });
    });
    fin = Math.max(fin, s + OBSTACULOS.bloque.largo);
  }
  return fin;
}

/** Genera camino hasta `vista.delante` por delante y olvida lo que queda atras. */
export function asegurarCamino(e: Estado, azar: () => number): Estado {
  while (e.generadoHasta < e.dist + CONFIG.vista.delante) {
    const fin = colocarPatron(e, elegirPatron(e.generadoHasta, azar), e.generadoHasta, azar);
    e.generadoHasta = fin + huecoEn(fin) * velocidadEn(fin);
  }
  e.obstaculos = e.obstaculos.filter((o) => o.s > e.dist - CONFIG.vista.detras);
  return e;
}

// ---------------------------------------------------------------------------
// Avanzar
// ---------------------------------------------------------------------------

/** Un paso de `dt` segundos. Muta y devuelve el estado (el bucle no crea basura por fotograma). */
export function avanzar(e: Estado, dt: number, azar: () => number): Estado {
  e.eventos = [];
  if (e.terminado || dt <= 0) return e;
  e.t += dt;

  e.velocidad = velocidadEn(e.dist);
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

  // Choques: solo uno por paso, y nada mientras parpadea.
  if (!esInvulnerable(e)) {
    const o = e.obstaculos.find((ob) => !ob.golpeado && tocaObstaculo(e, ob));
    if (o) {
      o.golpeado = true;
      e.vidas -= 1;
      e.invulnerableHasta = e.t + CONFIG.invulnerable;
      e.eventos.push('choque');
      if (e.vidas <= 0) {
        e.terminado = true;
        e.eventos.push('fin');
      }
    }
  }
  return e;
}

/** Los metros enteros que cuentan (la puntuacion de la fase 1). */
export const metros = (e: Estado) => Math.floor(e.dist);
