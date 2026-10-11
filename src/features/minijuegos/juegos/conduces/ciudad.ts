import type { Caja, Vec } from './modelo';

/**
 * La ciudad de "¿Conduces tú?": calles sin fin hechas de TRAMOS de 40 x 40 m
 * que se encadenan. Inspirada en Alcala de noche (Calle Mayor con soportales,
 * terrazas, la Plaza de Cervantes, cruces y curvas), no un plano.
 *
 * Como se generan sin cruzarse nunca: el camino solo va hacia el norte, o de
 * lado (este u oeste) un par de tramos y vuelta al norte. Una fila que se deja
 * atras no se vuelve a pisar, asi que dos tramos no caen nunca en la misma
 * casilla. Las bocacalles de los cruces acaban en una valla dentro de su tramo.
 *
 * Cada tramo se describe en su marco LOCAL (se entra por abajo, y = +20, y se
 * sigue hacia arriba, y negativa) y se gira a su sitio. Lo que no es calle es
 * tejado: la pantalla pinta el fondo de tejados y encima las calles.
 *
 * Sin importaciones de otros modulos salvo tipos: los tests lo cargan tal cual.
 */

export const LADO = 40;
const MEDIO = LADO / 2;
/** Media calzada: dos carriles de 4,2 m y una franja de aparcar de 2,3. */
export const MEDIA_CALZADA = 6.5;
/** Donde acaba la acera y empieza la fachada. */
export const FACHADA = 9.5;
/** Centro de cada carril, a cada lado de la raya. */
export const CARRIL = 2.1;
/** Centro de la franja de aparcar. */
const APARCAR = 5.35;
/** Radio de las curvas, por el centro de la calzada. */
export const RADIO_CURVA = MEDIO;

export type Dir = 'N' | 'E' | 'O';
const VECTOR: Record<Dir, Vec> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, O: { x: -1, y: 0 } };
const GIRO_DE: Record<Dir, number> = { N: 0, E: Math.PI / 2, O: -Math.PI / 2 };

export type TipoTramo = 'recta' | 'mayor' | 'terrazas' | 'cruce' | 'plaza' | 'curva';
export type Sentido = 'recto' | 'derecha' | 'izquierda';

export type TipoObstaculo =
  | 'edificio'
  | 'valla'
  | 'aparcado'
  | 'contenedor'
  | 'bolardo'
  | 'mesa'
  | 'columna'
  | 'estatua'
  | 'arbol'
  | 'farola';
export type Obstaculo = Caja & { tipo: TipoObstaculo; color?: string };

export type Tramo = {
  indice: number;
  celda: { i: number; j: number };
  tipo: TipoTramo;
  sentido: Sentido;
  /** Giro del marco local al mundo, y centro del tramo en el mundo. */
  rot: number;
  centro: Vec;
  /** Obstaculos y farolas en LOCAL, para pintarlos girando el lienzo una vez. */
  locales: Obstaculo[];
  farolas: Vec[];
  /** Los mismos obstaculos, ya en el mundo, para chocar. */
  obstaculos: Obstaculo[];
  /** Por donde va el trafico: de la entrada a la salida, en el mundo. */
  camino: Vec[];
  /** Metros del camino al empezar este tramo, y lo que mide. */
  sInicio: number;
  longitud: number;
  /** Para variar el dibujo sin guardar nada mas. */
  semilla: number;
};

export const COLORES_COCHE = ['#3B6EA5', '#2F6B4F', '#A82C24', '#D9CDB4', '#3a3a3a', '#7B4EA3', '#C9A227', '#8C8C8C'];
const COLORES_SOMBRILLA = ['#A82C24', '#2F6B4F', '#E8A32C', '#FFFDF8', '#3B6EA5'];

type Azar = () => number;
const elegir = <T>(lista: readonly T[], azar: Azar): T => lista[Math.min(Math.floor(azar() * lista.length), lista.length - 1)];
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function aMundo(p: Vec, rot: number, centro: Vec): Vec {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: centro.x + p.x * c - p.y * s, y: centro.y + p.x * s + p.y * c };
}

