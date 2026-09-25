import { toBlob } from 'html-to-image';

import { DIPLOMA_ALTO, DIPLOMA_ANCHO, DIPLOMA_PIXEL_RATIO } from './textoDiploma';

/**
 * Exporta el diploma en la web (y en la PWA del movil): html-to-image recorre el
 * nodo, incrusta las imagenes (teselas de OpenStreetMap, la foto firmada de
 * perfil, la chapa) y lo pinta en un canvas. A x3 sale 1080 x 1920, el vertical
 * de una story de Instagram.
 *
 * `nodo` es el <div> que RN web le da a la View del diploma. Se captura ESE
 * nodo y no el contenedor escalado de la pantalla, o saldria con el zoom de la
 * vista previa.
 */
export const PUEDE_EXPORTAR = true;

export async function diplomaABlob(nodo: unknown): Promise<Blob> {
  const elemento = nodo as HTMLElement | null;
  if (!elemento || typeof elemento.getBoundingClientRect !== 'function') {
    throw new Error('El diploma todavia no esta listo. Prueba otra vez.');
  }
  const blob = await toBlob(elemento, {
    pixelRatio: DIPLOMA_PIXEL_RATIO,
    width: DIPLOMA_ANCHO,
    height: DIPLOMA_ALTO,
    cacheBust: false,
    // Sin esto, un transform heredado del elemento o un margen se cuelan en el PNG.
    style: { transform: 'none', margin: '0' },
  });
  if (!blob) throw new Error('No se pudo generar la imagen del diploma.');
  return blob;
}

type NavegadorConShare = Navigator & { canShare?: (d: ShareData) => boolean };

/**
 * Si el navegador puede compartir un FICHERO con la hoja del sistema (en el
 * movil, con Instagram entre las apps). Se pregunta con un fichero de mentira
 * porque canShare depende del tipo.
 */
export function puedeCompartirFicheros(): boolean {
  const nav = navigator as NavegadorConShare;
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/** Abre la hoja de compartir con la imagen. Si la persona la cierra no es un error. */
export async function compartirImagen(blob: Blob, nombre: string): Promise<void> {
  const fichero = new File([blob], nombre, { type: 'image/png' });
  try {
    await (navigator as NavegadorConShare).share({ files: [fichero], title: 'Mi diploma de Ruta de Bares' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    throw new Error('No se pudo abrir el menu de compartir. Prueba a guardar la imagen.');
  }
}

/**
 * Descarga el PNG. Va aparte de compartir: en escritorio la hoja de compartir
 * del sistema no siempre existe o no deja guardar, y quien lo quiere es el fichero.
 */
export function descargarImagen(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * El boton Story solo tiene sentido en un movil (o tablet): Instagram no se abre
 * desde un ordenador. Se detecta por el navegador y no por el ancho.
 */
export function puedeStory(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se hace pasar por Mac: se distingue por la pantalla tactil.
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Copia texto al portapapeles. Devuelve false si el navegador no deja (no es un error). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre la camara de historias de Instagram. Es lo mas cerca que llega una web:
 * Instagram solo acepta una imagen directa desde una app nativa registrada con
 * Facebook (su API "Sharing to Stories"), no desde un navegador. Si Instagram no
 * esta instalado no pasa nada.
 */
export function abrirCamaraDeStories(): void {
  window.location.href = 'instagram://story-camera';
}
