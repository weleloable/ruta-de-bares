/**
 * Geometria del DIBUJO de "La Caña Perfecta": donde esta la superficie de la
 * cerveza y donde choca el chorro. Logica pura, sin React. No toca la nota: el
 * modelo (`modelo.ts`) sigue midiendo en fracciones del vaso; esto solo decide
 * como se pinta lo que el modelo dice.
 *
 * Dos marcos de referencia, y todo gira sobre el MISMO punto, el centro de la
 * boca (el vaso se dibuja girado sobre ella para que siga bajo el grifo):
 *  - el del vaso: x a la derecha, y hacia el fondo, origen en el centro de la
 *    boca; el interior es x en [-ancho/2, ancho/2], y en [0, alto];
 *  - el del mundo: el de la pantalla. El vaso girado `a` grados (positivo =
 *    sentido horario, como `rotate` de CSS) y la gravedad siempre hacia abajo.
 *
 * Por que hace falta: el chorro cae en vertical (gravedad) y el vaso esta
 * inclinado. Antes el chorro medía "lo que falta para llenar" a lo largo del
 * eje del vaso y, inclinado, salia por la pared. Ahora acaba en lo primero que
 * encuentra: la superficie, la pared baja o el fondo.
 */

export type Dimensiones = { ancho: number; alto: number };
type Punto = { x: number; y: number };

const rad = (grados: number) => (grados * Math.PI) / 180;

/**
 * La gravedad vista desde el vaso: el vector (0, 1) del mundo girado `-a`. La
 * "profundidad" de un punto del vaso (cuanto esta por debajo de la boca en
 * vertical real) es su producto escalar con este vector.
 */
function abajo(anguloGrados: number): Punto {
  return { x: Math.sin(rad(anguloGrados)), y: Math.cos(rad(anguloGrados)) };
}

function esquinas({ ancho, alto }: Dimensiones): Punto[] {
  const m = ancho / 2;
  return [
    { x: -m, y: 0 },
    { x: m, y: 0 },
    { x: m, y: alto },
    { x: -m, y: alto },
  ];
}

/** Area (shoelace) del interior del vaso que queda por debajo de la profundidad `p`. */
function areaBajo(p: number, g: Punto, d: Dimensiones): number {
  const prof = (q: Punto) => q.x * g.x + q.y * g.y;
  // Sutherland-Hodgman contra un solo semiplano: el rectangulo es convexo.
  const esq = esquinas(d);
  const dentro: Punto[] = [];
  for (let i = 0; i < esq.length; i++) {
    const a = esq[i];
    const b = esq[(i + 1) % esq.length];
    const pa = prof(a) - p;
    const pb = prof(b) - p;
    if (pa >= 0) dentro.push(a);
    if (pa >= 0 !== pb >= 0) {
      const t = pa / (pa - pb);
      dentro.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  let doble = 0;
  for (let i = 0; i < dentro.length; i++) {
    const a = dentro[i];
    const b = dentro[(i + 1) % dentro.length];
    doble += a.x * b.y - b.x * a.y;
  }
  return Math.abs(doble) / 2;
}

/**
 * Profundidad (px por debajo de la boca, en vertical real) de una superficie
 * HORIZONTAL que deja `fraccion` del vaso por debajo. La cerveza se queda
 * plana aunque el vaso se incline: dibujarla girada con el vaso era lo que
 * delataba que era un rectangulo y no un liquido.
 *
 * Inclinado y casi lleno, la superficie puede quedar por encima del borde bajo
 * (de verdad se saldria antes). El modelo no lo simula y la nota no cambia: se
 * pinta lleno hasta la boca. Es una licencia a proposito.
 */
export function profundidadSuperficie(anguloGrados: number, fraccion: number, d: Dimensiones): number {
  const g = abajo(anguloGrados);
  const profs = esquinas(d).map((q) => q.x * g.x + q.y * g.y);
  let arriba = Math.min(...profs);
  let fondo = Math.max(...profs);
  const v = Math.min(Math.max(fraccion, 0), 1);
  if (v <= 0) return fondo;
  if (v >= 1) return arriba;
  const objetivo = v * d.ancho * d.alto;
  // Biseccion: el area por debajo baja al bajar la superficie. 40 pasos = mucho menos de un pixel.
  for (let i = 0; i < 40; i++) {
    const medio = (arriba + fondo) / 2;
    if (areaBajo(medio, g, d) > objetivo) arriba = medio;
    else fondo = medio;
  }
  return (arriba + fondo) / 2;
}

export type Impacto = {
  /** Px que recorre el chorro desde la boca del vaso hasta donde choca (en vertical). */
  distancia: number;
  contra: 'superficie' | 'pared' | 'fondo';
  /** Lado de la pared contra la que choca: 1 derecha, -1 izquierda (del vaso). */
  lado: 1 | -1;
};

/**
 * Donde choca el chorro, que cae en vertical justo por el centro de la boca: en
 * la superficie si llega antes, si no en la pared baja (el vaso inclinado) o en
 * el fondo. `superficie` es la profundidad de lo de mas arriba (la espuma).
 */
export function impactoChorro(anguloGrados: number, superficie: number, d: Dimensiones): Impacto {
  const g = abajo(anguloGrados);
  const lado = g.x >= 0 ? 1 : -1;
  // Por el eje vertical que sale de la boca, el punto a distancia t esta en t*g (g es unitario).
  const hastaPared = Math.abs(g.x) > 1e-9 ? d.ancho / 2 / Math.abs(g.x) : Infinity;
  const hastaFondo = d.alto / g.y;
  const hastaSuperficie = Math.max(superficie, 0);
  const distancia = Math.min(hastaSuperficie, hastaPared, hastaFondo);
  // En un empate gana lo solido: el vaso vacio tiene la "superficie" justo en el fondo.
  const contra = distancia === hastaPared ? 'pared' : distancia === hastaFondo ? 'fondo' : 'superficie';
  return { distancia, contra, lado };
}

/**
 * Cuando el chorro da en la pared, la cerveza baja resbalando por ella hasta la
 * superficie: es la tecnica de tirar una caña con el vaso inclinado. Devuelve
 * el tramo de pared mojada, en el marco del vaso (y desde la boca), o null.
 */
export function regueroPared(
  anguloGrados: number,
  impacto: Impacto,
  superficie: number,
  d: Dimensiones,
): { lado: 1 | -1; desde: number; hasta: number } | null {
  if (impacto.contra !== 'pared') return null;
  const g = abajo(anguloGrados);
  const desde = impacto.distancia * g.y;
  // Punto de la pared (lado*ancho/2, y) cuya profundidad es la de la superficie.
  const hasta = Math.min((superficie - (d.ancho / 2) * Math.abs(g.x)) / g.y, d.alto);
  return hasta > desde ? { lado: impacto.lado, desde, hasta } : null;
}

/**
 * Esquina(s) de la boca por donde se sale la cerveza al derramar, en el mundo y
 * relativas al centro de la boca. Recto se sale por los dos lados.
 */
export function bordesDeDerrame(anguloGrados: number, semiancho: number): Punto[] {
  const a = rad(anguloGrados);
  const borde = (s: 1 | -1): Punto => ({ x: s * semiancho * Math.cos(a), y: s * semiancho * Math.sin(a) });
  if (Math.abs(anguloGrados) < 2) return [borde(-1), borde(1)];
  return [borde(anguloGrados > 0 ? 1 : -1)];
}
