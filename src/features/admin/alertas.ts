import type {
  MatchAdminReportRow,
  MatchAdminTicketRow,
  MatchReportReason,
  MatchReportResolution,
  MatchReportStatus,
} from '../../types/database';

/**
 * Reglas puras de "Alertas de administracion": convertir lo que devuelve el
 * servidor en tickets, filtrarlos y decidir que se puede hacer con cada uno.
 *
 * Por que una capa propia y no pintar las denuncias tal cual: la seccion nace
 * para las denuncias de Tirate una cana, pero esta pensada para que quepa lo
 * siguiente (invitaciones agotadas, una ruta sin publicar el dia del evento...).
 * La pantalla habla de ALERTAS y no sabe de match_reports; para anadir otra
 * fuente solo hay que anadir un `tipo` y su funcion de conversion aqui.
 *
 * Nada de esto es autoridad: quien decide si puedes ver o tocar una denuncia es
 * `match_admin_require()` en Postgres (0009). Aqui solo se decide que pintar.
 */

export type TipoAlerta = 'denuncia_cana';

/** Mismos estados que `match_reports.status`: el ticket ES la denuncia. */
export type EstadoAlerta = MatchReportStatus;

export type Alerta = {
  id: string;
  tipo: TipoAlerta;
  estado: EstadoAlerta;
  /** Lo gordo de la primera linea: "Acoso o insultos". */
  titulo: string;
  /** A quien afecta. */
  sobre: string;
  /** Quien avisa. */
  de: string;
  cuando: string;
  mensajes: number;
  resolucion: MatchReportResolution | null;
};

/**
 * Los motivos, dichos para quien modera y no para quien denuncia: en la caña
 * pone "La foto" porque se habla de la tuya; aqui hace falta el nombre del
 * problema.
 */
const MOTIVO: Record<MatchReportReason, string> = {
  foto: 'La foto',
  acoso: 'Acoso o insultos',
  suplantacion: 'Suplantación de identidad',
  menor: 'Posible menor de edad',
  otro: 'Otra cosa',
};

export function etiquetaMotivo(motivo: MatchReportReason): string {
  return MOTIVO[motivo] ?? 'Otra cosa';
}

const RESOLUCION: Record<MatchReportResolution, string> = {
  sin_accion: 'Sin acción',
  foto_retirada: 'Foto retirada',
  cana_desactivada: 'Caña desactivada',
  expulsada_de_ruta: 'Expulsada de la ruta',
  otra: 'Otra',
};

export function etiquetaResolucion(resolucion: MatchReportResolution | null): string {
  return resolucion ? RESOLUCION[resolucion] : '';
}

/**
 * Las formas de cerrar una denuncia, de menos a mas grave. El orden importa:
 * es el que se ofrece y el que decide cual se propone sola.
 */
export const RESOLUCIONES: readonly { id: MatchReportResolution; etiqueta: string; ayuda: string }[] = [
  { id: 'sin_accion', etiqueta: 'Sin acción', ayuda: 'Revisada y no había nada que hacer' },
  { id: 'foto_retirada', etiqueta: 'Foto retirada', ayuda: 'Le he quitado la foto de perfil' },
  { id: 'cana_desactivada', etiqueta: 'Caña desactivada', ayuda: 'Ya no aparece en Tírate una caña' },
  { id: 'expulsada_de_ruta', etiqueta: 'Expulsada de la ruta', ayuda: 'Fuera de esta ruta, sin borrar su cuenta' },
  { id: 'otra', etiqueta: 'Otra', ayuda: 'Cuéntalo en la nota' },
];

export const ESTADOS: Record<EstadoAlerta, { etiqueta: string; tono: 'aviso' | 'curso' | 'hecho' }> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'aviso' },
  en_revision: { etiqueta: 'En revisión', tono: 'curso' },
  resuelta: { etiqueta: 'Resuelta', tono: 'hecho' },
};

/** Una denuncia de Tirate una cana, vista como alerta. */
export function alertaDeDenuncia(fila: MatchAdminReportRow): Alerta {
  return {
    id: fila.id,
    tipo: 'denuncia_cana',
    estado: fila.status,
    titulo: etiquetaMotivo(fila.reason),
    sobre: fila.reported_name,
    de: fila.reporter_name,
    cuando: fila.created_at,
    mensajes: fila.mensajes,
    resolucion: fila.resolution,
  };
}

