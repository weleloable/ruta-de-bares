/** Clave del almacen local. Versionada por si cambia la forma de los datos. */
export const CLAVE_RECORDS = 'minijuegos.records.v1';

export type Records = Record<string, number>;

/**
 * Marca de que el record de La Caña Perfecta de este dispositivo ya es de la escala
 * nueva (0069). Quien tenia un 97 de la escala vieja, mucho mas generosa, no veria
 * nunca "¡Nuevo record!" hasta pasar de 97 en una escala en la que 97 es de experto.
 */
export const CLAVE_ESCALA_CANA = 'minijuegos.cana-escala.v2';

/** Los records sin el de un juego (el resto, intacto). */
export function sinRecordDe(records: Records, juego: string): Records {
  const { [juego]: _quitado, ...resto } = records;
  return resto;
}

/**
 * Lee lo guardado sin fiarse de ello: el almacen lo puede haber tocado una
 * version anterior o el propio usuario, y un record corrupto no debe tumbar el menu.
 */
export function leerRecords(crudo: string | null): Records {
  if (!crudo) return {};
  try {
    const datos: unknown = JSON.parse(crudo);
    if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return {};
    const limpio: Records = {};
    for (const [juego, valor] of Object.entries(datos)) {
      if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) limpio[juego] = valor;
    }
    return limpio;
  } catch {
    return {};
  }
}

/**
 * Devuelve los records tras una partida y si esta ha sido nuevo record. Un
 * empate NO cuenta: celebrar "nuevo record" por igualar el anterior da igual de
 * ganas de jugar pero es mentira.
 */
export function aplicarPuntuacion(
  records: Records,
  juego: string,
  puntuacion: number,
): { records: Records; esRecord: boolean } {
  if (!Number.isFinite(puntuacion) || puntuacion < 0) return { records, esRecord: false };
  const anterior = records[juego];
  if (anterior !== undefined && puntuacion <= anterior) return { records, esRecord: false };
  // Dos decimales y no un entero: La Caña Perfecta puntua con decimales (nota.ts). Los demas
  // juegos puntuan en enteros, que este redondeo deja como estan.
  return { records: { ...records, [juego]: Math.round(puntuacion * 100) / 100 }, esRecord: true };
}
