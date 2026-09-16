/**
 * Catalogo de GIFs de Tirate una cana (D13): van dentro de la app y el chat
 * solo guarda el id. La lista de ids tiene que coincidir con la tabla
 * match_gifs de la migracion; lo comprueba tests/match-gifs.test.ts.
 *
 * PROVISIONALES: dibujados para el prototipo con la paleta de la app, sin
 * derechos de terceros. Al cambiarlos por los definitivos, mismo id o una
 * migracion nueva que actualice match_gifs.
 */
export type GifCatalogo = { id: string; etiqueta: string; fuente: number };

export const GIFS: readonly GifCatalogo[] = [
  { id: 'salud', etiqueta: '¡Salud!', fuente: require('../../../assets/gifs/salud.gif') },
  { id: 'chin-chin', etiqueta: 'Chin chin', fuente: require('../../../assets/gifs/chin-chin.gif') },
  { id: 'otra-ronda', etiqueta: '¿Otra ronda?', fuente: require('../../../assets/gifs/otra-ronda.gif') },
  { id: 'espuma', etiqueta: 'Espuma', fuente: require('../../../assets/gifs/espuma.gif') },
  { id: 'te-invito', etiqueta: 'Te invito', fuente: require('../../../assets/gifs/te-invito.gif') },
  { id: 'guino', etiqueta: 'Guiño', fuente: require('../../../assets/gifs/guino.gif') },
  { id: 'bailecito', etiqueta: 'Bailecito', fuente: require('../../../assets/gifs/bailecito.gif') },
  { id: 'burbujas', etiqueta: 'Burbujas', fuente: require('../../../assets/gifs/burbujas.gif') },
];

const POR_ID = new Map(GIFS.map((gif) => [gif.id, gif]));

/** null si el servidor manda un id que esta version de la app no conoce. */
export function gifPorId(id: string | null): GifCatalogo | null {
  return id ? (POR_ID.get(id) ?? null) : null;
}
