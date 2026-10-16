import AsyncStorage from '@react-native-async-storage/async-storage';

import { aplicarPuntuacion, leerRecords, MAS_ES_MEJOR, type Records } from '../../recordsReglas';

/**
 * Tu mejor distancia en "¿Conduces tú?", en ESTE movil, por ruta y nivel de
 * cañas. Es la red cuando no hay ruta o no hay red: el ranking de verdad es el
 * de la ruta (0041). Reusa las reglas de los records del menu, con otra clave.
 */
const CLAVE = 'minijuegos.conduces.records.v1';

const id = (rutaId: string | null, nivel: number) => `${rutaId ?? 'sin-ruta'}:${nivel}`;

async function leer(): Promise<Records> {
  try {
    return leerRecords(await AsyncStorage.getItem(CLAVE));
  } catch {
    return {};
  }
}

export async function recordLocal(rutaId: string | null, nivel: number): Promise<number | null> {
  return (await leer())[id(rutaId, nivel)] ?? null;
}

/** Guarda la distancia si mejora. Devuelve si es record y el que habia antes. */
export async function registrarDistanciaLocal(
  rutaId: string | null,
  nivel: number,
  metros: number,
): Promise<{ esRecord: boolean; anterior: number | null }> {
  const records = await leer();
  const anterior = records[id(rutaId, nivel)] ?? null;
  const r = aplicarPuntuacion(records, id(rutaId, nivel), Math.round(metros), MAS_ES_MEJOR);
  if (r.esRecord) {
    try {
      await AsyncStorage.setItem(CLAVE, JSON.stringify(r.records));
    } catch {
      // Sin almacen: el ranking de la ruta sigue valiendo.
    }
  }
  return { esRecord: r.esRecord, anterior };
}
