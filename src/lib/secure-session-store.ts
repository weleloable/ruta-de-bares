import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { joinChunks, splitChunks } from './chunk';

/**
 * Almacen de sesion de Supabase sobre expo-secure-store.
 *
 * expo-secure-store avisa (y en Android puede fallar) por encima de 2048 bytes
 * por valor, y una sesion de Supabase pasa de ahi. Se trocea el valor en varias
 * claves y se guarda un manifiesto con el numero de trozos.
 *
 * Orden de escritura, que es lo que da la seguridad: primero los trozos,
 * el manifiesto el ULTIMO. Si la app muere a mitad, el manifiesto sigue
 * apuntando a la sesion antigua completa o no existe; nunca a media sesion.
 */

// 1800 y no 2048: deja sitio al overhead de codificacion del keystore de Android.
const MAX_CHUNK_BYTES = 1800;

const manifestKey = (key: string) => key;
const chunkKey = (key: string, index: number) => `${key}.c${index}`;

async function deleteChunksFrom(key: string, start: number, end: number): Promise<void> {
  const borrados: Promise<void>[] = [];
  for (let i = start; i < end; i += 1) borrados.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  await Promise.all(borrados);
}

// Cuantos trozos sobrantes se buscan al limpiar. Una sesion de Supabase ronda
// los 2-3 trozos; 32 cubre cualquier cosa razonable sin barrer el keystore.
const MAX_STALE_LOOKAHEAD = 32;

const secureStore = {
  async getItem(key: string): Promise<string | null> {
    const manifiesto = await SecureStore.getItemAsync(manifestKey(key));
    if (manifiesto === null) return null;

    const total = Number.parseInt(manifiesto, 10);
    if (!Number.isInteger(total) || total < 1) {
      // Manifiesto corrupto: se limpia y se trata como sesion ausente, que
      // manda al usuario al login en vez de dejar la app en un estado raro.
      await secureStore.removeItem(key);
      return null;
    }

    const trozos = await Promise.all(
      Array.from({ length: total }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    if (trozos.some((trozo) => trozo === null)) {
      await secureStore.removeItem(key);
      return null;
    }

    return joinChunks(trozos as string[]);
  },

  async setItem(key: string, value: string): Promise<void> {
    const trozos = splitChunks(value, MAX_CHUNK_BYTES);
    const anterior = await SecureStore.getItemAsync(manifestKey(key));
    const totalAnterior = anterior === null ? 0 : Number.parseInt(anterior, 10);

    await Promise.all(
      trozos.map((trozo, i) => SecureStore.setItemAsync(chunkKey(key, i), trozo)),
    );
    await SecureStore.setItemAsync(manifestKey(key), String(trozos.length));

    // Solo despues de que el manifiesto sea valido se tiran los trozos sobrantes
    // de una sesion anterior mas larga.
    if (Number.isInteger(totalAnterior) && totalAnterior > trozos.length) {
      await deleteChunksFrom(key, trozos.length, totalAnterior);
    }
  },

  async removeItem(key: string): Promise<void> {
    const manifiesto = await SecureStore.getItemAsync(manifestKey(key));
    const total = manifiesto === null ? 0 : Number.parseInt(manifiesto, 10);
    // El manifiesto primero: a partir de aqui la sesion ya no existe para nadie.
    await SecureStore.deleteItemAsync(manifestKey(key));
    const hasta = Number.isInteger(total) && total > 0 ? total : MAX_STALE_LOOKAHEAD;
    await deleteChunksFrom(key, 0, hasta);
  },
};

/**
 * En web no hay keystore: supabase-js usa localStorage por su cuenta si no se
 * le pasa `storage`. Web es solo para desarrollo, la app real es nativa.
 */
export const sessionStorage = Platform.OS === 'web' ? undefined : secureStore;

