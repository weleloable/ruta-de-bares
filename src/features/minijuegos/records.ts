import AsyncStorage from '@react-native-async-storage/async-storage';

import { aplicarPuntuacion, CLAVE_RECORDS, leerRecords, type Records } from './recordsReglas';

/** Records de este dispositivo (AsyncStorage; localStorage en web). Sin red ni cuenta. */
export async function cargarRecords(): Promise<Records> {
  try {
    return leerRecords(await AsyncStorage.getItem(CLAVE_RECORDS));
  } catch {
    // Almacen no disponible (modo privado): se juega igual, solo sin memoria.
    return {};
  }
}

/** Guarda la puntuacion si mejora el record. Devuelve si lo ha sido. */
export async function registrarPuntuacion(juego: string, puntuacion: number): Promise<boolean> {
  const { records, esRecord } = aplicarPuntuacion(await cargarRecords(), juego, puntuacion);
  if (!esRecord) return false;
  try {
    await AsyncStorage.setItem(CLAVE_RECORDS, JSON.stringify(records));
  } catch {
    return false;
  }
  return true;
}
