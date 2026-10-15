/**
 * A donde vuelve la persona al pulsar el enlace del correo de confirmacion
 * (pura, sin red ni window, para Node).
 *
 * Por que lleva el token de la invitacion DENTRO de la URL y no basta con el
 * pendiente guardado: ese vive en el localStorage del navegador donde se abrio
 * el enlace (el de Instagram, p. ej.), y el correo se abre en OTRO (Gmail, Chrome).
 * Cada navegador tiene su almacen, asi que alli no hay nada guardado y la
 * persona caia en la raiz de la app sin haberse unido a la ruta. Con el token en
 * la URL llega a /invitacion estando en el navegador que sea.
 *
 * Esta URL tiene que estar en Redirect URLs de Supabase Auth (docs/SETUP.md): si
 * no, Supabase la ignora y vuelve a la Site URL.
 */
const FORMA_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function urlConfirmacionWeb(origen: string, alcance: string, token: string | null): string {
  const raiz = `${origen.replace(/\/+$/, '')}${alcance.startsWith('/') ? alcance : `/${alcance}`}`;
  // Validado aqui y no solo al leerlo: acaba dentro de una URL que sale en un correo.
  if (token === null || !FORMA_TOKEN.test(token)) return raiz;
  return `${raiz.replace(/\/+$/, '')}/invitacion?token=${token}`;
}