export function aLocal(p: Vec, rot: number, centro: Vec): Vec {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = p.x - centro.x;
  const dy = p.y - centro.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

const espejo = <T extends { x: number; ang?: number }>(o: T): T => ({ ...o, x: -o.x, ...(o.ang !== undefined ? { ang: -o.ang } : {}) });

// ---------------------------------------------------------------------------
// Los tramos, en local
// ---------------------------------------------------------------------------

type Local = { obstaculos: Obstaculo[]; farolas: Vec[]; camino: Vec[] };

const caja = (tipo: TipoObstaculo, x: number, y: number, w: number, h: number, ang = 0, color?: string): Obstaculo => ({
  tipo,
  x,
  y,
  w,
  h,
  ang,
  ...(color ? { color } : {}),
});

const RECTO: Vec[] = [
  { x: 0, y: MEDIO },
  { x: 0, y: -MEDIO },
];

/** Los dos bloques de edificios a los lados de una calle recta. */
const edificiosRectos = (): Obstaculo[] =>
  [-1, 1].map((lado) => caja('edificio', lado * (FACHADA + (MEDIO - FACHADA) / 2), 0, MEDIO - FACHADA, LADO));

const farola = (x: number, y: number): Obstaculo => caja('farola', x, y, 0.4, 0.4);

function aparcados(azar: Azar, vacio: boolean): Obstaculo[] {
  if (vacio) return [];
  const lista: Obstaculo[] = [];
  for (const y of [-15, -5, 5, 15]) {
    for (const lado of [-1, 1]) {
      const r = azar();
      if (r < 0.3) {
        lista.push(caja('aparcado', lado * APARCAR, y, 1.85, 4.2, azar() < 0.5 ? 0 : Math.PI, elegir(COLORES_COCHE, azar)));
      } else if (r < 0.36) {
        lista.push(caja('contenedor', lado * APARCAR, y, 1.6, 2.4, 0, azar() < 0.5 ? '#2f5a3a' : '#5a5a52'));
      }
    }
  }
  return lista;
}

function tramoRecto(variante: 'recta' | 'mayor' | 'terrazas', azar: Azar, vacio: boolean): Local {
  const obstaculos = [...edificiosRectos(), ...aparcados(azar, vacio)];
  const farolas: Vec[] = [];
  if (variante === 'mayor') {
    // Los soportales: columnas a lo largo de las dos aceras, pegadas a la fachada.
    for (let y = -18; y <= 18; y += 4) for (const lado of [-1, 1]) obstaculos.push(caja('columna', lado * 8.6, y, 0.55, 0.55));
    farolas.push({ x: -7.6, y: -10 }, { x: 7.6, y: 10 });
  } else if (variante === 'terrazas') {
    if (!vacio) {
      for (const lado of [-1, 1]) {
        if (azar() < 0.25) continue;
        for (let y = -15; y <= 15; y += 5) {
          if (azar() < 0.7) obstaculos.push(caja('mesa', lado * 8.0, y, 0.9, 0.9, 0, elegir(COLORES_SOMBRILLA, azar)));
        }
      }
    }
    farolas.push({ x: -8.9, y: -19 }, { x: 8.9, y: 1 });
  } else {
    farolas.push({ x: -8.9, y: -10 }, { x: 8.9, y: 10 });
  }
  for (const f of farolas) if (variante !== 'mayor') obstaculos.push(farola(f.x, f.y));
  return { obstaculos, farolas, camino: RECTO };
}

function tramoCruce(): Local {
  const m = (MEDIO - FACHADA) / 2 + FACHADA;
  const obstaculos: Obstaculo[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) obstaculos.push(caja('edificio', sx * m, sy * m, MEDIO - FACHADA, MEDIO - FACHADA));
  // Las bocacalles estan cortadas: valla al final de cada una.
  for (const lado of [-1, 1]) obstaculos.push(caja('valla', lado * (MEDIO - 0.5), 0, 0.8, FACHADA * 2));
  const farolas = [
    { x: -8.6, y: -8.6 },
    { x: 8.6, y: 8.6 },
  ];
  for (const f of farolas) obstaculos.push(farola(f.x, f.y));
  // Bolardos en las esquinas de las aceras.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) obstaculos.push(caja('bolardo', sx * 7.0, sy * 7.0, 0.35, 0.35));
  return { obstaculos, farolas, camino: RECTO };
}

/** La Plaza de Cervantes: abierta, con la estatua en medio; se rodea por la derecha. */
function tramoPlaza(): Local {
  const obstaculos: Obstaculo[] = [
    caja('edificio', -18.5, 0, 3, LADO),
    caja('edificio', 18.5, 0, 3, LADO),
    caja('estatua', 0, 0, 3.6, 3.6),
    caja('arbol', -11, -11, 1.4, 1.4),
    caja('arbol', -11, 11, 1.4, 1.4),
    caja('arbol', -4, -15, 1.4, 1.4),
  ];
  const farolas = [
    { x: -15, y: 0 },
    { x: 15.5, y: -15 },
    { x: 15.5, y: 15 },
  ];
  for (const f of farolas) obstaculos.push(farola(f.x, f.y));
  return {
    obstaculos,
    farolas,
    camino: [
      { x: 0, y: MEDIO },
      { x: 11, y: 9 },
      { x: 11, y: -9 },
      { x: 0, y: -MEDIO },
    ],
  };
}

/** Curva a la DERECHA (a la izquierda es su espejo): un cuarto de anillo con centro en la esquina. */
function tramoCurvaDerecha(): Local {
  const esquina = { x: MEDIO, y: MEDIO };
  const obstaculos: Obstaculo[] = [];
  // Por dentro: la manzana de la esquina, como cuadrado y como rombo (juntos, casi un circulo).
  const lado = 14.8;
  obstaculos.push(caja('edificio', esquina.x, esquina.y, lado, lado));
  obstaculos.push(caja('edificio', esquina.x, esquina.y, lado, lado, Math.PI / 4));
  // Por fuera: un collar de cajas tangentes al borde exterior de la acera.
  const exterior = RADIO_CURVA + FACHADA;
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k * Math.PI) / 12;
    const r = exterior + 4;
    obstaculos.push(caja('edificio', esquina.x + Math.cos(a) * r, esquina.y + Math.sin(a) * r, 8, 9.4, a));
  }
  const farolas = [Math.PI + Math.PI / 6, Math.PI + Math.PI / 3].map((a) => ({
    x: esquina.x + Math.cos(a) * (RADIO_CURVA + 8.6),
    y: esquina.y + Math.sin(a) * (RADIO_CURVA + 8.6),
  }));
  for (const f of farolas) obstaculos.push(farola(f.x, f.y));
  const camino: Vec[] = [];
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k * Math.PI) / 12;
    camino.push({ x: esquina.x + Math.cos(a) * RADIO_CURVA, y: esquina.y + Math.sin(a) * RADIO_CURVA });
  }
  return { obstaculos, farolas, camino };
}

