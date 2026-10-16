import AsyncStorage from '@react-native-async-storage/async-storage';

import { esMejorNota } from './nota';
import { aplicarPuntuacion, CLAVE_ESCALA_CANA, CLAVE_RECORDS, leerRecords, sinRecordDe, type Records } from './recordsReglas';

/** Records de este dispositivo (AsyncStorage; localStorage en web). Sin red ni cuenta. */
export async function cargarRecords(): Promise<Records> {
  try {
    let records = leerRecords(await AsyncStorage.getItem(CLAVE_RECORDS));
    // La primera vez tras la 0069: el record de la caña es de la escala vieja y se descarta.
    // Solo ese; los de los demas juegos no cambian. Pasa antes de jugar nada, porque
    // registrarPuntuacion tambien carga los records.
    if ((await AsyncStorage.getItem(CLAVE_ESCALA_CANA)) === null) {
      if ('cana-perfecta' in records) {
        records = sinRecordDe(records, 'cana-perfecta');
        await AsyncStorage.setItem(CLAVE_RECORDS, JSON.stringify(records));
      }
      await AsyncStorage.setItem(CLAVE_ESCALA_CANA, '1');
    }
    return records;
  } catch {
    // Almacen no disponible (modo privado): se juega igual, solo sin memoria.
    return {};
  }
}

/** Guarda la puntuacion si mejora el record. Devuelve si lo ha sido. */
export async function registrarPuntuacion(juego: string, puntuacion: number): Promise<boolean> {
  const { records, esRecord } = aplicarPuntuacion(await cargarRecords(), juego, puntuacion, (nueva, anterior) =>
    esMejorNota(juego, nueva, anterior),
  );
  if (!esRecord) return false;
  try {
    await AsyncStorage.setItem(CLAVE_RECORDS, JSON.stringify(records));
  } catch {
    return false;
  }
  return true;
}
