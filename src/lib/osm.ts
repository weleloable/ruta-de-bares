/**
 * URL de la pagina de copyright de OpenStreetMap, para la atribucion.
 *
 * Modulo aparte y sin dependencias a proposito: src/lib/mapaWeb.ts importa
 * Leaflet, que en nativo no puede cargarse, y esta URL no tiene por que
 * arrastrarlo. (La cabecera de Ruta ya no enlaza aqui: ver ruta.tsx.)
 */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
