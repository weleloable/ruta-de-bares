/**
 * Quien responde de los datos y a donde se escribe. **Todo esto son
 * PROVISIONALES**: falta decidir si el responsable es una persona a titulo
 * particular, una asociacion o los organizadores, y de esa decision sale
 * tambien el correo.
 *
 * Esta en un modulo aparte, y no escrito dentro de la pantalla, por una razon
 * concreta: cuando se decida hay que cambiarlo en UN sitio, y `PENDIENTE` hace
 * que la app lo diga en voz alta mientras tanto. Una politica de privacidad con
 * un hueco sin rellenar, publicada y en silencio, es peor que no tenerla: dice
 * cosas que nadie se ha comprometido a cumplir.
 *
 * Al rellenarlo: poner `PENDIENTE` a false, y entonces desaparece el aviso de
 * la pantalla. Lo vigila `tests/privacidad.test.ts`, que exige el aviso
 * mientras siga a true.
 */

/** Mientras sea true, la pantalla avisa de que esto no esta cerrado. */
export const PENDIENTE = true;

/** Quien decide que se hace con los datos (RGPD art. 4.7). */
export const RESPONSABLE = '[PENDIENTE: nombre del responsable del tratamiento]';

/**
 * El correo de privacidad. Tiene que atender tambien a quien NO usa la app:
 * alguien cuya cara aparezca en una foto puede reclamar sin tener cuenta, y el
 * art. 16 del DSA exige que cualquiera pueda avisar de contenido ilicito.
 */
export const CORREO_PRIVACIDAD = '[PENDIENTE: correo de privacidad]';

/** Dias que se conservan los datos de un evento antes de purgarlos. */
export const DIAS_CONSERVACION = 30;

/** La version del texto, para poder decir "aceptaste la del dia X". */
export const VERSION_POLITICA = '2026-09-20';
