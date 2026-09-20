import type { ModeracionRow } from '../../types/database';

/**
 * Reglas puras de la pantalla de moderacion: juntar por persona lo que el
 * servidor devuelve suelto.
 *
 * Por que existe la pantalla: un veto solo se podia retirar desde el ticket de
 * la denuncia que lo origino, y ese ticket puede estar cerrado hace meses o
 * haber desaparecido con la cuenta. El art. 20 del DSA da seis meses para
 * reclamar, asi que tiene que haber SIEMPRE un sitio desde el que deshacer una
 * sancion.
 *
 * Y no solo vetos: quien organiza tiene que ver a quien se le ha tocado algo
 * -- una foto retirada, una cana apagada -- aunque ya no quede nada vigente.
 */

export type VetoRuta = { routeId: string; routeName: string; motivo: string; cuando: string };

export type Moderacion = {
  /** El id, o el nombre guardado si esa persona se borro la cuenta. */
  clave: string;
  nombre: string;
  /** null = cuenta borrada: se puede retirar su veto de ruta, nada mas. */
  userId: string | null;
  suspension: { motivo: string; cuando: string } | null;
  vetoCana: { motivo: string; cuando: string } | null;
  vetosRuta: VetoRuta[];
  historial: { accion: string; nota: string; cuando: string }[];
  /** Lo mas reciente de todo, que es por lo que se ordena la lista. */
  ultima: string;
};

const ACCION: Record<string, string> = {
  foto_retirada: 'Foto retirada',
  cana_desactivada: 'La Caña desactivada',
  expulsada_de_ruta: 'Expulsada de la ruta',
  cuenta_suspendida: 'Cuenta suspendida',
  veto_retirado: 'Veto retirado',
};

export function etiquetaAccion(accion: string): string {
  return ACCION[accion] ?? accion;
}

/** Cuantas personas tienen algo vigente, que es lo que urge mirar. */
export function conAlgoVigente(moderaciones: readonly Moderacion[]): Moderacion[] {
  return moderaciones.filter(
    (m) => m.suspension !== null || m.vetoCana !== null || m.vetosRuta.length > 0,
  );
}

/**
 * Una entrada por persona. Se agrupa por id, y por nombre cuando ya no hay id:
 * asi quien borro su cuenta sigue saliendo en una sola fila y no en cuatro.
 */
export function agruparModeraciones(filas: readonly ModeracionRow[]): Moderacion[] {
  const porClave = new Map<string, Moderacion>();

  for (const fila of filas) {
    const clave = fila.user_id ?? `nombre:${fila.user_name}`;
    let persona = porClave.get(clave);
    if (!persona) {
      persona = {
        clave,
        nombre: fila.user_name,
        userId: fila.user_id,
        suspension: null,
        vetoCana: null,
        vetosRuta: [],
        historial: [],
        ultima: fila.cuando,
      };
      porClave.set(clave, persona);
    }
    if (fila.cuando > persona.ultima) persona.ultima = fila.cuando;
    // El id manda sobre el nombre: si alguna fila lo trae, la persona existe.
    if (fila.user_id && !persona.userId) persona.userId = fila.user_id;

    switch (fila.tipo) {
      case 'cuenta':
        persona.suspension = { motivo: fila.motivo, cuando: fila.cuando };
        break;
      case 'cana':
        persona.vetoCana = { motivo: fila.motivo, cuando: fila.cuando };
        break;
      case 'ruta':
        persona.vetosRuta.push({
          routeId: fila.route_id ?? '',
          routeName: fila.route_name,
          motivo: fila.motivo,
          cuando: fila.cuando,
        });
        break;
      default:
        persona.historial.push({ accion: fila.accion, nota: fila.motivo, cuando: fila.cuando });
    }
  }

  // Primero quien tiene algo puesto (es lo accionable) y, dentro, lo mas
  // reciente arriba.
  return [...porClave.values()].sort((a, b) => {
    const pesoA = conAlgoVigente([a]).length;
    const pesoB = conAlgoVigente([b]).length;
    if (pesoA !== pesoB) return pesoB - pesoA;
    return b.ultima.localeCompare(a.ultima);
  });
}

export type FiltroModeracion = 'vigentes' | 'todas';

export function filtrarModeraciones(
  moderaciones: readonly Moderacion[],
  filtro: FiltroModeracion,
): Moderacion[] {
  return filtro === 'vigentes' ? conAlgoVigente(moderaciones) : [...moderaciones];
}
