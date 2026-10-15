import { supabase } from '../../lib/supabase';
import type { BarCatalogo } from './catalogo';
import { aFilaCompartida, desdeFilaCompartida, NOMBRE_MAX, desdeFilasCompartidas, traducirErrorAlta } from './catalogoPropio';

/**
 * Llamadas a `catalog_bars` (0035). RLS: solo los admins leen y escriben, asi que
 * para un jugador `listarBaresCompartidos` devuelve una lista vacia, sin error.
 * Quien protege es Postgres; que la pantalla solo la abra un admin es comodidad.
 */

export async function listarBaresCompartidos(): Promise<BarCatalogo[]> {
  const { data, error } = await supabase
    .from('catalog_bars')
    .select('id, name, lat, lng, logo')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return desdeFilasCompartidas(data);
}

/** El nombre ya esta en la tabla (unique sin distinguir mayusculas). */
export class BarRepetido extends Error {
  constructor() {
    super(traducirErrorAlta({ code: '23505', message: '' }));
  }
}

/** Resultado de subir uno: ya estaba (unique de nombre) cuenta como hecho, no como fallo. */
export type ResultadoSubida = 'subido' | 'ya-estaba' | 'rechazado';

/**
 * Inserta un bar a nombre de quien tiene la sesion. Lanza con un mensaje para el
 * admin si falla (nombre repetido, sin permiso, sin red).
 */
export async function crearBarCompartido(bar: Pick<BarCatalogo, 'name' | 'lat' | 'lng' | 'logoUri'>): Promise<BarCatalogo> {
  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion.session?.user.id;
  if (!uid) throw new Error('Necesitas iniciar sesion para anadir un bar.');

  const { data, error } = await supabase
    .from('catalog_bars')
    .insert(aFilaCompartida(bar, uid))
    .select('id, name, lat, lng, logo')
    .single();
  if (error?.code === '23505') throw new BarRepetido();
  if (error) throw new Error(traducirErrorAlta(error));
  const creado = desdeFilaCompartida(data);
  if (!creado) throw new Error('El bar se guardo pero la respuesta no es valida. Recarga la pantalla.');
  return creado;
}

/**
 * Corrige nombre, ubicacion e imagen de un bar (0067). Solo el autor, o cualquier
 * admin si no tiene autor. Sin permiso Postgres no da error: filtra la fila y no
 * se actualiza ninguna, asi que "0 filas" se traduce a un mensaje claro.
 * `logoUri: null` quita la imagen.
 */
export async function actualizarBarCompartido(id: string, bar: { name: string; lat: number; lng: number; logoUri: string | null }): Promise<BarCatalogo> {
  const { data, error } = await supabase
    .from('catalog_bars')
    .update({ name: bar.name.trim().slice(0, NOMBRE_MAX), lat: bar.lat, lng: bar.lng, logo: bar.logoUri })
    .eq('id', id)
    .select('id, name, lat, lng, logo');
  if (error?.code === '23505') throw new BarRepetido();
  if (error) throw new Error(traducirErrorAlta(error));
  const editado = desdeFilaCompartida(data?.[0]);
  if (!editado) throw new Error('No se pudo editar: solo puede quien creó el bar (o cualquier admin si no tiene autor). Si lo borraron, vuelve a la lista.');
  return editado;
}

/**
 * Sube un bar que solo estaba en el dispositivo (creado antes de la 0035). No
 * lanza: la migracion de lo local es de fondo y no debe tumbar el editor.
 */
export async function subirBarLocal(bar: BarCatalogo): Promise<ResultadoSubida> {
  try {
    await crearBarCompartido(bar);
    return 'subido';
  } catch (e) {
    return e instanceof BarRepetido ? 'ya-estaba' : 'rechazado';
  }
}
