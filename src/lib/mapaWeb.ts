import 'leaflet/dist/leaflet.css';

import * as L from 'leaflet';

import { OSM_COPYRIGHT_URL } from './osm';
import { colors } from './theme';

/**
 * Piezas comunes de los mapas web: Leaflet con teselas de OpenStreetMap.
 *
 * SOLO se importa desde archivos .web.tsx (lo vigila tests/leaflet-solo-web.test.ts).
 * Leaflet toca `window` al cargarse y en el movil no hay `window`: importarlo
 * desde codigo nativo tumbaria la app. Si algun dia hace falta algo de aqui en
 * nativo, se saca a un modulo sin leaflet, como src/lib/encuadre.ts.
 */

/**
 * Teselas estandar de OpenStreetMap: gratis y sin clave. Condiciones de uso
 * (atribucion visible, trafico moderado):
 * https://operations.osmfoundation.org/policies/tiles/
 */
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_MAX_ZOOM = 19;
export const OSM_ATRIBUCION = `&copy; <a href="${OSM_COPYRIGHT_URL}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>`;

const ESTILOS_ID = 'rb-mapa-estilos';

/**
 * Tono papel sobre las teselas para que el mapa no desentone con la app (en
 * nativo lo hace mapStyle de Google). Se inyecta una sola vez por documento.
 */
export function asegurarEstilosMapa(): void {
  if (typeof document === 'undefined' || document.getElementById(ESTILOS_ID)) return;
  const estilo = document.createElement('style');
  estilo.id = ESTILOS_ID;
  estilo.textContent = `
    .rb-mapa { background: ${colors.paperDeep}; font-family: inherit; }
    .rb-mapa .leaflet-tile-pane { filter: sepia(0.25) saturate(0.85) brightness(1.03); }
    .rb-pin { background: transparent; border: none; }
  `;
  document.head.appendChild(estilo);
}

/**
 * Pin numerado de una parada, igual que el de react-native-maps.
 * En el HTML solo entra un entero: nunca texto escrito por un usuario (el
 * nombre del bar va en el Popup, que React escapa).
 */
export function iconoParada(numero: number, sellado: boolean, activo: boolean): L.DivIcon {
  const n = Math.trunc(numero);
  const tam = activo ? 40 : 34;
  const fondo = sellado ? colors.stamp : colors.card;
  const borde = activo ? colors.ink : sellado ? colors.stamp : colors.borderStrong;
  const tinta = sellado ? colors.white : colors.ink;
  return L.divIcon({
    className: 'rb-pin',
    html:
      `<div style="width:${tam}px;height:${tam}px;box-sizing:border-box;border-radius:999px;` +
      `background:${fondo};border:${activo ? 3 : 2}px solid ${borde};color:${tinta};` +
      `display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;` +
      `box-shadow:0 2px 6px rgba(36,26,18,0.35)">${n}</div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    popupAnchor: [0, -tam / 2],
  });
}

/**
 * Marca de la posicion del bar en el editor. Un circulo anclado en su centro,
 * no una gota: el centro es el punto exacto de la geocerca, y con una gota hay
 * que adivinar donde cae la punta.
 */
export const ICONO_POSICION = L.divIcon({
  className: 'rb-pin',
  html:
    `<div style="width:22px;height:22px;box-sizing:border-box;border-radius:999px;` +
    `background:${colors.stamp};border:3px solid ${colors.white};` +
    `box-shadow:0 0 0 2px ${colors.stamp},0 2px 6px rgba(0,0,0,0.35)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** Punto azul de "estas aqui". */
export const ICONO_YO = L.divIcon({
  className: 'rb-pin',
  html:
    `<div style="width:16px;height:16px;box-sizing:border-box;border-radius:999px;` +
    `background:#2F6FEB;border:3px solid #FFFFFF;box-shadow:0 0 0 6px rgba(47,111,235,0.2)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/**
 * El mundo una sola vez. Sin limites, Leaflet repite el mapa en horizontal y un
 * toque en una copia da longitudes como -363.7: se guarda bien normalizada,
 * pero el pin se pinta en la copia original, fuera de la vista.
 */
export const LIMITES_MUNDO: L.LatLngBoundsExpression = [
  [-85, -180],
  [85, 180],
];

/**
 * Leaflet mide su contenedor al montar. Si luego cambia de tamano (teclado,
 * girar el movil, o una pestana que se oculta con display:none y vuelve), el
 * mapa sale gris o cortado hasta que se le avisa.
 *
 * `alCambiarVisibilidad` se llama en cada transicion entre tener alto y no
 * tenerlo (ocultar y volver a la pestana): al volver es cuando se puede
 * encuadrar lo que se pidio mientras estaba oculto, y al ocultarse es cuando
 * hay que soltar lo que gasta (el GPS).
 */
export function observarTamano(
  mapa: L.Map,
  alCambiarVisibilidad?: (tieneTamano: boolean) => void,
): () => void {
  const contenedor = mapa.getContainer();
  let teniaTamano = contenedor.clientHeight > 0;
  const observador = new ResizeObserver(() => {
    mapa.invalidateSize();
    const tieneTamano = contenedor.clientHeight > 0;
    if (tieneTamano !== teniaTamano) alCambiarVisibilidad?.(tieneTamano);
    teniaTamano = tieneTamano;
  });
  observador.observe(contenedor);
  return () => observador.disconnect();
}

/**
 * Centro que hay que dar al mapa para que (lat, lng) quede en el hueco libre
 * entre cabecera y carrusel a ese zoom (ver desplazamientoCentroPx).
 */
export function centroParaHueco(mapa: L.Map, lat: number, lng: number, zoom: number, desplazamientoPx: number): L.LatLng {
  const enPixeles = mapa.project([lat, lng], zoom).add([0, desplazamientoPx]);
  return mapa.unproject(enPixeles, zoom);
}
