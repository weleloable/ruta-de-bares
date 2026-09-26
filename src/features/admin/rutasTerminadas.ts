/**
 * El aviso de "esta ruta ha terminado y hay que borrarla" que sale arriba de
 * Alertas de administracion, a todos los admins (0033).
 *
 * Por que existe: borrar una ruta es lo que se lleva los datos de la gente que
 * participo (0027), y la politica promete un maximo de DIAS_CONSERVACION dias
 * tras el evento. No hay cron: si nadie pulsa Borrar, los datos se quedan. El
 * aviso del editor solo lo ve quien entra al editor; este sale donde los admins
 * miran siempre, y enciende el punto rojo hasta que cada uno lo ha visto.
 *
 * El aviso se queda hasta que la ruta se borra. Lo que se apaga al verlo es el
 * punto rojo (`rutasSinVer`).
 *
 * Sin imports (se prueba con node --test, que no resuelve rutas sin extension):
 * cuando termino cada ruta lo calcula `terminoEl` (routes/estado.ts) y el
 * formato de fecha llega como parametro.
 */

export type RutaTerminada = { routeId: string; nombre: string; terminoEl: Date };

export type AvisoRutaTerminada = {
  routeId: string;
  titulo: string;
  cuerpo: string;
  /** Dias hasta el limite; 0 o menos = ya paso. Ordena los avisos. */
  diasQuedan: number;
};

const DIA_MS = 86_400_000;

export const COLETILLA_PURGA = 'Al borrarla, también se borrarán todos los datos de la gente que participó en ella.';

export function avisosDeRutasTerminadas(
  rutas: readonly RutaTerminada[],
  ahora: Date,
  diasConservacion: number,
  fecha: (d: Date) => string,
): AvisoRutaTerminada[] {
  return rutas
    .map((ruta) => {
      const limite = new Date(ruta.terminoEl.getTime() + diasConservacion * DIA_MS);
      const diasQuedan = Math.ceil((limite.getTime() - ahora.getTime()) / DIA_MS);

      let plazo: string;
      if (diasQuedan > 1) plazo = `Hay que borrarla antes del ${fecha(limite)}: quedan ${diasQuedan} días.`;
      else if (diasQuedan === 1) plazo = `Hay que borrarla antes del ${fecha(limite)}: queda 1 día.`;
      else plazo = `El plazo para borrarla terminó el ${fecha(limite)}.`;

      return {
        routeId: ruta.routeId,
        titulo: `La ruta «${ruta.nombre}» ha terminado`,
        cuerpo: `Terminó el ${fecha(ruta.terminoEl)}. ${plazo} ${COLETILLA_PURGA}`,
        diasQuedan,
      };
    })
    .sort((a, b) => a.diasQuedan - b.diasQuedan);
}

/** Cuantos avisos no ha visto todavia este admin: es lo que cuenta el punto rojo. */
export function rutasSinVer(avisos: readonly AvisoRutaTerminada[], vistas: ReadonlySet<string>): number {
  return avisos.filter((a) => !vistas.has(a.routeId)).length;
}
