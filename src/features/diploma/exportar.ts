/**
 * Convertir el diploma en imagen y compartirla o guardarla. Aqui, la version
 * nativa: todavia no. Sacar una captura de una View en movil pide un modulo
 * nativo mas (react-native-view-shot) y compartir el fichero otro (expo-sharing),
 * es decir, otro development build; mientras tanto el diploma se VE en el movil
 * pero los botones de compartir no salen. La de verdad es exportar.web.ts, que
 * Metro elige al bundlear para web (la PWA del movil entra por ahi).
 */
export const PUEDE_EXPORTAR = false;

export async function diplomaABlob(_nodo: unknown): Promise<Blob> {
  throw new Error('Exportar el diploma aun no esta disponible en la app nativa.');
}

export function puedeCompartirFicheros(): boolean {
  return false;
}

export async function compartirImagen(_blob: Blob, _nombre: string): Promise<void> {
  throw new Error('Compartir el diploma aun no esta disponible en la app nativa.');
}

export function descargarImagen(_blob: Blob, _nombre: string): void {
  throw new Error('Guardar el diploma aun no esta disponible en la app nativa.');
}

export function puedeStory(): boolean {
  return false;
}

export async function copiarTexto(_texto: string): Promise<boolean> {
  return false;
}

export function abrirCamaraDeStories(): void {
  throw new Error('Las historias de Instagram aun no estan disponibles en la app nativa.');
}
