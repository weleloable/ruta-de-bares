import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { CATALOGO_BARES, type BarCatalogo } from './catalogo';
import {
  CLAVE_ALMACEN,
  crearBarPropio,
  fusionarCatalogo,
  leerPropios,
  nuevoId,
  serializarPropios,
  validarBarPropio,
  type BorradorBarPropio,
} from './catalogoPropio';

/**
 * Catalogo vivo: la lista cerrada del codigo mas los bares propios que el
 * admin va anadiendo. Los propios se guardan EN ESTE DISPOSITIVO (AsyncStorage:
 * localStorage en web), no en Supabase, porque esta prueba no toca el esquema.
 *
 * Limite que hay que tener presente: otro movil, otro navegador u otro admin
 * NO ven estos bares. Lo que si viaja es lo que se copia a `route_bars` al
 * anadir el bar a una ruta (nombre y posicion), no la imagen: los jugadores
 * veran un sello con iniciales. Compartirlo exige tabla y bucket en Postgres.
 *
 * Estado a nivel de modulo y no en un Provider para que BarLogo lo lea desde
 * cualquier pantalla sin envolver el arbol: useSyncExternalStore es para esto.
 */

let propios: BarCatalogo[] = [];
let fusion: readonly BarCatalogo[] = CATALOGO_BARES;
let carga: Promise<void> | null = null;
let ultimoCreado: string | null = null;
const oyentes = new Set<() => void>();

function publicar(nuevos: BarCatalogo[]): void {
  propios = nuevos;
  // Referencia nueva SOLO cuando cambia algo: useSyncExternalStore compara por
  // identidad y una referencia distinta en cada lectura entra en bucle.
  fusion = fusionarCatalogo(CATALOGO_BARES, propios);
  oyentes.forEach((oyente) => oyente());
}

/** Lee el almacen una sola vez; las llamadas siguientes esperan a la misma. */
function cargar(): Promise<void> {
  carga ??= (async () => {
    try {
      publicar(leerPropios(await AsyncStorage.getItem(CLAVE_ALMACEN)));
    } catch {
      // Almacen no disponible (modo privado, permisos): se sigue solo con la lista cerrada.
    }
  })();
  return carga;
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  void cargar();
  return () => {
    oyentes.delete(oyente);
  };
}

/** Lista cerrada + propios. Se actualiza sola cuando se anade un bar. */
export function useCatalogo(): readonly BarCatalogo[] {
  return useSyncExternalStore(suscribir, () => fusion, () => fusion);
}

/**
 * Valida, guarda en el dispositivo y deja el bar disponible en toda la app.
 * Lanza con los errores de validacion, o con un mensaje claro si el almacen
 * esta lleno. En ningun caso queda en memoria algo que no se guardo.
 */
export async function guardarBarPropio(borrador: BorradorBarPropio): Promise<BarCatalogo> {
  // Esperar a la carga: si no, guardar antes de leer machacaria lo que ya hubiera.
  await cargar();

  const errores = validarBarPropio(borrador, fusion);
  if (errores.length > 0) throw new Error(errores.join(' '));

  const bar = crearBarPropio(borrador, nuevoId(Date.now(), Math.random()));
  const nuevos = [...propios, bar];
  try {
    await AsyncStorage.setItem(CLAVE_ALMACEN, serializarPropios(nuevos));
  } catch {
    throw new Error('No se pudo guardar en este dispositivo. Prueba con una imagen mas pequena o libera espacio.');
  }

  publicar(nuevos);
  ultimoCreado = bar.id;
  return bar;
}

/**
 * Id del ultimo bar creado que aun no se ha usado, o null. Sirve para que el
 * formulario de bar lo deje elegido al volver de crearlo. Se consume: una
 * segunda lectura no lo repite, o cada vez que la pantalla ganase el foco
 * volveria a pisar la eleccion del admin.
 */
export function consumirUltimoCreado(): string | null {
  const id = ultimoCreado;
  ultimoCreado = null;
  return id;
}