export type FiltroAlerta = 'abiertas' | 'pendiente' | 'en_revision' | 'resuelta';

export const FILTROS: readonly { id: FiltroAlerta; etiqueta: string }[] = [
  { id: 'abiertas', etiqueta: 'Sin cerrar' },
  { id: 'pendiente', etiqueta: 'Pendientes' },
  { id: 'en_revision', etiqueta: 'En revisión' },
  { id: 'resuelta', etiqueta: 'Resueltas' },
];

export function filtrarAlertas(alertas: readonly Alerta[], filtro: FiltroAlerta): Alerta[] {
  if (filtro === 'abiertas') return alertas.filter((a) => a.estado !== 'resuelta');
  return alertas.filter((a) => a.estado === filtro);
}

/** Cuantas hay en cada chip, para pintar el numero al lado. */
export function cuentaPorFiltro(alertas: readonly Alerta[]): Record<FiltroAlerta, number> {
  return {
    abiertas: filtrarAlertas(alertas, 'abiertas').length,
    pendiente: filtrarAlertas(alertas, 'pendiente').length,
    en_revision: filtrarAlertas(alertas, 'en_revision').length,
    resuelta: filtrarAlertas(alertas, 'resuelta').length,
  };
}

/**
 * Lo que queda por hacer, primero y de mas vieja a mas nueva: la que lleva mas
 * tiempo sin respuesta es la urgente (el DSA mide lo que tardas). Lo ya cerrado
 * va al final y al reves, porque ahi lo que se busca es lo ultimo que paso.
 */
export function ordenarAlertas(alertas: readonly Alerta[]): Alerta[] {
  const abiertas = alertas.filter((a) => a.estado !== 'resuelta').sort((x, y) => x.cuando.localeCompare(y.cuando));
  const cerradas = alertas.filter((a) => a.estado === 'resuelta').sort((x, y) => y.cuando.localeCompare(x.cuando));
  return [...abiertas, ...cerradas];
}

/**
 * "hace 2 h". Se prefiere a la hora exacta porque lo que importa al abrir la
 * bandeja es cuanto lleva esperando, no cuando fue.
 */
export function hace(iso: string, ahora: Date): string {
  const minutos = Math.floor((ahora.getTime() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutos)) return '';
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

/**
 * Que acciones tiene sentido ofrecer sobre un ticket. Retirar una foto que ya
 * no esta, desactivar una cana ya apagada o expulsar a quien ya no esta en la
 * ruta solo sirve para ensuciar el registro de moderacion con apuntes que no
 * hicieron nada.
 */
export function accionesTicket(ticket: MatchAdminTicketRow): {
  puedeRetirarFoto: boolean;
  puedeDesactivar: boolean;
  puedeExpulsar: boolean;
  puedeResolver: boolean;
} {
  const cerrada = ticket.status === 'resuelta';
  return {
    puedeRetirarFoto: !cerrada && ticket.reported_avatar_url !== null,
    puedeDesactivar: !cerrada && ticket.reported_active,
    // A un admin no se le expulsa desde aqui: el servidor lo rechaza
    // (TARGET_IS_ADMIN, 0014) y ofrecerlo seria mentir.
    puedeExpulsar: !cerrada && ticket.reported_in_route && !ticket.reported_is_admin,
    puedeResolver: !cerrada,
  };
}

/**
 * La resolucion que se propone sola al abrir el desplegable, segun lo que ya se
 * haya hecho: asi cerrar no obliga a repetir a mano lo que el registro ya sabe.
 * Manda la medida mas grave de las tomadas.
 */
export function resolucionSugerida(
  ticket: MatchAdminTicketRow,
  hechas: readonly MatchReportResolution[],
): MatchReportResolution {
  if (hechas.includes('expulsada_de_ruta')) return 'expulsada_de_ruta';
  if (hechas.includes('cana_desactivada')) return 'cana_desactivada';
  if (hechas.includes('foto_retirada')) return 'foto_retirada';
  return ticket.reason === 'otro' ? 'otra' : 'sin_accion';
}
