import type { NoticeAction, UserNoticeRow } from '../../types/database';

/**
 * Reglas puras de los avisos de moderacion: como se cuenta cada decision a la
 * persona a la que afecta.
 *
 * Por que existe esta pantalla: el Reglamento de Servicios Digitales (art. 17)
 * obliga a decirle a alguien QUE se ha decidido sobre su cuenta y POR QUE, en
 * cuanto se le restringe el servicio, y el art. 20 le da seis meses para
 * reclamar. El motivo lo escribe quien modera y se le ensena tal cual; la nota
 * interna del panel NO llega hasta aqui (no sale de match_moderation_log).
 */

export type TextoAviso = {
  /** El titular, en segunda persona: se le esta hablando a ella. */
  titulo: string;
  /** Que significa en la practica, para que no tenga que deducirlo. */
  explicacion: string;
  /** Las restrictivas se pintan en rojo; levantar un veto es una buena noticia. */
  restriccion: boolean;
};

const TEXTOS: Record<NoticeAction, TextoAviso> = {
  foto_retirada: {
    titulo: 'Se ha retirado tu foto de perfil',
    explicacion: 'Puedes subir otra cuando quieras.',
    restriccion: true,
  },
  cana_desactivada: {
    titulo: 'Se ha desactivado tu caña',
    explicacion: 'Ya no apareces en Tírate una caña, y no puedes volver a activarla hasta que se retire.',
    restriccion: true,
  },
  expulsada_de_ruta: {
    titulo: 'Te han expulsado de la ruta',
    explicacion:
      'Ya no ves esta ruta ni a su gente, y no puedes sellar en ella. Tu cuenta y tus sellos siguen ahí.',
    restriccion: true,
  },
  cuenta_suspendida: {
    titulo: 'Tu cuenta está suspendida',
    explicacion:
      'Estás fuera de todas las rutas. Tu cuenta no se ha borrado: puedes leer esto, reclamar, y descargar o borrar tus datos.',
    restriccion: true,
  },
  cana_reactivada: {
    titulo: 'Puedes volver a activar tu caña',
    explicacion: 'Se ha retirado la restricción. Activarla otra vez es cosa tuya: no se enciende sola.',
    restriccion: false,
  },
  veto_de_ruta_retirado: {
    titulo: 'Puedes volver a entrar en la ruta',
    explicacion: 'Se ha retirado la restricción, pero necesitas que te vuelvan a invitar.',
    restriccion: false,
  },
  cuenta_reactivada: {
    titulo: 'Tu cuenta vuelve a estar activa',
    explicacion: 'Necesitas que te inviten otra vez a las rutas en las que estabas.',
    restriccion: false,
  },
};

export function textoAviso(accion: NoticeAction): TextoAviso {
  return (
    TEXTOS[accion] ?? {
      titulo: 'Una decisión sobre tu cuenta',
      explicacion: '',
      restriccion: true,
    }
  );
}

/**
 * A quien dirigirse para reclamar. Va en toda restriccion porque el aviso sin
 * via de reclamacion no cumple el art. 17: no es un comunicado, es el principio
 * de un procedimiento.
 */
export const COMO_RECLAMAR = 'Si crees que es un error, habla con quien organiza la ruta.';

/** Los sin leer, que es lo que enciende la burbujita. */
export function sinLeer(avisos: readonly UserNoticeRow[]): number {
  return avisos.filter((a) => a.read_at === null).length;
}

/**
 * La fecha, larga y con hora: en un aviso de este tipo importa poder decir
 * "me lo comunicasteis el dia X".
 */
export function cuando(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const dia = fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${dia} a las ${hora}`;
}
