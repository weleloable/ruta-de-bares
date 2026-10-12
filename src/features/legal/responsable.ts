/**
 * Quien responde de los datos y a donde se escribe. Cerrado el 2026-10-11: el
 * responsable es una persona a titulo particular, y su correo es tambien el de
 * contacto que se ensena en la pantalla de entrada.
 *
 * Esta en un modulo aparte, y no escrito dentro de las pantallas, por una razon
 * concreta: si cambia, se cambia en UN sitio (la politica de la app, la pagina
 * estatica de la web y el enlace de contacto de la entrada leen de aqui).
 *
 * `PENDIENTE` existe para el caso contrario: si alguna vez vuelve a quedar un
 * hueco, ponerlo a true hace que la politica lo diga en voz alta ("Borrador")
 * en vez de publicar en silencio algo que nadie se ha comprometido a cumplir.
 * Lo vigila `tests/privacidad.test.ts`: con false, exige que no quede ningun
 * hueco sin rellenar.
 */

/** Mientras sea true, la pantalla avisa de que esto no esta cerrado. */
export const PENDIENTE = false;

/** Quien decide que se hace con los datos (RGPD art. 4.7). */
export const RESPONSABLE = 'Eduardo Almarza Mayoral';

/**
 * El correo de privacidad. Tiene que atender tambien a quien NO usa la app:
 * alguien cuya cara aparezca en una foto puede reclamar sin tener cuenta, y el
 * art. 16 del DSA exige que cualquiera pueda avisar de contenido ilicito.
 */
export const CORREO_PRIVACIDAD = 'jrdvag@gmail.com';

/** Dias que se conservan los datos de un evento antes de purgarlos. */
export const DIAS_CONSERVACION = 30;

/** La version del texto, para poder decir "aceptaste la del dia X". */
export const VERSION_POLITICA = '2026-10-12';
