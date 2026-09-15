/**
 * URL de la pagina de copyright de OpenStreetMap, para la atribucion.
 *
 * Modulo aparte y sin dependencias a proposito: la usa app/(tabs)/ruta.tsx, que
 * tambien se bundlea para el movil, y src/lib/mapaWeb.ts importa Leaflet, que
 * en nativo no puede cargarse.
 */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