function construir(tipo: TipoTramo, sentido: Sentido, azar: Azar, vacio: boolean): Local {
  switch (tipo) {
    case 'cruce':
      return tramoCruce();
    case 'plaza':
      return tramoPlaza();
    case 'curva': {
      const derecha = tramoCurvaDerecha();
      if (sentido === 'derecha') return derecha;
      return {
        obstaculos: derecha.obstaculos.map(espejo),
        farolas: derecha.farolas.map(espejo),
        camino: derecha.camino.map(espejo),
      };
    }
    default:
      return tramoRecto(tipo, azar, vacio);
  }
}

/** Cuanto se ha avanzado DENTRO de un tramo, de 0 (entrada) a 1 (salida), segun un punto local. */
export function avanceLocal(tipo: TipoTramo, sentido: Sentido, p: Vec): number {
  if (tipo === 'curva') {
    const x = sentido === 'derecha' ? p.x : -p.x;
    const a = Math.atan2(MEDIO - p.y, MEDIO - x);
    return limitar(a / (Math.PI / 2), 0, 1);
  }
  return limitar(0.5 - p.y / LADO, 0, 1);
}

const longitudDe = (puntos: readonly Vec[]) =>
  puntos.slice(1).reduce((s, p, k) => s + Math.hypot(p.x - puntos[k].x, p.y - puntos[k].y), 0);

