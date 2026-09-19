/**
 * Que cuenta como "notificacion" para el punto rojo del boton de Mi perfil.
 *
 * Solo la cuenta, sin imports (como reglas.ts de la cana): la consulta a cada
 * fuente vive en Notificaciones.tsx y aqui se decide que hacer con los numeros,
 * que es lo que se prueba.
 *
 * Fuentes, todas ya existentes y con su propia pantalla:
 *  - cana:    conversaciones de Tirate una cana que piden atencion.
 *  - avisos:  decisiones de moderacion sin leer (art. 17 del DSA).
 *  - alertas: solo admins: denuncias sin cerrar y fotos de perfil por aprobar.
 *
 * NO cuenta la foto rechazada de Mi perfil: no tiene estado "leida", asi que el
 * punto no se apagaria nunca hasta subir otra foto.
 */
export type FuentesNotificacion = {
  cana: number;
  avisos: number;
  alertas: number;
};

/** Un contador roto (NaN, negativo, decimal) cuenta como 0: un punto rojo falso no se apaga solo. */
function entero(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function totalNotificaciones(fuentes: FuentesNotificacion): number {
  return entero(fuentes.cana) + entero(fuentes.avisos) + entero(fuentes.alertas);
}

export function hayNotificaciones(fuentes: FuentesNotificacion): boolean {
  return totalNotificaciones(fuentes) > 0;
}

/** El nombre accesible del boton de Mi perfil: el punto es solo visual, esto se lo dice al lector de pantalla. */
export function etiquetaBotonPerfil(fuentes: FuentesNotificacion): string {
  const total = totalNotificaciones(fuentes);
  if (total === 0) return 'Mi perfil';
  return total === 1 ? 'Mi perfil, 1 notificación' : `Mi perfil, ${total} notificaciones`;
}
