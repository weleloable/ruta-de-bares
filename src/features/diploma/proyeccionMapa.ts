/**
 * Mapa estatico de la ruta para el diploma: que teselas de OpenStreetMap hacen
 * falta y donde va cada parada, con matematica de Web Mercator y sin
 * react-native, para probarlo en Node. Un mapa vivo (Leaflet, Google) no sirve
 * aqui: pide la ubicacion, se mueve y no se deja convertir en imagen; esto son
 * unas cuantas imagenes y unos circulos, iguales en web y en movil.
 */

export const LADO_TESELA = 256;

export type Punto = { lat: number; lng: number };
/** Esquina de arriba a la izquierda del mapa, en pixeles del mundo a ese zoom. */
export type Vista = { zoom: number; izquierda: number; arriba: number };
export type Tesela = { x: number; y: number; zoom: number; url: string; izquierda: number; arriba: number };

export const URL_TESELAS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Pixeles del mundo (0..256*2^z) de una coordenada, en Web Mercator. */
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
 * El zoom mas alto (hasta `maxZoom`) en el que todas las paradas caben en
 * `ancho` x `alto` dejando `margen` por cada lado, y la vista centrada en ellas.
 * Una sola parada, o todas en el mismo sitio, usa `maxZoom`.
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
  for (let zoom = maxZoom; zoom >= minZoom; zoom--) {
    const px = puntos.map((p) => aPixelesMundo(p, zoom));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (maxX - minX <= ancho - 2 * margen && maxY - minY <= alto - 2 * margen) {
      return { zoom, izquierda: (minX + maxX) / 2 - ancho / 2, arriba: (minY + maxY) / 2 - alto / 2 };
    }
  }
  const px = puntos.map((p) => aPixelesMundo(p, minZoom));
  const cx = (Math.min(...px.map((p) => p.x)) + Math.max(...px.map((p) => p.x))) / 2;
  const cy = (Math.min(...px.map((p) => p.y)) + Math.max(...px.map((p) => p.y))) / 2;
  return { zoom: minZoom, izquierda: cx - ancho / 2, arriba: cy - alto / 2 };
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

/** Las teselas que cubren el mapa, cada una con su posicion dentro de el. */
export function teselas(vista: Vista, ancho: number, alto: number): Tesela[] {
  const n = 2 ** vista.zoom;
  const x0 = Math.floor(vista.izquierda / LADO_TESELA);
  const x1 = Math.floor((vista.izquierda + ancho) / LADO_TESELA);
  const y0 = Math.max(0, Math.floor(vista.arriba / LADO_TESELA));
  const y1 = Math.min(n - 1, Math.floor((vista.arriba + alto) / LADO_TESELA));
  const salida: Tesela[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      salida.push({
        x,
        y,
        zoom: vista.zoom,
        url: urlTesela(vista.zoom, x, y),
        izquierda: x * LADO_TESELA - vista.izquierda,
        arriba: y * LADO_TESELA - vista.arriba,
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
