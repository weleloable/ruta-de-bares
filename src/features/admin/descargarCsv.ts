import { Share } from 'react-native';

/**
 * Entregar el CSV de la ruta. Aqui, la version nativa: se abre la hoja de
 * compartir del sistema con el texto (guardar un fichero en el movil pide un
 * modulo nativo mas). La de verdad es descargarCsv.web.ts, que Metro elige al
 * bundlear para web (la PWA del movil entra por ahi).
 */
export async function descargarCsv(nombre: string, contenido: string): Promise<void> {
  await Share.share({ title: nombre, message: contenido });
}