const girarDir = (d: Dir, sentido: Sentido): Dir => {
  if (sentido === 'recto') return d;
  if (d === 'N') return sentido === 'derecha' ? 'E' : 'O';
  // De lado solo se gira para volver al norte.
  return 'N';
};

// ---------------------------------------------------------------------------
// La ciudad: genera por delante y olvida lo de atras
// ---------------------------------------------------------------------------

/** Tramos que se mantienen por delante y por detras del coche. */
export const POR_DELANTE = 6;
export const POR_DETRAS = 2;
/** Tramos rectos y vacios del principio: arrancar sin sustos. */
const TRAMOS_TRANQUILOS = 2;

const clave = (i: number, j: number) => `${i},${j}`;

export class Ciudad {
  tramos: Tramo[] = [];
  private porCelda = new Map<string, Tramo>();
  private dir: Dir = 'N';
  private celda = { i: 0, j: 0 };
  private deLado = 0;
  private siguiente = 0;
  private sTotal = 0;
  private anterior: TipoTramo | null = null;
  private cacheObstaculos: Obstaculo[] | null = null;
  /** El camino entero hasta ahora (no se recorta: son pocos puntos por tramo). */
  private camino: { x: number; y: number; s: number }[] = [];

  private readonly azar: Azar;

  constructor(azar: Azar) {
    this.azar = azar;
    while (this.siguiente <= POR_DELANTE) this.generar();
  }

  /** Donde arranca el coche: en su carril, mirando hacia delante. */
  salida(): { x: number; y: number; ang: number } {
    return { x: CARRIL, y: MEDIO - 6, ang: 0 };
  }

  private elegirSiguiente(): { tipo: TipoTramo; sentido: Sentido } {
    const azar = this.azar;
    if (this.siguiente < TRAMOS_TRANQUILOS) return { tipo: 'recta', sentido: 'recto' };
    if (this.dir === 'N') {
      if (azar() < 0.2) return { tipo: 'curva', sentido: azar() < 0.5 ? 'derecha' : 'izquierda' };
    } else {
      // De lado, como mucho dos tramos y de vuelta al norte.
      if (this.deLado >= 2 || azar() < 0.4) return { tipo: 'curva', sentido: this.dir === 'E' ? 'izquierda' : 'derecha' };
    }
    const r = azar();
    let tipo: TipoTramo = r < 0.35 ? 'recta' : r < 0.55 ? 'mayor' : r < 0.75 ? 'terrazas' : r < 0.9 ? 'cruce' : 'plaza';
    if (tipo === 'plaza' && this.anterior === 'plaza') tipo = 'recta';
    return { tipo, sentido: 'recto' };
  }

