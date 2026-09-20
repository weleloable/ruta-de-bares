/**
 * De la URL guardada en `profiles.avatar_url` a la ruta dentro del bucket, y
 * cache de las URL firmadas. Piezas puras, sin red, para poder probarlas en
 * Node (como imagenes.ts y fotoRevision.ts).
 *
 * Por que hace falta esto. El bucket `avatars` pasa a ser PRIVADO: hasta ahora
 * cualquiera con el enlace veia la cara de cualquiera sin sesion y sin clave, y
 * la cuadricula de la cana repartia esos enlaces a toda la ruta. Con el bucket
 * privado, la foto se pide con una URL FIRMADA de vida corta, y firmarla exige
 * saber la ruta (`<uid>/<fichero>.jpg`), no la URL.
 *
 * Lo que NO se ha cambiado, a proposito: en `profiles.avatar_url` se sigue
 * guardando la URL con forma `.../object/public/avatars/<ruta>`, que ya no
 * sirve para descargar nada. Es un identificador, no un enlace. Cambiar el
 * formato obligaria a tocar la validacion de `avatar_admin_decide` (0020) y a
 * migrar las filas existentes; se deja para cuando compense, y este modulo es
 * el UNICO sitio que conoce ese formato.
 */

/** Lo que Storage antepone a la ruta en una URL publica. */
const MARCA = '/storage/v1/object/public/avatars/';

/**
 * La ruta dentro del bucket a partir de lo guardado, o null si no reconoce la
 * forma. Devolver null y no tirar: una fila vieja o rara deja a la persona con
 * sus iniciales, que es feo pero no rompe la pantalla.
 */
export function rutaDesdeUrlPublica(url: string | null | undefined): string | null {
  if (!url) return null;
  const corte = url.indexOf(MARCA);
  if (corte < 0) return null;
  const ruta = url.slice(corte + MARCA.length);
  // Sin query ni fragmento: una URL firmada vieja guardada por error no debe
  // colarse como ruta.
  const limpia = ruta.split('?')[0]?.split('#')[0] ?? '';
  // La forma que exige avatar_request_submit: `<uid>/<fichero>`, un solo nivel.
  return /^[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]{1,120}$/.test(limpia) ? limpia : null;
}

/** Cuanto vive una URL firmada. */
export const FIRMA_SEGUNDOS = 900;

/**
 * Cuanto se guarda en la cache: menos que la firma, para no servir nunca una a
 * punto de caducar. Con 900 y 600, lo que se entrega tiene al menos 5 minutos
 * por delante, de sobra para que la imagen cargue.
 */
export const CACHE_MS = 600_000;

type Entrada = { url: string; caduca: number };

/**
 * Cache de firmas en memoria del proceso.
 *
 * Existe porque la misma cara se pinta muchas veces: la cuadricula, la ficha,
 * la lista de chats y la cabecera del chat ensenan a la misma persona. Sin
 * cache, cada monte de cada componente firmaria otra vez, y firmar es una
 * peticion de red.
 *
 * En memoria y no en `localStorage` a proposito: una URL firmada es una llave
 * temporal a una foto, y no tiene por que sobrevivir a cerrar la pestana.
 */
export function crearCacheFirmas(ahora: () => number = Date.now) {
  const entradas = new Map<string, Entrada>();
  return {
    leer(ruta: string): string | null {
      const entrada = entradas.get(ruta);
      if (!entrada) return null;
      if (entrada.caduca <= ahora()) {
        entradas.delete(ruta);
        return null;
      }
      return entrada.url;
    },
    guardar(ruta: string, url: string): void {
      entradas.set(ruta, { url, caduca: ahora() + CACHE_MS });
    },
    /** Al cerrar sesion: las firmas son de esa persona y no valen para la siguiente. */
    vaciar(): void {
      entradas.clear();
    },
    get tamano(): number {
      return entradas.size;
    },
  };
}

export type CacheFirmas = ReturnType<typeof crearCacheFirmas>;
