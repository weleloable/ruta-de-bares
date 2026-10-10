import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { supabase } from '../../lib/supabase';
import { CATALOGO_BARES, type BarCatalogo } from './catalogo';
import { crearBarCompartido, listarBaresCompartidos, subirBarLocal } from './catalogoCompartido';
import {
  CLAVE_ALMACEN,
  fusionarCatalogo,
  leerPropios,
  pendientesDeSubir,
  validarBarPropio,
  type BorradorBarPropio,
} from './catalogoPropio';

/**
 * Catalogo vivo: la lista cerrada del codigo mas los bares propios que los
 * admins van anadiendo. Los propios viven en Postgres (`catalog_bars`, 0035) y
 * los ven y los crean TODOS los admins; para un jugador la tabla sale vacia por
 * RLS y el catalogo es solo la lista cerrada. El logo de un bar propio le llega
 * al jugador por otro camino: se copia a `route_bars.logo` al anadir la parada.
 *
 * Antes de la 0035 los propios se guardaban en este dispositivo (AsyncStorage:
 * localStorage en web). Los que quedaron ahi se SUBEN la primera vez que un
 * admin abre el catalogo y, si todos suben (o ya estaban), se borra la copia
 * local. Si algo falla se quedan donde estan y se reintenta al siguiente
 * arranque: un bar nunca se pierde por una migracion a medias.
 *
 * Estado a nivel de modulo y no en un Provider para que BarLogo lo lea desde
 * cualquier pantalla sin envolver el arbol: useSyncExternalStore es para esto.
 */

let compartidos: BarCatalogo[] = [];
// Los del dispositivo que aun no estan en la tabla (sin sesion de admin, sin red...).
let locales: BarCatalogo[] = [];
let fusion: readonly BarCatalogo[] = CATALOGO_BARES;
let carga: Promise<void> | null = null;
let ultimoCreado: string | null = null;
// Cada recarga invalida las que siguen en vuelo: si no, una respuesta vieja
// (de otra cuenta, o de antes de iniciar sesion) pisaria la nueva.
let generacion = 0;
let usuarioCargado: string | null = null;
let escuchandoSesion = false;
const oyentes = new Set<() => void>();

function publicar(nuevosCompartidos: BarCatalogo[], nuevosLocales: BarCatalogo[]): void {
  compartidos = nuevosCompartidos;
  locales = nuevosLocales;
  // Referencia nueva SOLO cuando cambia algo: useSyncExternalStore compara por
  // identidad y una referencia distinta en cada lectura entra en bucle.
  fusion = fusionarCatalogo(CATALOGO_BARES, [...compartidos, ...locales]);
  oyentes.forEach((oyente) => oyente());
}

async function leerLocales(): Promise<BarCatalogo[]> {
  try {
    return leerPropios(await AsyncStorage.getItem(CLAVE_ALMACEN));
  } catch {
    // Almacen no disponible (modo privado, permisos): no hay nada que migrar.
    return [];
  }
}

async function leerCompartidos(): Promise<BarCatalogo[] | null> {
  try {
    return await listarBaresCompartidos();
  } catch {
    // Sin sesion o sin red: se sigue con lo que haya, y se reintenta al volver a cargar.
    return null;
  }
}

async function cargarDeVerdad(mia: number): Promise<void> {
  const delDispositivo = await leerLocales();
  let remotos = await leerCompartidos();
  if (mia !== generacion) return;
  publicar(remotos ?? [], delDispositivo);
  // Sin tabla (sin red, sin sesion todavia) la carga NO se da por buena: la
  // siguiente llamada a cargar() (otro suscriptor, guardar un bar) lo reintenta.
  if (remotos === null) carga = null;

  // Migracion de lo creado antes de la 0035. Solo con la tabla accesible: sin
  // ella no se sabe que esta ya subido.
  if (remotos === null || delDispositivo.length === 0) return;
  const pendientes = pendientesDeSubir(delDispositivo, remotos);
  let rechazados = 0;
  for (const bar of pendientes) {
    // Antes de cada alta y no solo despues: los bares del dispositivo no son de
    // una cuenta, y si entra otra a mitad se subirian a su nombre.
    if (mia !== generacion) return;
    if ((await subirBarLocal(bar)) === 'rechazado') {
      rechazados += 1;
      // Un jugador (RLS) o un admin sin red: el resto va a fallar igual, no se
      // manda un 42501 de 40 KB por bar en cada arranque.
      break;
    }
  }
  // Las copias locales se quedan y se reintenta al siguiente arranque.
  if (rechazados > 0) return;

  const despues = await leerCompartidos();
  // Si esta segunda lectura falla se deja todo como esta (los locales siguen
  // visibles): publicar con la lista vieja los haria desaparecer hasta la
  // siguiente carga.
  if (mia !== generacion || despues === null) return;
  remotos = despues;
  try {
    await AsyncStorage.removeItem(CLAVE_ALMACEN);
  } catch {
    // Si no se pudo borrar, la proxima carga las vera como "ya estaban" y lo intentara de nuevo.
  }
  publicar(remotos, []);
}

/** Lee el catalogo una sola vez; las llamadas siguientes esperan a la misma. */
function cargar(): Promise<void> {
  carga ??= cargarDeVerdad(generacion);
  return carga;
}

function recargar(): void {
  generacion += 1;
  carga = null;
  // Lo de la cuenta anterior no se ensena ni un instante a la nueva.
  publicar([], locales);
  if (oyentes.size > 0) void cargar();
}

/**
 * Vuelve a leer cuando cambia QUIEN esta dentro. El catalogo puede pedirse antes
 * de que la sesion este lista (y entonces sale vacio) o con la sesion de otra
 * cuenta del mismo dispositivo. No se recarga por cada SIGNED_IN: en web
 * supabase-js lo emite al volver a enfocar la pestana y son logos de 40 KB.
 */
function escucharSesion(): void {
  if (escuchandoSesion) return;
  escuchandoSesion = true;
  supabase.auth.onAuthStateChange((evento, sesion) => {
    const uid = sesion?.user.id ?? null;
    if (evento === 'SIGNED_OUT') {
      usuarioCargado = null;
      generacion += 1;
      carga = null;
      publicar([], []);
      return;
    }
    if (uid && uid !== usuarioCargado && (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION')) {
      usuarioCargado = uid;
      recargar();
    }
  });
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  escucharSesion();
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
 * Valida, guarda en Postgres y deja el bar disponible en toda la app (y, al
 * recargar, en la de los demas admins). Lanza con los errores de validacion, o
 * con un mensaje claro si la tabla lo rechaza. En ningun caso queda en memoria
 * algo que no se guardo.
 */
export async function guardarBarPropio(borrador: BorradorBarPropio): Promise<BarCatalogo> {
  // Esperar a la carga: si no, se validaria contra un catalogo todavia incompleto.
  await cargar();

  const errores = validarBarPropio(borrador, fusion);
  if (errores.length > 0) throw new Error(errores.join(' '));
  // validarBarPropio ya comprobo el punto; esto es para el tipado.
  if (!borrador.punto) throw new Error('Marca la ubicacion del bar en el mapa.');

  // Una carga ya en vuelo habria leido antes de este alta y publicaria sin el
  // bar nuevo: se invalida (si era la migracion, se reintenta al arrancar).
  generacion += 1;
  const bar = await crearBarCompartido({
    name: borrador.nombre,
    lat: borrador.punto.lat,
    lng: borrador.punto.lng,
    ...(borrador.logoUri ? { logoUri: borrador.logoUri } : {}),
  });

  publicar([...compartidos, bar], locales);
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
