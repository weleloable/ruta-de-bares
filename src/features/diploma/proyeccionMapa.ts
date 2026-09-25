/**
 * Mapa estatico de la ruta para el diploma: que teselas de OpenStreetMap hacen
 * falta y donde va cada parada, con matematica de Web Mercator y sin
 * react-native, para probarlo en Node. Un mapa vivo (Leaflet, Google) no sirve
 * aqui: pide la ubicacion, se mueve y no se deja convertir en imagen; esto son
 * unas cuantas imagenes y unos circulos, iguales en web y en movil.
 *
 * El zoom es CONTINUO: el que hace que las paradas toquen justo los margenes.
 * OpenStreetMap solo tiene niveles enteros, asi que las teselas se piden al
 * nivel entero mas cercano y se dibujan un poco mas grandes o pequenas
 * (`Tesela.lado`). Con solo niveles enteros el mapa quedaba, de media, un 40 %
 * mas lejos de lo necesario.
 */

export const LADO_TESELA = 256;

export type Punto = { lat: number; lng: number };
/** Esquina de arriba a la izquierda del mapa, en pixeles del mundo al zoom (decimal) de la vista. */
export type Vista = { zoom: number; izquierda: number; arriba: number };
export type Tesela = {
  x: number;
  y: number;
  /** Nivel entero de la tesela pedida. */
  zoom: number;
  url: string;
  izquierda: number;
  arriba: number;
  /** Lado con el que se dibuja: 256 al zoom exacto, mas o menos si el zoom de la vista es decimal. */
  lado: number;
};

export const URL_TESELAS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** Niveles que existen en OpenStreetMap. */
const ZOOM_TESELA_MAX = 19;

/** Pixeles del mundo (0..256*2^z) de una coordenada, en Web Mercator. `zoom` puede ser decimal. */
export function aPixelesMundo(p: Punto, zoom: number): { x: number; y: number } {
  const mundo = LADO_TESELA * 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, p.lat));
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((p.lng + 180) / 360) * mundo,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * mundo,
  };
}

/**
 * El zoom (decimal, hasta `maxZoom`) justo en el que todas las paradas caben en
 * `ancho` x `alto` dejando `margen` por cada lado: la mas alejada en cada eje
 * toca el margen. La vista queda centrada en ellas. Una sola parada, o todas en
 * el mismo sitio, usa `maxZoom`.
 */
export function calcularVista(
  puntos: readonly Punto[],
  ancho: number,
  alto: number,
  margen: number,
  maxZoom = 17,
  minZoom = 3,
): Vista {
  if (puntos.length === 0) return { zoom: minZoom, izquierda: 0, arriba: 0 };

  // Las distancias entre paradas se doblan con cada nivel de zoom: se miden una
  // vez a zoom 0 y se despeja el zoom que hace que quepan.
  const px0 = puntos.map((p) => aPixelesMundo(p, 0));
  const w0 = Math.max(...px0.map((p) => p.x)) - Math.min(...px0.map((p) => p.x));
  const h0 = Math.max(...px0.map((p) => p.y)) - Math.min(...px0.map((p) => p.y));
  const disponibleX = Math.max(1, ancho - 2 * margen);
  const disponibleY = Math.max(1, alto - 2 * margen);
  const escala = Math.min(w0 > 0 ? disponibleX / w0 : Infinity, h0 > 0 ? disponibleY / h0 : Infinity);
  const zoom = Number.isFinite(escala) ? Math.max(minZoom, Math.min(maxZoom, Math.log2(escala))) : maxZoom;

  const px = puntos.map((p) => aPixelesMundo(p, zoom));
  const cx = (Math.min(...px.map((p) => p.x)) + Math.max(...px.map((p) => p.x))) / 2;
  const cy = (Math.min(...px.map((p) => p.y)) + Math.max(...px.map((p) => p.y))) / 2;
  return { zoom, izquierda: cx - ancho / 2, arriba: cy - alto / 2 };
}

/** Posicion de una parada dentro del mapa, en pixeles desde su esquina de arriba a la izquierda. */
export function proyectar(p: Punto, vista: Vista): { x: number; y: number } {
  const w = aPixelesMundo(p, vista.zoom);
  return { x: w.x - vista.izquierda, y: w.y - vista.arriba };
}

export function urlTesela(zoom: number, x: number, y: number, plantilla = URL_TESELAS): string {
  const n = 2 ** zoom;
  const xValida = ((x % n) + n) % n;
  return plantilla.replace('{z}', String(zoom)).replace('{x}', String(xValida)).replace('{y}', String(y));
}

/** Las teselas que cubren el mapa, cada una con su posicion y su lado dentro de el. */
export function teselas(vista: Vista, ancho: number, alto: number): Tesela[] {
  const zoom = Math.max(0, Math.min(ZOOM_TESELA_MAX, Math.round(vista.zoom)));
  const n = 2 ** zoom;
  // Cada tesela de este nivel se dibuja con `lado` px: mas de 256 si la vista esta
  // mas cerca que el nivel entero, menos si esta mas lejos.
  const lado = LADO_TESELA * 2 ** (vista.zoom - zoom);
  const x0 = Math.floor(vista.izquierda / lado);
  const x1 = Math.floor((vista.izquierda + ancho) / lado);
  const y0 = Math.max(0, Math.floor(vista.arriba / lado));
  const y1 = Math.min(n - 1, Math.floor((vista.arriba + alto) / lado));
  const salida: Tesela[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      salida.push({
        x,
        y,
        zoom,
        url: urlTesela(zoom, x, y),
        izquierda: x * lado - vista.izquierda,
        arriba: y * lado - vista.arriba,
        lado,
      });
    }
  }
  return salida;
}

/** Un tramo recto entre dos paradas: donde empieza, cuanto mide y hacia donde apunta (grados). */
export function tramo(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: a.x, y: a.y, largo: Math.hypot(dx, dy), grados: (Math.atan2(dy, dx) * 180) / Math.PI };
}
