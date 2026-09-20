import { useEffect, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { crearCacheFirmas, FIRMA_SEGUNDOS, rutaDesdeUrlPublica } from './avatarUrl';

/**
 * La URL con la que se pinta una foto de perfil, ya firmada (0023).
 *
 * El bucket `avatars` es privado: la URL que hay guardada en
 * `profiles.avatar_url` no descarga nada, es un identificador del que se saca
 * la ruta (`rutaDesdeUrlPublica`) para pedirle a Storage una URL firmada de 15
 * minutos. Firmar pasa por la policy `avatars_read`, asi que quien decide si
 * puedes ver esa cara es Postgres.
 *
 * Todo pasa por aqui y no por cada pantalla a proposito: la misma cara se pinta
 * en la cuadricula, la ficha, la lista de chats y la cabecera del chat. La
 * cache (10 min) y el registro de peticiones en vuelo hacen que se firme UNA
 * vez aunque se monten cuatro componentes a la vez.
 */

const AVATAR_BUCKET = 'avatars';

const cache = crearCacheFirmas();
/**
 * Lo que se esta firmando ahora mismo, por ruta. Sin esto, montar la
 * cuadricula pide una firma por tarjeta aunque varias sean de la misma persona,
 * porque ninguna ha llegado a guardarse en la cache todavia.
 */
const enVuelo = new Map<string, Promise<string | null>>();

/**
 * Firma la ruta, o devuelve null si no se puede (sin permiso, sin red, o la URL
 * guardada no tiene la forma esperada). Null no es un error que haya que
 * ensenar: la pantalla pinta las iniciales, como cuando no hay foto.
 */
export async function urlDeAvatar(urlGuardada: string | null | undefined): Promise<string | null> {
  return firmarRuta(rutaDesdeUrlPublica(urlGuardada));
}

/**
 * Igual, pero partiendo de la ruta dentro del bucket. La usa la pantalla de
 * revision del admin, que trabaja con `foto_path` y `thumb_path` (una foto
 * pendiente todavia no tiene URL en ningun perfil).
 */
export async function firmarRuta(ruta: string | null | undefined): Promise<string | null> {
  if (!ruta) return null;

  const guardada = cache.leer(ruta);
  if (guardada) return guardada;

  const yaVa = enVuelo.get(ruta);
  if (yaVa) return yaVa;

  const peticion = (async () => {
    try {
      const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(ruta, FIRMA_SEGUNDOS);
      if (error || !data?.signedUrl) return null;
      cache.guardar(ruta, data.signedUrl);
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      enVuelo.delete(ruta);
    }
  })();
  enVuelo.set(ruta, peticion);
  return peticion;
}

/**
 * Al cerrar sesion o cambiar de persona: una firma es una llave temporal a una
 * foto concreta, concedida a QUIEN la pidio. La siguiente persona que entre en
 * este movil no tiene por que heredarlas.
 */
export function olvidarFirmasDeAvatar(): void {
  cache.vaciar();
  enVuelo.clear();
}

/**
 * La misma en forma de hook, que es como la usan los componentes.
 *
 * Devuelve null mientras firma. Los componentes ya saben pintar iniciales sin
 * foto, asi que no hace falta un estado de carga: la cara aparece cuando llega.
 */
export function useAvatarFirmado(urlGuardada: string | null | undefined): string | null {
  return useFirma(urlGuardada, urlDeAvatar);
}

/** La variante por ruta, para la pantalla de revision del admin. */
export function useRutaFirmada(ruta: string | null | undefined): string | null {
  return useFirma(ruta, firmarRuta);
}

function useFirma(
  clave: string | null | undefined,
  firmar: (clave: string | null | undefined) => Promise<string | null>,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!clave) {
      setUrl(null);
      return () => {
        vivo = false;
      };
    }
    void firmar(clave).then((firmada) => {
      if (vivo) setUrl(firmada);
    });
    return () => {
      vivo = false;
    };
    // `firmar` es una funcion de modulo, estable entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return url;
}
