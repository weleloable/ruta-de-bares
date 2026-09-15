import type { Punto } from './coordenadas';

/**
 * Como encuadrar un conjunto de paradas en el mapa. Logica pura, sin Leaflet,
 * para poder probarla en Node: Leaflet toca `window` nada mas cargarse.
 *
 * Tres casos que un fitBounds a ciegas hace mal:
 * - sin paradas: no hay nada que encuadrar (null), el mapa se queda donde esta;
 * - una parada, o todas en el mismo sitio: unos limites de area cero mandan a
 *   Leaflet al zoom maximo; se centra con un zoom de calle;
 * - coordenadas no finitas (NaN de un dato roto): se ignoran en vez de mandar
 *   el mapa a (NaN, NaN), que lo deja en gris.
 */

/** Zoom de "estoy en la calle del bar": se ven la manzana y las de al lado. */
export const ZOOM_PARADA = 17;

/** Alto que tapan cabecera (arriba) y carrusel (abajo) mientras no se han medido. */
export const MARGEN_ARRIBA_PX = 110;
export const MARGEN_ABAJO_PX = 250;

/** Pixeles tapados arriba y abajo del mapa por lo que la pantalla pinta encima. */
export type Huecos = { arriba: number; abajo: number };

export const HUECOS_POR_DEFECTO: Huecos = { arriba: MARGEN_ARRIBA_PX, abajo: MARGEN_ABAJO_PX };

/** Por debajo de este hueco libre real, centrar "en el hueco" no tiene sentido. */
const LIBRE_MINIMO_REAL_PX = 40;

const noNegativo = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * Margenes verticales para encuadrar las paradas sin que queden debajo de la
 * cabecera o del carrusel. `tapado` son las alturas medidas en la pantalla.
 *
 * Con los margenes tal cual, una pantalla baja (movil en horizontal, ventana
 * pequena) se queda casi sin hueco libre y el mapa se aleja hasta ensenar media
 * ciudad con los pines amontonados. Si no queda libre al menos la mitad del
 * alto (o 240 px, lo que sea menor), los dos margenes se reducen en la misma
 * proporcion: algun pin puede quedar bajo el carrusel, pero la ruta se entiende.
 */
export function margenesEncuadre(altoPx: number, tapado: Huecos = HUECOS_POR_DEFECTO): Huecos {
  const alto = noNegativo(altoPx);
  const arriba = noNegativo(tapado.arriba);
  const abajo = noNegativo(tapado.abajo);
  const total = arriba + abajo;
  const libreMinimo = Math.min(240, alto / 2);
  if (alto - total >= libreMinimo) return { arriba, abajo };
  const factor = total === 0 ? 0 : Math.max(0, (alto - libreMinimo) / total);
  return { arriba: Math.round(arriba * factor), abajo: Math.round(abajo * factor) };
}

/**
 * Cuantos pixeles hay que bajar el centro del mapa para que un punto quede en
 * el centro del hueco libre REAL entre cabecera y carrusel, y no en el centro de
 * la pantalla (que, con el carrusel mas alto que la cabecera, cae hacia el
 * carrusel, y en una pantalla baja debajo de el).
 *
 * Aqui no se escalan los margenes: el carrusel tapa lo que tapa aunque la
 * pantalla sea baja. Solo si el hueco real es casi nulo se usan los escalados,
 * porque no hay ningun sitio donde el punto quede a la vista.
 * Positivo = el punto se ve por encima del centro de la pantalla.
 */
export function desplazamientoCentroPx(altoPx: number, tapado: Huecos = HUECOS_POR_DEFECTO): number {
  const alto = noNegativo(altoPx);
  const arriba = noNegativo(tapado.arriba);
  const abajo = noNegativo(tapado.abajo);
  if (alto - arriba - abajo >= LIBRE_MINIMO_REAL_PX) return (abajo - arriba) / 2;
  const escalados = margenesEncuadre(alto, tapado);
  return (escalados.abajo - escalados.arriba) / 2;
}

/**
 * Lo que tapan cabecera y carrusel, a partir de sus ALTOS y de los margenes
 * seguros de la pantalla (notch, barra de gestos), nunca de su posicion.
 *
 * En web, onLayout solo se dispara cuando un elemento cambia de tamano, no
 * cuando se mueve. Al encoger la ventana el carrusel sube sin avisar, y una
 * cuenta hecha con su `y` se queda con la posicion vieja: el mapa creia que
 * abajo no habia nada y dejaba los pines debajo del carrusel.
 */