  private generar() {
    const { tipo, sentido } = this.elegirSiguiente();
    const rot = GIRO_DE[this.dir];
    const centro = { x: this.celda.i * LADO, y: this.celda.j * LADO };
    const local = construir(tipo, sentido, this.azar, this.siguiente < TRAMOS_TRANQUILOS);
    const camino = local.camino.map((p) => aMundo(p, rot, centro));
    const longitud = longitudDe(camino);
    const tramo: Tramo = {
      indice: this.siguiente,
      celda: { ...this.celda },
      tipo,
      sentido,
      rot,
      centro,
      locales: local.obstaculos,
      farolas: local.farolas,
      obstaculos: local.obstaculos.map((o) => ({ ...o, ...aMundo(o, rot, centro), ang: o.ang + rot })),
      camino,
      sInicio: this.sTotal,
      longitud,
      semilla: Math.floor(this.azar() * 1e6),
    };
    // El camino global, sin repetir el punto de union entre tramos.
    let s = this.sTotal;
    camino.forEach((p, k) => {
      if (k === 0 && this.camino.length > 0) return;
      if (k > 0) s += Math.hypot(p.x - camino[k - 1].x, p.y - camino[k - 1].y);
      this.camino.push({ x: p.x, y: p.y, s });
    });
    this.sTotal += longitud;

    this.tramos.push(tramo);
    this.porCelda.set(clave(this.celda.i, this.celda.j), tramo);
    this.anterior = tipo;
    this.siguiente++;

    const nueva = girarDir(this.dir, sentido);
    this.deLado = nueva === 'N' ? 0 : nueva === this.dir ? this.deLado + 1 : 0;
    this.dir = nueva;
    this.celda = { i: this.celda.i + VECTOR[nueva].x, j: this.celda.j + VECTOR[nueva].y };
    this.cacheObstaculos = null;
  }

  /** El tramo que pisa un punto, si es de la ventana actual. */
  tramoEn(p: Vec): Tramo | null {
    return this.porCelda.get(clave(Math.round(p.x / LADO), Math.round(p.y / LADO))) ?? null;
  }

  /**
   * Cuanto camino lleva recorrido un punto (metros desde la salida). Null si
   * esta fuera de la ventana (no deberia: la valla de atras no le deja).
   */
  recorrido(p: Vec): number | null {
    const t = this.tramoEn(p);
    if (!t) return null;
    return t.sInicio + avanceLocal(t.tipo, t.sentido, aLocal(p, t.rot, t.centro)) * t.longitud;
  }

  /** Genera por delante del tramo `indice` y olvida lo que queda muy atras. */
  asegurar(indice: number) {
    while (this.siguiente <= indice + POR_DELANTE) this.generar();
    const viejos = this.tramos.filter((t) => t.indice < indice - POR_DETRAS);
    if (viejos.length > 0) {
      for (const t of viejos) this.porCelda.delete(clave(t.celda.i, t.celda.j));
      this.tramos = this.tramos.filter((t) => t.indice >= indice - POR_DETRAS);
      this.cacheObstaculos = null;
    }
  }

  /** Todo contra lo que se choca: los tramos de la ventana y una valla detras del primero. */
  obstaculos(): Obstaculo[] {
    if (!this.cacheObstaculos) {
      const primero = this.tramos[0];
      // De lado a lado del tramo: en la plaza lo pavimentado es mas ancho que la calle.
      const valla = caja('valla', 0, MEDIO - 0.4, LADO, 0.8);
      this.cacheObstaculos = [
        ...this.tramos.flatMap((t) => t.obstaculos),
        { ...valla, ...aMundo(valla, primero.rot, primero.centro), ang: primero.rot },
      ];
    }
    return this.cacheObstaculos;
  }

  /** La valla de atras, en el mundo (para pintarla). */
  vallaTrasera(): Obstaculo {
    const lista = this.obstaculos();
    return lista[lista.length - 1];
  }

  /** Lo que mide el camino generado hasta ahora. */
  get longitudCamino(): number {
    return this.sTotal;
  }

  /** Un punto del camino a `s` metros de la salida, con la direccion de la marcha. */
  puntoEn(s: number): { p: Vec; t: Vec } {
    const c = this.camino;
    const sc = limitar(s, 0, c[c.length - 1].s);
    // Busqueda binaria del segmento.
    let lo = 0;
    let hi = c.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid].s <= sc) lo = mid;
      else hi = mid;
    }
    const a = c[lo];
    const b = c[hi];
    const largo = b.s - a.s || 1;
    const f = (sc - a.s) / largo;
    return {
      p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
      t: { x: (b.x - a.x) / largo, y: (b.y - a.y) / largo },
    };
  }
}