export function huecosDesdeMedidas(medidas: {
  altoSuperior: number;
  altoPie: number;
  margenSeguroArriba: number;
  margenSeguroAbajo: number;
  aire: number;
}): Huecos {
  const aire = noNegativo(medidas.aire);
  return {
    arriba: noNegativo(medidas.margenSeguroArriba) + noNegativo(medidas.altoSuperior) + aire,
    abajo: noNegativo(medidas.margenSeguroAbajo) + noNegativo(medidas.altoPie) + aire,
  };
}

/** Teselas de 256 px (dp en movil): lo usan Leaflet, Google Maps y OSM. */
const TAMANO_TESELA = 256;

/**
 * Latitud a la que hay que poner el centro del mapa, a un zoom dado, para que
 * `lat` se vea `desplazamientoPx` pixeles por encima del centro de la pantalla.
 *
 * Proyeccion Web Mercator exacta, la misma que usa Leaflet en web
 * (centroParaHueco), para que "ir a un bar" haga lo mismo en nativo. Se usa en
 * vez de un "delta de latitud que llena el alto": Google encaja el delta por el
 * lado que limite (en un movil vertical, el ancho) y la cuenta se quedaba corta.
 * Positivo = el centro va al sur (el punto sube en pantalla).
 */
export function latitudCentroDesplazado(lat: number, desplazamientoPx: number, zoom: number): number {
  const mundo = TAMANO_TESELA * 2 ** zoom;
  const phi = (lat * Math.PI) / 180;
  const y = (mundo / (2 * Math.PI)) * (Math.PI - Math.log(Math.tan(Math.PI / 4 + phi / 2)));
  const yCentro = y + desplazamientoPx;
  const phiCentro = 2 * Math.atan(Math.exp(Math.PI - (yCentro * 2 * Math.PI) / mundo)) - Math.PI / 2;
  return (phiCentro * 180) / Math.PI;
}

export type ControlEncuadre = {
  /** Se pidio encuadrar. true = hazlo ya; false = el mapa no tiene tamano y queda pendiente. */
  pedir(altoMapaPx: number): boolean;
  /** El mapa ha vuelto a tener tamano. true = hay un encuadre pendiente que hacer ahora. */
  recuperarTamano(): boolean;
  /** Estado de la medida de cabecera y carrusel. true = es la primera medida valida: encuadra una vez. */
  medir(hayMedidaValida: boolean): boolean;
};

/**
 * Cuando reencuadrar el mapa de la pestana Ruta sin tirar lo que el usuario
 * ha movido. Tres reglas, cada una por un fallo que llego a pasar:
 *
 * 1. Con el mapa oculto (pestana en display:none, 0 px) no se encuadra:
 *    Leaflet calcula con 0x0 y se va al zoom maximo. Queda pendiente y se hace
 *    al volver a tener tamano.
 * 2. Volver a tener tamano NO reencuadra si no habia nada pendiente: cambiar de
 *    pestana y volver respeta donde el usuario dejo el mapa.
 * 3. Las medidas de cabecera y carrusel solo provocan un encuadre la PRIMERA
 *    vez que son validas (llegan milisegundos tras montar, antes de que nadie
 *    toque el mapa). Despues solo afectan al siguiente encuadre: si no, un
 *    aviso de error que aparece, o la medida que se pierde al ocultar la
 *    pestana y vuelve al mostrarla, reencuadrarian bajo el dedo del usuario.
 */
export function crearControlEncuadre(): ControlEncuadre {
  let pendiente = false;
  let yaMedido = false;
  return {
    pedir(altoMapaPx) {
      if (!(altoMapaPx > 0)) {
        pendiente = true;
        return false;
      }
      pendiente = false;
      return true;
    },
    recuperarTamano() {
      return pendiente;
    },
    medir(hayMedidaValida) {
      if (!hayMedidaValida || yaMedido) return false;
      yaMedido = true;
      return true;
    },
  };
}

export type Encuadre =
  | { tipo: 'punto'; centro: Punto }
  | { tipo: 'limites'; limites: [[number, number], [number, number]] };

export function encuadreDe(puntos: readonly Punto[]): Encuadre | null {
  const validos = puntos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (validos.length === 0) return null;

  let sur = Infinity;
  let norte = -Infinity;
  let oeste = Infinity;
  let este = -Infinity;
  for (const { lat, lng } of validos) {
    sur = Math.min(sur, lat);
    norte = Math.max(norte, lat);
    oeste = Math.min(oeste, lng);
    este = Math.max(este, lng);
  }

  if (sur === norte && oeste === este) return { tipo: 'punto', centro: { lat: sur, lng: oeste } };
  return {
    tipo: 'limites',
    limites: [
      [sur, oeste],
      [norte, este],
    ],
  };
}
